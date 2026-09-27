import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CONFIG, Config } from '../config';
import { isValidSession, readCookie, SESSION_COOKIE } from './session';

/** Page routes: no valid session → redirect to /login. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (isValidSession(this.config.sessionSecret, token)) {
      return true;
    }
    http.getResponse<Response>().redirect(303, '/login');
    return false;
  }
}
