import { describe, it, expect, beforeEach } from "vitest";
import * as z from "zod";
import { notification, email } from "../../notification/index.ts";
import { mockProvider } from "../../provider/index.ts";
import { definePlugin } from "../../plugin/index.ts";
import { send, sendBatch } from "../index.ts";
import type { ProviderAdapter } from "../../provider/index.ts";
import { NuntiusSchemaError } from "../../errors/index.ts";

const Welcome = notification({
  nuntiusId: "welcome",
  schema: z.object({ name: z.string() }),
  channels: [email()],
});

describe("send", () => {
  let provider: ReturnType<typeof mockProvider>;

  beforeEach(() => {
    provider = mockProvider();
  });

  it("returns delivered result with valid input", async () => {
    const result = await send({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
    });
    expect(result.status).toBe("delivered");
    expect(result.notificationId).toBe("welcome");
    expect(result.channel).toBe("email");
    expect(result.messageId).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("returns failed result on schema error", async () => {
    const result = await send({
      definition: Welcome,
      // @ts-expect-error — testing schema validation with invalid payload
      options: { to: { email: "a@b.com" }, payload: { nmae: "bad" } },
      providers: { email: provider },
    });
    expect(result.status).toBe("failed");
    expect(result.messageId).toBeNull();
    expect(result.channel).toBe("");
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("SCHEMA_ERROR");
    expect(result.error).toBeInstanceOf(NuntiusSchemaError);
    if (result.error instanceof NuntiusSchemaError) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("returns failed result on resolve error", async () => {
    const result = await send({
      definition: Welcome,
      options: { to: { userId: "u_1" }, payload: { name: "Alice" } },
      providers: { email: provider },
    });
    expect(result.status).toBe("failed");
    expect(result.messageId).toBeNull();
    expect(result.channel).toBe("");
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("RESOLVE_ERROR");
  });

  it("returns failed result on provider error", async () => {
    const failingProvider: ProviderAdapter = {
      name: "failing",
      send: async () => {
        await Promise.resolve();
        throw new Error("provider down");
      },
    };
    const result = await send({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: failingProvider },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("PROVIDER_ERROR");
  });

  it("passes plugins through to pipeline", async () => {
    const calls: string[] = [];
    const plugin = definePlugin({
      id: "tracker",
      hooks: {
        "before:deliver": () => {
          calls.push("before:deliver");
        },
      },
    });
    const result = await send({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      plugins: [plugin],
    });
    expect(result.status).toBe("delivered");
    expect(calls).toEqual(["before:deliver"]);
  });

  it("works without plugins (defaults to no hooks)", async () => {
    const result = await send({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
    });
    expect(result.status).toBe("delivered");
  });
});

describe("sendBatch", () => {
  let provider: ReturnType<typeof mockProvider>;

  beforeEach(() => {
    provider = mockProvider();
  });

  it("returns multiple results", async () => {
    const result = await sendBatch({
      definition: Welcome,
      items: [
        { to: { email: "a@b.com" }, payload: { name: "Alice" } },
        { to: { email: "c@d.com" }, payload: { name: "Bob" } },
      ],
      providers: { email: provider },
    });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.status).toBe("delivered");
    expect(result.results[1]!.status).toBe("delivered");
    expect(result.failures).toHaveLength(0);
  });

  it("handles mixed success and failure", async () => {
    let callCount = 0;
    const flakyProvider: ProviderAdapter = {
      name: "flaky",
      send: async () => {
        await Promise.resolve();
        callCount++;
        if (callCount === 1) {
          throw new Error("first one fails");
        }
        return { success: true, messageId: `msg-${callCount}` };
      },
    };
    const result = await sendBatch({
      definition: Welcome,
      items: [
        { to: { email: "a@b.com" }, payload: { name: "Alice" } },
        { to: { email: "c@d.com" }, payload: { name: "Bob" } },
      ],
      providers: { email: flakyProvider },
    });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.status).toBe("failed");
    expect(result.results[1]!.status).toBe("delivered");
  });

  it("populates failures array", async () => {
    let callCount = 0;
    const flakyProvider: ProviderAdapter = {
      name: "flaky",
      send: async () => {
        await Promise.resolve();
        callCount++;
        if (callCount === 1) {
          throw new Error("fail");
        }
        return { success: true, messageId: `msg-${callCount}` };
      },
    };
    const result = await sendBatch({
      definition: Welcome,
      items: [
        { to: { email: "a@b.com" }, payload: { name: "Alice" } },
        { to: { email: "c@d.com" }, payload: { name: "Bob" } },
      ],
      providers: { email: flakyProvider },
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.status).toBe("failed");
    expect(result.failures[0]!.error).toBeDefined();
  });

  it("throws on empty items array", async () => {
    await expect(
      sendBatch({
        definition: Welcome,
        items: [],
        providers: { email: provider },
      }),
    ).rejects.toThrow("batch requires at least one entry");
  });
});
