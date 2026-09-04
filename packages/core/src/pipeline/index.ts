import type { NotificationDefinition } from "../types/notification.ts";
import type { DeliveryStage } from "../types/delivery.ts";
import type { SendOptions, SendResult } from "../types/send.ts";
import type { ProviderAdapter } from "../provider/index.ts";
import type { Plugin, PluginHook, ErrorHook, StageFields } from "../plugin/index.ts";
import { NuntiusError } from "../errors/index.ts";
import { validate } from "./validate.ts";
import { resolve } from "./resolve.ts";
import { deliver } from "./deliver.ts";
import { finalize } from "./finalize.ts";
import { runHooks, runErrorHooks } from "../plugin/index.ts";

export type RunPipelineInput<P> = {
  definition: NotificationDefinition<P>;
  options: SendOptions<P>;
  providers: Record<string, ProviderAdapter>;
  hooks?: HooksByStage;
};

export type HooksByStage = {
  [K in StageFields<DeliveryStage>]: PluginHook[];
} & { onError: ErrorHook[] };

const STAGE_ENTRIES = [
  ["before:validate", "beforeValidate"],
  ["after:validate", "afterValidate"],
  ["before:resolve", "beforeResolve"],
  ["after:resolve", "afterResolve"],
  ["before:deliver", "beforeDeliver"],
  ["after:deliver", "afterDeliver"],
  ["before:finalize", "beforeFinalize"],
  ["after:finalize", "afterFinalize"],
] as const;

export function collectHooks(plugins: ReadonlyArray<Plugin>): HooksByStage {
  const result: HooksByStage = {
    beforeValidate: [],
    afterValidate: [],
    beforeResolve: [],
    afterResolve: [],
    beforeDeliver: [],
    afterDeliver: [],
    beforeFinalize: [],
    afterFinalize: [],
    onError: [],
  };
  for (const plugin of plugins) {
    if (!plugin.hooks) continue;
    for (const [hookName, field] of STAGE_ENTRIES) {
      const hook = plugin.hooks[hookName];
      if (hook) {
        result[field].push(hook);
      }
    }
    if (plugin.hooks.onError) {
      result.onError.push(plugin.hooks.onError);
    }
  }
  return result;
}

export async function runPipeline<P>(input: RunPipelineInput<P>): Promise<SendResult<P>> {
  const { definition, options, providers } = input;
  const hooks = input.hooks ?? collectHooks([]);

  let payload: unknown;
  let currentStage: DeliveryStage = "validate";
  try {
    currentStage = "validate";
    await runHooks(hooks.beforeValidate, "validate", {
      notificationId: definition.nuntiusId,
      payload: options.payload,
      recipient: undefined,
    });
    payload = validate(definition.schema, options.payload, definition.nuntiusId);
    await runHooks(hooks.afterValidate, "validate", {
      notificationId: definition.nuntiusId,
      payload: options.payload,
      recipient: undefined,
    });

    currentStage = "resolve";
    await runHooks(hooks.beforeResolve, "resolve", {
      notificationId: definition.nuntiusId,
      payload: options.payload,
      recipient: undefined,
    });
    const resolved = await resolve(options.to, options.resolver, definition.nuntiusId);
    await runHooks(hooks.afterResolve, "resolve", {
      notificationId: definition.nuntiusId,
      payload: options.payload,
      recipient: resolved.recipient,
    });

    currentStage = "deliver";
    await runHooks(hooks.beforeDeliver, "deliver", {
      notificationId: definition.nuntiusId,
      payload,
      recipient: resolved.recipient,
    });
    const delivered = await deliver({
      notificationId: definition.nuntiusId,
      channels: definition.channels,
      payload,
      recipient: resolved.recipient,
      contact: resolved.contact,
      providers,
    });
    await runHooks(hooks.afterDeliver, "deliver", {
      notificationId: definition.nuntiusId,
      payload,
      recipient: resolved.recipient,
    });

    currentStage = "finalize";
    await runHooks(hooks.beforeFinalize, "finalize", {
      notificationId: definition.nuntiusId,
      payload,
      recipient: resolved.recipient,
    });
    const result = finalize({
      notificationId: definition.nuntiusId,
      channel: delivered.channel.channel,
      messageId: delivered.result.success ? delivered.result.messageId : null,
    });
    await runHooks(hooks.afterFinalize, "finalize", {
      notificationId: definition.nuntiusId,
      payload,
      recipient: resolved.recipient,
    });
    return result;
  } catch (error) {
    const nuntiusError =
      error instanceof NuntiusError
        ? error
        : new NuntiusError({
            message: `Unexpected error while sending notification '${definition.nuntiusId}': ${error instanceof Error ? error.message : String(error)}`,
            code: "UNKNOWN_ERROR",
            notificationId: definition.nuntiusId,
            cause: error,
          });
    await runErrorHooks(hooks.onError, {
      notificationId: definition.nuntiusId,
      payload,
      recipient: undefined,
      stage: currentStage,
      error: nuntiusError,
    });
    return finalize({
      notificationId: definition.nuntiusId,
      channel: nuntiusError.channel ?? "",
      messageId: null,
      error: nuntiusError,
    });
  }
}

export { validate } from "./validate.ts";
export { isRecipient, resolve } from "./resolve.ts";
export type { ResolvedRecipient } from "./resolve.ts";
export { pickChannel, deliver } from "./deliver.ts";
export type { DeliverInput, DeliverResult } from "./deliver.ts";
export { finalize } from "./finalize.ts";
export type { FinalizeInput } from "./finalize.ts";
