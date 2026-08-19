import type { ChannelConfig } from "../types/notification.ts";
import type { Contact, Recipient } from "../types/send.ts";

export type DeliveryContext = {
  notificationId: string;
  config: Readonly<ChannelConfig>;
  payload: unknown;
  recipient?: Recipient;
  contact: Contact;
};

export type ProviderSendResult =
  | { success: true; messageId: string | null }
  | { success: false; error: unknown; messageId?: string | null };

export type ProviderAdapter = {
  name: string;
  send(ctx: DeliveryContext): Promise<ProviderSendResult>;
};

export { mockProvider } from "./mock.ts";
export type { MockProvider, MockProviderOptions } from "./mock.ts";
