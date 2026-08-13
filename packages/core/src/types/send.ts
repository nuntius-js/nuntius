import type { NuntiusError } from "../errors/index.ts";
import type { DeliveryStatus } from "./delivery.ts";

export type Recipient = { userId: string };

export type Contact = {
  email?: string;
  phone?: string;
  pushToken?: string;
  [key: string]: string | undefined;
};

export type RecipientResolver = (to: Recipient) => Contact | Promise<Contact>;

export type SendOptions<P> = {
  to: Recipient | Contact;
  payload: P;
  resolver?: RecipientResolver;
};

export type SendResult<P = unknown> = {
  status: DeliveryStatus;
  notificationId: string;
  messageId: string | null;
  channel: string;
  error?: NuntiusError;
};

export type BatchOptions<P> = SendOptions<P> & { idempotencyKey?: string };

export type BatchResult<P = unknown> = {
  results: SendResult<P>[];
  failures: SendResult<P>[];
};
