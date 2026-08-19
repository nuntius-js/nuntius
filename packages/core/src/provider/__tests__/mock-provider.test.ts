import { describe, expect, it } from "vitest";

import { NuntiusProviderError } from "../../errors/index.ts";
import { mockProvider } from "../mock.ts";
import type { DeliveryContext } from "../index.ts";

const ctx: DeliveryContext = {
  notificationId: "welcome",
  config: { channel: "email", needs: "email", subject: "Hi" },
  payload: { name: "Ada" },
  recipient: { userId: "u_1" },
  contact: { email: "ada@example.com" },
};

describe("mockProvider", () => {
  it("returns success with a deterministic message id", async () => {
    const provider = mockProvider();
    await expect(provider.send(ctx)).resolves.toEqual({ success: true, messageId: "mock-1" });
    await expect(provider.send(ctx)).resolves.toEqual({ success: true, messageId: "mock-2" });
  });

  it("records every send with its context and result", async () => {
    const provider = mockProvider();
    await provider.send(ctx);
    await provider.send(ctx);
    expect(provider.sent).toHaveLength(2);
    expect(provider.sent[0]).toEqual({ ctx, result: { success: true, messageId: "mock-1" } });
    expect(provider.sent[1]).toEqual({ ctx, result: { success: true, messageId: "mock-2" } });
  });

  it("names itself mock by default and honors a custom name", () => {
    expect(mockProvider().name).toBe("mock");
    expect(mockProvider({ name: "test-provider" }).name).toBe("test-provider");
  });

  it("honors a reply override for the success arm", async () => {
    const provider = mockProvider({ reply: () => ({ success: true, messageId: "custom-1" }) });
    await expect(provider.send(ctx)).resolves.toEqual({ success: true, messageId: "custom-1" });
  });

  it("honors a reply override for the failure arm", async () => {
    const error = new NuntiusProviderError({
      provider: "mock",
      retriable: false,
      message: "provider rejected",
    });
    const provider = mockProvider({ reply: () => ({ success: false, error }) });
    await expect(provider.send(ctx)).resolves.toEqual({ success: false, error });
  });

  it("supports async replies", async () => {
    const provider = mockProvider({
      reply: async () => {
        await Promise.resolve();
        return { success: true, messageId: null };
      },
    });
    await expect(provider.send(ctx)).resolves.toEqual({ success: true, messageId: null });
  });

  it("reset clears the recorded sends", async () => {
    const provider = mockProvider();
    await provider.send(ctx);
    provider.reset();
    expect(provider.sent).toHaveLength(0);
  });
});
