import type { AnyNotificationDefinition } from "./notification.ts";
import type { Plugin } from "./plugin.ts";
import type { BatchOptions, BatchResult, SendOptions, SendResult } from "./send.ts";

export type ProviderSendResult =
  | { success: true; messageId: string | null }
  | { success: false; error: unknown; messageId?: string | null };

export type ProviderAdapter = {
  name: string;
  send(ctx: unknown): Promise<ProviderSendResult>;
};

export type NotificationMethods<P> = {
  send(opts: SendOptions<P>): Promise<SendResult<P>>;
  batch(items: BatchOptions<P>[]): Promise<BatchResult<P>>;
};

export type NuntiusConfig<
  Notifications extends ReadonlyArray<AnyNotificationDefinition> =
    ReadonlyArray<AnyNotificationDefinition>,
> = {
  notifications: Notifications;
  providers: Record<string, ProviderAdapter>;
  plugins?: ReadonlyArray<Plugin>;
};

export type NuntiusInstance<Notifications extends ReadonlyArray<AnyNotificationDefinition>> = {
  [N in Notifications[number] as N["nuntiusId"]]: NotificationMethods<N["_payload"]>;
};
