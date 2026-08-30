import { describe, it, expect, expectTypeOf, beforeEach } from "vitest";
import * as z from "zod";
import { notification, email, sms, push, defineChannel } from "../../notification/index.ts";
import { mockProvider } from "../../provider/index.ts";
import { runPipeline, validate, isRecipient, resolve, pickChannel, deliver } from "../index.ts";
import type { SendResult } from "../../types/send.ts";
import type { DeliveryStatus } from "../../types/delivery.ts";
import {
  NuntiusSchemaError,
  NuntiusResolveError,
  NuntiusDeliverError,
  NuntiusProviderError,
} from "../../errors/index.ts";
import type { NuntiusError } from "../../errors/index.ts";

const Welcome = notification({
  nuntiusId: "welcome",
  schema: z.object({ name: z.string() }),
  channels: [email()],
});

describe("validate", () => {
  it("throws NuntiusSchemaError on failure", () => {
    const invalidPayload: unknown = { nmae: "x" };
    try {
      validate(Welcome.schema, invalidPayload, "welcome");
    } catch (error) {
      expect(error).toBeInstanceOf(NuntiusSchemaError);
      if (error instanceof NuntiusSchemaError) {
        expect(error.code).toBe("SCHEMA_ERROR");
        expect(error.issues).toBeDefined();
        expect(error.issues.length).toBeGreaterThan(0);
        expect(error.notificationId).toBe("welcome");
      }
    }
  });
});

describe("isRecipient", () => {
  it("distinguishes Recipient from Contact", () => {
    expect(isRecipient({ userId: "u_1" })).toBe(true);
    expect(isRecipient({ email: "a@b.com" })).toBe(false);
  });
});

describe("resolve", () => {
  it("passes Contact through without resolver", async () => {
    const result = await resolve({ email: "a@b.com" }, undefined, "welcome");
    expect(result).toEqual({ contact: { email: "a@b.com" } });
    expect(result.recipient).toBeUndefined();
  });

  it("resolves Recipient via resolver", async () => {
    const resolver = (to: { userId: string }) => ({
      email: `${to.userId}@x.com`,
    });
    const result = await resolve({ userId: "u_1" }, resolver, "welcome");
    expect(result).toEqual({
      recipient: { userId: "u_1" },
      contact: { email: "u_1@x.com" },
    });
  });

  it("throws RESOLVE_ERROR when Recipient without resolver", async () => {
    await expect(resolve({ userId: "u_1" }, undefined, "welcome")).rejects.toThrow(
      NuntiusResolveError,
    );
  });

  it("throws RESOLVE_ERROR when resolver rejects", async () => {
    const resolver = () => {
      throw new Error("db down");
    };
    await expect(resolve({ userId: "u_1" }, resolver, "welcome")).rejects.toThrow(
      NuntiusResolveError,
    );
  });
});

describe("pickChannel", () => {
  it("returns first channel with registered adapter and resolved address", () => {
    const provider = mockProvider();
    const channels = [push(), email()];
    const contact = { email: "a@b.com", pushToken: "tok_1" };
    const result = pickChannel(channels, contact, { email: provider });
    expect(result?.channel).toBe("email");
  });

  it("returns null when no adapter registered", () => {
    const channels = [email()];
    const contact = { email: "a@b.com" };
    const result = pickChannel(channels, contact, {});
    expect(result).toBeNull();
  });

  it("returns null when no address resolved", () => {
    const provider = mockProvider();
    const channels = [email()];
    const contact = {};
    const result = pickChannel(channels, contact, { email: provider });
    expect(result).toBeNull();
  });

  it("skips channel with adapter but no address", () => {
    const emailProvider = mockProvider();
    const smsProvider = mockProvider();
    const channels = [email(), sms()];
    const contact = { phone: "+1234567890" };
    const result = pickChannel(channels, contact, {
      email: emailProvider,
      sms: smsProvider,
    });
    expect(result?.channel).toBe("sms");
  });

  it("picks needs:none channel even without address", () => {
    const webhookChannel = defineChannel({ name: "webhook", needs: "none" });
    const provider = mockProvider();
    const channels = [webhookChannel()];
    const result = pickChannel(channels, {}, { webhook: provider });
    expect(result?.channel).toBe("webhook");
  });
});

describe("deliver", () => {
  it("delivers via winning channel", async () => {
    const provider = mockProvider();
    const result = await deliver({
      notificationId: "welcome",
      channels: [email()],
      payload: { name: "Alice" },
      contact: { email: "a@b.com" },
      providers: { email: provider },
    });
    expect(result.channel.channel).toBe("email");
    expect(result.result.success).toBe(true);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.ctx.config.channel).toBe("email");
    expect(provider.sent[0]?.ctx.payload).toEqual({ name: "Alice" });
    expect(provider.sent[0]?.ctx.contact).toEqual({ email: "a@b.com" });
  });

  it("throws RESOLVE_ERROR when no channel qualifies", async () => {
    const provider = mockProvider();
    await expect(
      deliver({
        notificationId: "welcome",
        channels: [email()],
        payload: { name: "Alice" },
        contact: {},
        providers: { email: provider },
      }),
    ).rejects.toThrow(NuntiusResolveError);
    expect(provider.sent).toHaveLength(0);
  });

  it("wraps adapter throw as NuntiusProviderError", async () => {
    const provider = mockProvider({
      reply: () => {
        throw new Error("boom");
      },
    });
    try {
      await deliver({
        notificationId: "welcome",
        channels: [email()],
        payload: { name: "Alice" },
        contact: { email: "a@b.com" },
        providers: { email: provider },
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NuntiusProviderError);
      if (error instanceof NuntiusProviderError) {
        expect(error.code).toBe("PROVIDER_ERROR");
        expect(error.retriable).toBe(false);
        expect(error.cause).toBeInstanceOf(Error);
        if (error.cause instanceof Error) {
          expect(error.cause.message).toBe("boom");
        }
      }
    }
  });

  it("preserves NuntiusProviderError when adapter throws it", async () => {
    const provider = mockProvider({
      reply: () => {
        throw new NuntiusProviderError({
          provider: "mock",
          retriable: true,
          message: "5xx",
        });
      },
    });
    try {
      await deliver({
        notificationId: "welcome",
        channels: [email()],
        payload: { name: "Alice" },
        contact: { email: "a@b.com" },
        providers: { email: provider },
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NuntiusProviderError);
      if (error instanceof NuntiusProviderError) {
        expect(error.retriable).toBe(true);
      }
    }
  });

  it("wraps adapter failure as NuntiusDeliverError", async () => {
    const provider = mockProvider({
      reply: () => ({ success: false, error: new Error("nope") }),
    });
    try {
      await deliver({
        notificationId: "welcome",
        channels: [email()],
        payload: { name: "Alice" },
        contact: { email: "a@b.com" },
        providers: { email: provider },
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NuntiusDeliverError);
      if (error instanceof NuntiusDeliverError) {
        expect(error.code).toBe("DELIVER_ERROR");
        expect(error.channel).toBe("email");
        expect(error.cause).toBeInstanceOf(Error);
        if (error.cause instanceof Error) {
          expect(error.cause.message).toBe("nope");
        }
        expect(error.retriable).toBe(false);
      }
    }
  });
});

describe("runPipeline", () => {
  let provider: ReturnType<typeof mockProvider>;

  beforeEach(() => {
    provider = mockProvider();
  });

  it("delivers successfully with Contact to", async () => {
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
    });
    expect(result.status).toBe("delivered");
    expect(result.messageId).toBe("mock-1");
    expect(result.channel).toBe("email");
    expect(result.error).toBeUndefined();
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.ctx.config.channel).toBe("email");
    expect(provider.sent[0]?.ctx.payload).toEqual({ name: "Alice" });
    expect(provider.sent[0]?.ctx.contact).toEqual({ email: "a@b.com" });
    expect(provider.sent[0]?.ctx.recipient).toBeUndefined();
  });

  it("delivers successfully via resolver", async () => {
    const resolver = (to: { userId: string }) => ({
      email: `${to.userId}@x.com`,
    });
    const result = await runPipeline({
      definition: Welcome,
      options: {
        to: { userId: "u_1" },
        payload: { name: "Alice" },
        resolver,
      },
      providers: { email: provider },
    });
    expect(result.status).toBe("delivered");
    expect(result.channel).toBe("email");
    expect(provider.sent[0]?.ctx.recipient).toEqual({ userId: "u_1" });
    expect(provider.sent[0]?.ctx.contact.email).toBe("u_1@x.com");
  });

  it("delivers with messageId null when provider returns null", async () => {
    const nullProvider = mockProvider({
      reply: () => ({ success: true, messageId: null }),
    });
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: nullProvider },
    });
    expect(result.status).toBe("delivered");
    expect(result.messageId).toBeNull();
  });

  it("delivers when Contact to with resolver provided (resolver ignored)", async () => {
    const resolver = () => ({ email: "ignored@x.com" });
    const result = await runPipeline({
      definition: Welcome,
      options: {
        to: { email: "a@b.com" },
        payload: { name: "Alice" },
        resolver,
      },
      providers: { email: provider },
    });
    expect(result.status).toBe("delivered");
    expect(provider.sent[0]?.ctx.contact).toEqual({ email: "a@b.com" });
  });

  it("returns failed status on invalid payload", async () => {
    const invalidPayload: unknown = { nmae: "x" };
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: invalidPayload },
      providers: { email: provider },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(NuntiusSchemaError);
    expect(result.error?.code).toBe("SCHEMA_ERROR");
    expect(result.channel).toBe("");
    expect(provider.sent).toHaveLength(0);
  });

  it("returns failed status when Recipient without resolver", async () => {
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { userId: "u_1" }, payload: { name: "Alice" } },
      providers: { email: provider },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(NuntiusResolveError);
    expect(result.error?.code).toBe("RESOLVE_ERROR");
    expect(result.channel).toBe("");
  });

  it("returns failed status when resolver rejects", async () => {
    const resolver = () => {
      throw new Error("db down");
    };
    const result = await runPipeline({
      definition: Welcome,
      options: {
        to: { userId: "u_1" },
        payload: { name: "Alice" },
        resolver,
      },
      providers: { email: provider },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(NuntiusResolveError);
    expect(result.error?.code).toBe("RESOLVE_ERROR");
  });

  it("returns failed status when no channel qualifies", async () => {
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: {},
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(NuntiusResolveError);
    expect(result.error?.code).toBe("RESOLVE_ERROR");
    expect(result.channel).toBe("");
  });

  it("returns failed status when adapter throws", async () => {
    const badProvider = mockProvider({
      reply: () => {
        throw new Error("boom");
      },
    });
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: badProvider },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(NuntiusProviderError);
    expect(result.error?.code).toBe("PROVIDER_ERROR");
    expect(result.channel).toBe("email");
  });

  it("returns failed status when adapter returns failure", async () => {
    const failProvider = mockProvider({
      reply: () => ({ success: false, error: new Error("nope") }),
    });
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: failProvider },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(NuntiusDeliverError);
    expect(result.error?.code).toBe("DELIVER_ERROR");
    expect(result.channel).toBe("email");
  });
});

describe("type safety", () => {
  it("infers SendResult with correct status and error types", async () => {
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: mockProvider() },
    });
    expectTypeOf(result).toEqualTypeOf<SendResult<{ name: string }>>();
    expectTypeOf(result.status).toEqualTypeOf<DeliveryStatus>();
    expectTypeOf(result.error).toEqualTypeOf<NuntiusError | undefined>();
  });
});
