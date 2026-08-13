import type { DeliveryStage } from "./delivery.ts";
import type { Recipient } from "./send.ts";

export type HookName = `before:${DeliveryStage}` | `after:${DeliveryStage}`;

export type BaseHookContext = {
  notificationId: string;
  payload: unknown;
  recipient: Recipient;
};

export type SendHookContext<S extends DeliveryStage> = BaseHookContext & { stage: S };

export type HookContext = SendHookContext<DeliveryStage>;

export type PluginHook = (ctx: HookContext) => void | Promise<void>;

export type Plugin = {
  id: string;
  hooks?: Partial<Record<HookName, PluginHook>>;
};
