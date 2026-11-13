import { Injectable, Logger } from "@nestjs/common";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends email. Until Amazon SES is connected (it arrives with the
 * infrastructure work), messages are written to the log and kept in memory so
 * tests and local development can read them.
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger("Mailer");
  /** The most recent messages, newest last. Development and tests only. */
  readonly sent: Mail[] = [];

  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    if (this.sent.length > 50) this.sent.shift();
    this.logger.log(`To ${mail.to}: ${mail.subject}\n${mail.text}`);
  }
}
