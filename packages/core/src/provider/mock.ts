import type { DeliveryContext, ProviderAdapter, ProviderSendResult } from "./index.ts";

export type MockProviderOptions = {
  name?: string;
  reply?: (ctx: DeliveryContext) => ProviderSendResult | Promise<ProviderSendResult>;
};

export type MockProvider = ProviderAdapter & {
  readonly sent: ReadonlyArray<{ ctx: DeliveryContext; result: ProviderSendResult }>;
  reset(): void;
};

export function mockProvider(opts?: MockProviderOptions): MockProvider {
  const records: Array<{ ctx: DeliveryContext; result: ProviderSendResult }> = [];
  let counter = 0;

  const reply: (ctx: DeliveryContext) => ProviderSendResult | Promise<ProviderSendResult> =
    opts?.reply ??
    (() => {
      counter += 1;
      return { success: true, messageId: `mock-${counter}` };
    });

  return {
    name: opts?.name ?? "mock",
    get sent() {
      return records;
    },
    async send(ctx: DeliveryContext): Promise<ProviderSendResult> {
      const result = await reply(ctx);
      records.push({ ctx, result });
      return result;
    },
    reset() {
      records.length = 0;
    },
  };
}
