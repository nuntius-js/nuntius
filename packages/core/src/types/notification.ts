import type * as z from "zod";

export const CONTACT_KINDS = ["email", "phone", "pushToken"] as const;

export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CHANNEL_NEEDS = [...CONTACT_KINDS, "none"] as const;

export type ChannelNeeds = (typeof CHANNEL_NEEDS)[number];

export const BUILTIN_CHANNEL_NEEDS = { email: "email", sms: "phone", push: "pushToken" } as const;

export type ChannelConfig = {
  readonly channel: string;
  readonly needs: ChannelNeeds;
  [key: string]: unknown;
};

export type EmailChannel = ChannelConfig & {
  readonly channel: "email";
  readonly needs: "email";
  from?: string;
  subject?: string;
};

export type SmsChannel = ChannelConfig & {
  readonly channel: "sms";
  readonly needs: "phone";
  from?: string;
};

export type PushChannel = ChannelConfig & {
  readonly channel: "push";
  readonly needs: "pushToken";
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
