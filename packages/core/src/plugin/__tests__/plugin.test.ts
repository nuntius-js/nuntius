import { describe, it, expect, beforeEach } from "vitest";
import * as z from "zod";
import { notification, email } from "../../notification/index.ts";
import { mockProvider } from "../../provider/index.ts";
import { definePlugin } from "../index.ts";
import { runPipeline, collectHooks } from "../../pipeline/index.ts";
import type { Plugin, PluginHook } from "../../types/plugin.ts";
import type { ErrorHookContext, HookContext } from "../../types/plugin.ts";
import { NuntiusSchemaError } from "../../errors/index.ts";

const Welcome = notification({
  nuntiusId: "welcome",
  schema: z.object({ name: z.string() }),
  channels: [email()],
});

describe("definePlugin", () => {
  it("returns frozen object with id and hooks", () => {
    const hook: PluginHook = () => {};
    const plugin = definePlugin({
      id: "test",
      hooks: { "before:deliver": hook },
    });
    expect(plugin.id).toBe("test");
    expect(plugin.hooks?.["before:deliver"]).toBe(hook);
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(Object.isFrozen(plugin.hooks)).toBe(true);
  });
});

describe("hook type safety", () => {
  it("rejects invalid hook names at compile time", () => {
    definePlugin({
      id: "type-test",
      hooks: {
        // @ts-expect-error — invalid hook name
        "before:deliverx": () => {},
      },
    });
  });

  it("rejects unknown keys at compile time", () => {
    definePlugin({
      id: "type-test",
      hooks: {
        // @ts-expect-error — unknown hook key
        notAHook: () => {},
      },
    });
  });
});

describe("hook execution order", () => {
  let provider: ReturnType<typeof mockProvider>;
  let calls: string[];
  let plugin: Plugin;

  beforeEach(() => {
    provider = mockProvider();
    calls = [];
    plugin = definePlugin({
      id: "order-tracker",
      hooks: {
        "before:validate": () => {
          calls.push("before:validate");
        },
        "after:validate": () => {
          calls.push("after:validate");
        },
        "before:resolve": () => {
          calls.push("before:resolve");
        },
        "after:resolve": () => {
          calls.push("after:resolve");
        },
        "before:deliver": () => {
          calls.push("before:deliver");
        },
        "after:deliver": () => {
          calls.push("after:deliver");
        },
        "before:finalize": () => {
          calls.push("before:finalize");
        },
        "after:finalize": () => {
          calls.push("after:finalize");
        },
      },
    });
  });

  it("fires all 8 hooks in order on success", async () => {
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(result.status).toBe("delivered");
    expect(calls).toEqual([
      "before:validate",
      "after:validate",
      "before:resolve",
      "after:resolve",
      "before:deliver",
      "after:deliver",
      "before:finalize",
      "after:finalize",
    ]);
  });

  it("multiple plugins fire in registration order", async () => {
    const pluginA = definePlugin({
      id: "a",
      hooks: {
        "before:deliver": () => {
          calls.push("a:before:deliver");
        },
      },
    });
    const pluginB = definePlugin({
      id: "b",
      hooks: {
        "before:deliver": () => {
          calls.push("b:before:deliver");
        },
      },
    });
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([pluginA, pluginB]),
    });
    expect(result.status).toBe("delivered");
    expect(calls).toEqual(["a:before:deliver", "b:before:deliver"]);
  });
});

describe("hook context", () => {
  let provider: ReturnType<typeof mockProvider>;

  beforeEach(() => {
    provider = mockProvider();
  });

  it("before:validate receives correct context", async () => {
    let ctx: HookContext | undefined;
    const plugin = definePlugin({
      id: "ctx-check",
      hooks: {
        "before:validate": (c) => {
          ctx = c;
        },
      },
    });
    await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(ctx).toBeDefined();
    expect(ctx!.notificationId).toBe("welcome");
    expect(ctx!.payload).toEqual({ name: "Alice" });
    expect(ctx!.recipient).toBeUndefined();
    expect(ctx!.stage).toBe("validate");
  });

  it("after:resolve receives resolved Recipient when to is Recipient", async () => {
    let ctx: HookContext | undefined;
    const plugin = definePlugin({
      id: "ctx-resolve",
      hooks: {
        "after:resolve": (c) => {
          ctx = c;
        },
      },
    });
    await runPipeline({
      definition: Welcome,
      options: {
        to: { userId: "u_1" },
        payload: { name: "Alice" },
        resolver: (to) => ({ email: `${to.userId}@x.com` }),
      },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(ctx).toBeDefined();
    expect(ctx!.recipient).toEqual({ userId: "u_1" });
    expect(ctx!.stage).toBe("resolve");
  });

  it("after:resolve has undefined recipient when to is Contact", async () => {
    let ctx: HookContext | undefined;
    const plugin = definePlugin({
      id: "ctx-contact",
      hooks: {
        "after:resolve": (c) => {
          ctx = c;
        },
      },
    });
    await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(ctx).toBeDefined();
    expect(ctx!.recipient).toBeUndefined();
  });
});

describe("error propagation", () => {
  let provider: ReturnType<typeof mockProvider>;

  beforeEach(() => {
    provider = mockProvider();
  });

  it("hook throw short-circuits pipeline", async () => {
    const plugin = definePlugin({
      id: "thrower",
      hooks: {
        "before:deliver": () => {
          throw new Error("hook boom");
        },
        "after:deliver": () => {
          throw new Error("should not fire");
        },
        "before:finalize": () => {
          throw new Error("should not fire");
        },
      },
    });
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("UNKNOWN_ERROR");
    expect(result.error!.cause).toBeInstanceOf(Error);
    if (result.error!.cause instanceof Error) {
      expect(result.error!.cause.message).toBe("hook boom");
    }
  });

  it("hook throwing NuntiusError preserves code", async () => {
    const plugin = definePlugin({
      id: "nuntius-thrower",
      hooks: {
        "after:resolve": () => {
          throw new NuntiusSchemaError({
            message: "schema bad",
            notificationId: "welcome",
            issues: [],
          });
        },
      },
    });
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(NuntiusSchemaError);
    expect(result.error!.code).toBe("SCHEMA_ERROR");
  });
});

describe("after:finalize", () => {
  let provider: ReturnType<typeof mockProvider>;
  let calls: string[];

  beforeEach(() => {
    provider = mockProvider();
    calls = [];
  });

  it("does not fire on error path", async () => {
    const plugin = definePlugin({
      id: "finalize-error",
      hooks: {
        "before:deliver": () => {
          throw new Error("boom");
        },
        "after:finalize": () => {
          calls.push("after:finalize");
        },
      },
    });
    await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(calls).toEqual([]);
  });
});

describe("onError hook", () => {
  let provider: ReturnType<typeof mockProvider>;

  beforeEach(() => {
    provider = mockProvider();
  });

  it("fires when pipeline fails with unknown error", async () => {
    let errorCtx: ErrorHookContext | undefined;
    const plugin = definePlugin({
      id: "error-catcher",
      hooks: {
        onError: (ctx) => {
          errorCtx = ctx;
        },
        "before:deliver": () => {
          throw new Error("boom");
        },
      },
    });
    const result = await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(result.status).toBe("failed");
    expect(errorCtx).toBeDefined();
    expect(errorCtx!.stage).toBe("deliver");
    expect(errorCtx!.error.code).toBe("UNKNOWN_ERROR");
    expect(errorCtx!.error.cause).toBeInstanceOf(Error);
    expect(errorCtx!.notificationId).toBe("welcome");
    expect(errorCtx!.payload).toEqual({ name: "Alice" });
  });

  it("fires with correct stage when validate fails", async () => {
    let errorCtx: ErrorHookContext | undefined;
    const plugin = definePlugin({
      id: "error-validate",
      hooks: {
        onError: (ctx) => {
          errorCtx = ctx;
        },
      },
    });
    const invalidPayload: Record<string, unknown> = { nmae: "bad" };
    await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: invalidPayload },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(errorCtx).toBeDefined();
    expect(errorCtx!.stage).toBe("validate");
    expect(errorCtx!.error.code).toBe("SCHEMA_ERROR");
  });

  it("fires with correct stage when resolve fails", async () => {
    let errorCtx: ErrorHookContext | undefined;
    const plugin = definePlugin({
      id: "error-resolve",
      hooks: {
        onError: (ctx) => {
          errorCtx = ctx;
        },
      },
    });
    await runPipeline({
      definition: Welcome,
      options: { to: { userId: "u_1" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(errorCtx).toBeDefined();
    expect(errorCtx!.stage).toBe("resolve");
    expect(errorCtx!.error.code).toBe("RESOLVE_ERROR");
  });

  it("multiple onError hooks fire from multiple plugins", async () => {
    const onErrorCalls: string[] = [];
    const pluginA = definePlugin({
      id: "error-a",
      hooks: {
        onError: () => {
          onErrorCalls.push("a");
        },
        "before:deliver": () => {
          throw new Error("boom");
        },
      },
    });
    const pluginB = definePlugin({
      id: "error-b",
      hooks: {
        onError: () => {
          onErrorCalls.push("b");
        },
      },
    });
    await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([pluginA, pluginB]),
    });
    expect(onErrorCalls).toEqual(["a", "b"]);
  });

  it("does not fire on success path", async () => {
    let called = false;
    const plugin = definePlugin({
      id: "no-error",
      hooks: {
        onError: () => {
          called = true;
        },
      },
    });
    await runPipeline({
      definition: Welcome,
      options: { to: { email: "a@b.com" }, payload: { name: "Alice" } },
      providers: { email: provider },
      hooks: collectHooks([plugin]),
    });
    expect(called).toBe(false);
  });
});
