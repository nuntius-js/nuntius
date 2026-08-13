import type * as z from "zod";

export type ChannelConfig = { readonly channel: string; [key: string]: unknown };

export type EmailChannel = ChannelConfig & {
  readonly channel: "email";
  from?: string;
  subject?: string;
};

export type SmsChannel = ChannelConfig & {
  readonly channel: "sms";
  from?: string;
};

export type PushChannel = ChannelConfig & {
  readonly channel: "push";
  title?: string;
};

export type BuiltinChannel = EmailChannel | SmsChannel | PushChannel;

export type NotificationDefinition<P> = {
  readonly nuntiusId: string;
  readonly schema: z.ZodType<P>;
  readonly channels: ReadonlyArray<ChannelConfig>;
  readonly _payload: P;
};

export type AnyNotificationDefinition = NotificationDefinition<unknown>;
