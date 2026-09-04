import type { NotificationDefinition } from "../types/notification.ts";
import type { SendOptions, SendResult, BatchResult, FailedSendResult } from "../types/send.ts";
import type { ProviderAdapter } from "../provider/index.ts";
import type { Plugin } from "../plugin/index.ts";
import { NuntiusError } from "../errors/index.ts";
import { runPipeline, collectHooks } from "../pipeline/index.ts";

export type SendInput<P> = {
  definition: NotificationDefinition<P>;
  options: SendOptions<P>;
  providers: Record<string, ProviderAdapter>;
  plugins?: ReadonlyArray<Plugin>;
};

export async function send<P>(input: SendInput<P>): Promise<SendResult<P>> {
  const hooks = input.plugins ? collectHooks(input.plugins) : undefined;
  return runPipeline({
    definition: input.definition,
    options: input.options,
    providers: input.providers,
    hooks,
  });
}

export type BatchInput<P> = {
  definition: NotificationDefinition<P>;
  items: ReadonlyArray<SendOptions<P>>;
  providers: Record<string, ProviderAdapter>;
  plugins?: ReadonlyArray<Plugin>;
};

export async function sendBatch<P>(input: BatchInput<P>): Promise<BatchResult<P>> {
  if (input.items.length === 0) {
    throw new Error("batch requires at least one entry");
  }

  const hooks = input.plugins ? collectHooks(input.plugins) : undefined;
  const settled = await Promise.allSettled(
    input.items.map(async (options) =>
      runPipeline({
        definition: input.definition,
        options,
        providers: input.providers,
        hooks,
      }),
    ),
  );

  const results: SendResult<P>[] = [];
  const failures: FailedSendResult<P>[] = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      const result = outcome.value;
      results.push(result);
      if (result.status === "failed") {
        const failed: FailedSendResult<P> = {
          status: "failed",
          notificationId: result.notificationId,
          messageId: result.messageId,
          channel: result.channel,
          error: result.error,
        };
        failures.push(failed);
      }
    } else {
      const errorResult: FailedSendResult<P> = {
        status: "failed",
        notificationId: input.definition.nuntiusId,
        messageId: null,
        channel: "",
        error: new NuntiusError({
          message:
            outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
          code: "UNKNOWN_ERROR",
          notificationId: input.definition.nuntiusId,
          cause: outcome.reason,
        }),
      };
      results.push(errorResult);
      failures.push(errorResult);
    }
  }

  return { results, failures };
}
