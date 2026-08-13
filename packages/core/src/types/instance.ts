import type { AnyNotificationDefinition } from "./notification.ts";
import type { Plugin } from "./plugin.ts";
import type { BatchOptions, BatchResult, SendOptions, SendResult } from "./send.ts";

export type ProviderAdapter = {
  name: string;
  channels: ReadonlyArray<string>;
  send(ctx: unknown): Promise<{ success: boolean; messageId: string; error?: unknown }>;
};

export type NotificationMethods<P> = {
  send(opts: SendOptions<P>): Promise<SendResult<P>>;
  batch(items: BatchOptions<P>[]): Promise<BatchResult<P>>;
};

export type NuntiusConfig<Notifications extends ReadonlyArray<AnyNotificationDefinition> = []> = {
  notifications?: Notifications;
  providers: ReadonlyArray<ProviderAdapter>;
  plugins?: ReadonlyArray<Plugin>;
};

export type NuntiusInstance<Notifications extends ReadonlyArray<AnyNotificationDefinition>> = {
  [N in Notifications[number] as N["nuntiusId"]]: NotificationMethods<N["_payload"]>;
};
