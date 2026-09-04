import type { DeliveryStage } from "../types/delivery.ts";
import type { ErrorHook, HookContext, Plugin, PluginHook } from "../types/plugin.ts";
import type { NuntiusError } from "../errors/index.ts";
export type { Plugin, PluginHook, ErrorHook, StageFields } from "../types/plugin.ts";

export type DefinePluginInput = {
  id: string;
  hooks?: Partial<Record<`before:${DeliveryStage}` | `after:${DeliveryStage}`, PluginHook>> & {
    onError?: ErrorHook;
  };
};

export function definePlugin(config: DefinePluginInput): Plugin {
  return Object.freeze({
    id: config.id,
    hooks: config.hooks ? Object.freeze({ ...config.hooks }) : undefined,
  });
}

export async function runHooks(
  hooks: ReadonlyArray<PluginHook | undefined>,
  stage: DeliveryStage,
  ctx: Omit<HookContext, "stage">,
): Promise<void> {
  for (const hook of hooks) {
    if (hook) {
      await hook({ ...ctx, stage });
    }
  }
}

export async function runErrorHooks(
  hooks: ReadonlyArray<ErrorHook | undefined>,
  ctx: Omit<HookContext, "stage"> & { stage: DeliveryStage; error: NuntiusError },
): Promise<void> {
  for (const hook of hooks) {
    if (hook) {
      await hook(ctx);
    }
  }
}
