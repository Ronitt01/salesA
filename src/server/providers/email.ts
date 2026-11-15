import "server-only";

/**
 * Email delivery provider interface.
 *
 * Only the mock exists today. It never transmits anything and says so in its
 * result. A real adapter (for example SMTP or a transactional email API) is added
 * by implementing this interface and returning it from `getEmailProvider`; nothing
 * about a real provider's API is assumed here.
 */
export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
  /** Passed to the provider so a retry cannot create a second send. */
  idempotencyKey: string;
}

export interface EmailSendResult {
  /** False means nothing left the system. */
  transmitted: boolean;
  providerMessageId: string | null;
  provider: string;
}

export interface EmailDeliveryProvider {
  readonly name: string;
  /** True only for an adapter that really transmits email. */
  readonly canTransmit: boolean;
  send(email: OutboundEmail): Promise<EmailSendResult>;
}

class MockEmailProvider implements EmailDeliveryProvider {
  readonly name = "mock";
  readonly canTransmit = false;

  async send(): Promise<EmailSendResult> {
    return { transmitted: false, providerMessageId: null, provider: this.name };
  }
}

export function getEmailProvider(): EmailDeliveryProvider {
  return new MockEmailProvider();
}
