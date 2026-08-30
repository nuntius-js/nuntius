import type { NotificationDefinition } from "../types/notification.ts";
import type { SendOptions, SendResult } from "../types/send.ts";
import type { ProviderAdapter } from "../provider/index.ts";
import { NuntiusError } from "../errors/index.ts";
import { validate } from "./validate.ts";
import { resolve } from "./resolve.ts";
import { deliver } from "./deliver.ts";
import { finalize } from "./finalize.ts";

export type RunPipelineInput<P> = {
  definition: NotificationDefinition<P>;
  options: SendOptions<P>;
  providers: Record<string, ProviderAdapter>;
};

export async function runPipeline<P>(input: RunPipelineInput<P>): Promise<SendResult<P>> {
  const { definition, options, providers } = input;
  let payload: unknown;
  try {
    payload = validate(definition.schema, options.payload, definition.nuntiusId);
    const resolved = await resolve(options.to, options.resolver, definition.nuntiusId);
    const delivered = await deliver({
      notificationId: definition.nuntiusId,
      channels: definition.channels,
      payload,
      recipient: resolved.recipient,
      contact: resolved.contact,
      providers,
    });
    return finalize({
      notificationId: definition.nuntiusId,
      channel: delivered.channel.channel,
      messageId: delivered.result.success ? delivered.result.messageId : null,
    });
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
