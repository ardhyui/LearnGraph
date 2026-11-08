/**
 * Sending email (Roadmap M3: password reset and email verification). Server
 * only. One provider for now, chosen because it needs no dependency: Resend's
 * HTTP API, enabled by `RESEND_API_KEY` and `EMAIL_FROM` (decision D7 may
 * swap it). Without them, development prints the message to the server log
 * and production does not offer the features that need email.
 */
const env = (key: string) => process.env[key]?.trim() || undefined;

export function emailConfigured(): boolean {
  return !!(env('RESEND_API_KEY') && env('EMAIL_FROM'));
}

const isProduction = () => process.env.NODE_ENV === 'production';

/** Password reset is offered when email can be sent (or the server is a dev server). */
export function passwordResetAvailable(): boolean {
  return emailConfigured() || !isProduction();
}

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(message: Email): Promise<void> {
  if (emailConfigured()) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env('EMAIL_FROM'), to: [message.to], subject: message.subject, text: message.text }),
    });
    if (!res.ok) throw new Error(`Email provider refused the message (HTTP ${res.status}).`);
    return;
  }
  if (!isProduction()) {
    // Development only: the link is printed instead of sent, and kept in an
    // outbox file when DEV_EMAIL_OUTBOX is set (the smoke test reads it).
    console.info(`[email] to ${message.to}: ${message.subject}\n${message.text}`);
    const outbox = env('DEV_EMAIL_OUTBOX');
    if (outbox) {
      const { appendFile } = await import('node:fs/promises');
      await appendFile(outbox, `${JSON.stringify({ ...message, at: new Date().toISOString() })}\n`);
    }
    return;
  }
  throw new Error('Email is not configured on this server.');
}

export function passwordResetEmail(to: string, url: string): Email {
  return {
    to,
    subject: 'Reset your LearnGraph password',
    text: [
      'Someone (hopefully you) asked to reset the password of your LearnGraph account.',
      '',
      `Choose a new password here (the link works for one hour): ${url}`,
      '',
      'If you did not ask for this, ignore this email; your password stays the same.',
    ].join('\n'),
  };
}

export function verificationEmail(to: string, url: string): Email {
  return {
    to,
    subject: 'Confirm your LearnGraph email address',
    text: ['Confirm that this is your email address:', url, '', 'If you did not create a LearnGraph account, ignore this email.'].join('\n'),
  };
}
