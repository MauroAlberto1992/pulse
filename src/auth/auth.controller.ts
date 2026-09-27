import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CONFIG, Config } from '../config';
import { loginPage } from '../status/views';
import { LoginLimiter } from './login-limiter';
import { verifyPassword } from './password';
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from './session';
import { verifyTotp } from './totp';

@Controller()
export class AuthController {
  private readonly limiter = new LoginLimiter();

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Get('login')
  @Header('Content-Type', 'text/html; charset=utf-8')
  form(): string {
    return loginPage({ totp: this.config.totpSecret !== null });
  }

  @Post('login')
  async login(
    @Body() body: { password?: string; code?: string },
    @Res() res: Response,
  ): Promise<void> {
    const totp = this.config.totpSecret !== null;
    const fail = (message: string) => {
      res
        .status(401)
        .type('html')
        .send(loginPage({ totp, error: message }));
    };

    if (this.limiter.isLocked()) {
      fail('Too many failed attempts. Try again in 15 minutes.');
      return;
    }

    const passwordOk = await verifyPassword(
      body.password ?? '',
      this.config.passwordHash,
    );
    const codeOk =
      this.config.totpSecret === null ||
      verifyTotp(this.config.totpSecret, body.code ?? '');
    if (passwordOk === false || codeOk === false) {
      this.limiter.recordFailure();
      fail(totp ? 'Wrong password or code.' : 'Wrong password.');
      return;
    }

    this.limiter.reset();
    res.cookie(SESSION_COOKIE, createSession(this.config.sessionSecret), {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'strict',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    res.redirect(303, '/');
  }

  // Sessions are stateless, so this only clears the cookie; rotate SESSION_SECRET to revoke all.
  @Post('logout')
  logout(@Res() res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.redirect(303, '/login');
  }
}
