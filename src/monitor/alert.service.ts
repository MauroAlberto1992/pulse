import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, Config } from '../config';
import { escapeHtml, formatDuration } from '../status/views';

/** Incident emails through Brevo's transactional API. Never throws: a failed alert is logged. */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  incidentOpened(target: string, cause: string | null): Promise<void> {
    return this.send(
      `🔴 ${target} is DOWN`,
      `<p><strong>${escapeHtml(target)}</strong> failed ${this.config.failureThreshold} checks in a row.</p>
<p>Cause: ${escapeHtml(cause ?? 'unknown')}</p>`,
    );
  }

  incidentClosed(target: string, downForMs: number): Promise<void> {
    return this.send(
      `🟢 ${target} recovered`,
      `<p><strong>${escapeHtml(target)}</strong> is back up after ${formatDuration(downForMs)}.</p>`,
    );
  }

  private async send(subject: string, html: string): Promise<void> {
    const { brevoApiKey, alertFrom, alertTo } = this.config;
    if (brevoApiKey === null || alertFrom === null || alertTo === null) {
      this.logger.warn(`Alerts not configured, not sent: ${subject}`);
      return;
    }
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { email: alertFrom, name: 'Pulse' },
          to: [{ email: alertTo }],
          subject: `[pulse] ${subject}`,
          htmlContent: `${html}<p><a href="https://pulse.espion.pt">pulse.espion.pt</a></p>`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok === false) {
        this.logger.error(
          `Brevo rejected alert "${subject}": HTTP ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Could not send alert "${subject}": ${(error as Error).name}`,
      );
    }
  }
}
