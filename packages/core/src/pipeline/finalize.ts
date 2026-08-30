import type { SendResult } from "../types/send.ts";
import type { NuntiusError } from "../errors/index.ts";

export type FinalizeInput = {
  notificationId: string;
  channel: string;
  messageId: string | null;
  error?: NuntiusError;
};

export function finalize<P = unknown>(input: FinalizeInput): SendResult<P> {
  return {
    status: input.error ? "failed" : "delivered",
    notificationId: input.notificationId,
    messageId: input.messageId,
    channel: input.channel,
    error: input.error,
  };
}
