import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";

import { isNuntiusError, NuntiusError } from "../../index.ts";
import type { DeliveryStage, DeliveryStatus } from "../../index.ts";
import type {
  BatchOptions,
  BatchResult,
  Contact,
  Recipient,
  RecipientResolver,
  SendOptions,
  SendResult,
} from "../send.ts";
import type { BaseHookContext, HookContext, HookName, Plugin, PluginHook } from "../plugin.ts";
import type {
  AnyNotificationDefinition,
  BuiltinChannel,
  ChannelConfig,
  EmailChannel,
  NotificationDefinition,
  PushChannel,
  SmsChannel,
} from "../notification.ts";
import type { NuntiusConfig, NuntiusInstance, ProviderAdapter } from "../instance.ts";

const handleDeliveryStatus = (status: DeliveryStatus): string => {
  switch (status) {
    case "queued":
      return "queued";
    case "retrying":
      return "retrying";
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
  throw new Error("unreachable");
};

const handleDeliveryStage = (stage: DeliveryStage): string => {
  switch (stage) {
    case "validate":
      return "validate";
    case "resolve":
      return "resolve";
    case "deliver":
      return "deliver";
    case "finalize":
      return "finalize";
  }
  throw new Error("unreachable");
};

describe("delivery types", () => {
  it("DeliveryStatus is the five glossary states", () => {
    expectTypeOf<DeliveryStatus>().toEqualTypeOf<
      "queued" | "retrying" | "delivered" | "failed" | "cancelled"
    >();
  });

  it("DeliveryStage is the four v1 stages (enqueue deferred to v2)", () => {
    expectTypeOf<DeliveryStage>().toEqualTypeOf<"validate" | "resolve" | "deliver" | "finalize">();
  });

  it("switches exhaustively over every DeliveryStatus and DeliveryStage", () => {
    expectTypeOf<typeof handleDeliveryStatus>().toEqualTypeOf<(status: DeliveryStatus) => string>();
    expectTypeOf<typeof handleDeliveryStage>().toEqualTypeOf<(stage: DeliveryStage) => string>();
  });
});

describe("notification types", () => {
  it("BuiltinChannel is the email | sms | push union", () => {
    expectTypeOf<BuiltinChannel>().toEqualTypeOf<EmailChannel | SmsChannel | PushChannel>();
  });

  it("ChannelConfig is the open base — any door name and extra options are allowed", () => {
    expectTypeOf<ChannelConfig>().toEqualTypeOf<{
      readonly channel: string;
      [key: string]: unknown;
    }>();
    expectTypeOf<BuiltinChannel>().toExtend<ChannelConfig>();
  });

  it("built-in channel names stay precise in autocomplete", () => {
    expectTypeOf<EmailChannel["channel"]>().toEqualTypeOf<"email">();
    expectTypeOf<SmsChannel["channel"]>().toEqualTypeOf<"sms">();
    expectTypeOf<PushChannel["channel"]>().toEqualTypeOf<"push">();
  });

  it("accepts an InvoicePaid-style definition and wires P through the schema", () => {
    const invoicePaid = {
      nuntiusId: "invoice.paid",
      schema: z.object({ amount: z.number() }),
      channels: [{ channel: "email" }, { channel: "sms" }],
      _payload: { amount: 1 },
    } satisfies NotificationDefinition<{ amount: number }>;

    expectTypeOf<typeof invoicePaid.schema>().toExtend<z.ZodType<{ amount: number }>>();
  });

  it("accepts a defineChannel()'d custom channel object (unknown names are a runtime CONFIG_ERROR)", () => {
    const invoicePaid = {
      nuntiusId: "invoice.paid",
      schema: z.object({ amount: z.number() }),
      channels: [{ channel: "slack", webhookUrl: "https://hooks.example/slack" }],
      _payload: { amount: 1 },
    } satisfies NotificationDefinition<{ amount: number }>;
  });

  it("rejects bare channel strings — channels are objects with a channel name", () => {
    const invalid = {
      nuntiusId: "invoice.paid",
      schema: z.object({ amount: z.number() }),
      channels: ["email", "sms"],
      _payload: { amount: 1 },
    };
    // @ts-expect-error channels must be objects, not bare strings
    invalid satisfies NotificationDefinition<{ amount: number }>;
  });

  it("derives the schema output from the definition's payload type", () => {
    type Def = NotificationDefinition<{ amount: number }>;
    expectTypeOf<Def["_payload"]>().toEqualTypeOf<{ amount: number }>();
    expectTypeOf<Def["schema"]>().toExtend<z.ZodType<{ amount: number }>>();
  });

  it("keeps definition fields readonly", () => {
    expectTypeOf<AnyNotificationDefinition["nuntiusId"]>().toEqualTypeOf<string>();
    type ReadonlyKeys = "nuntiusId" | "schema" | "channels" | "_payload";
    expectTypeOf<keyof AnyNotificationDefinition>().toEqualTypeOf<ReadonlyKeys>();
  });

  it("requires the payload type parameter (no silent unknown default)", () => {
    expectTypeOf<AnyNotificationDefinition["_payload"]>().toEqualTypeOf<unknown>();
  });
});

describe("send types", () => {
  it("separates Recipient identity from Contact addresses", () => {
    expectTypeOf<Recipient>().toEqualTypeOf<{ userId: string }>();
    expectTypeOf<Contact>().toEqualTypeOf<{
      email?: string;
      phone?: string;
      pushToken?: string;
      [key: string]: string | undefined;
    }>();
  });

  it("types the resolver as Recipient -> Contact", () => {
    expectTypeOf<RecipientResolver>().toEqualTypeOf<
      (to: Recipient) => Contact | Promise<Contact>
    >();
  });

  it("inferences typed SendOptions<P> payloads", () => {
    type Opts = SendOptions<{ amount: number }>;
    expectTypeOf<Opts["payload"]>().toEqualTypeOf<{ amount: number }>();
    expectTypeOf<Opts["to"]>().toEqualTypeOf<Recipient | Contact>();
  });

  it("rejects a wrong-shaped payload at the type level", () => {
    expectTypeOf<SendOptions<{ amount: number }>["payload"]>().not.toEqualTypeOf<{
      amount: string;
    }>();
  });

  it("SendResult.status is the full DeliveryStatus (decision #4)", () => {
    type Result = SendResult<{ amount: number }>;
    expectTypeOf<Result["status"]>().toEqualTypeOf<DeliveryStatus>();
    expectTypeOf<Result["messageId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Result["error"]>().toEqualTypeOf<NuntiusError | undefined>();
  });

  it("BatchOptions extends SendOptions with an idempotency key", () => {
    type BatchOpts = BatchOptions<{ amount: number }>;
    expectTypeOf<BatchOpts>().toExtend<SendOptions<{ amount: number }>>();
    expectTypeOf<BatchOpts["idempotencyKey"]>().toEqualTypeOf<string | undefined>();
  });

  it("BatchResult splits results into failures subset", () => {
    type Result = BatchResult<{ amount: number }>;
    expectTypeOf<Result["results"]>().toEqualTypeOf<SendResult<{ amount: number }>[]>();
    expectTypeOf<Result["failures"]>().toEqualTypeOf<SendResult<{ amount: number }>[]>();
  });
});

describe("plugin types", () => {
  it("derives HookName into the 8 before/* after/* members (4 v1 stages)", () => {
    expectTypeOf<HookName>().toEqualTypeOf<
      | "before:validate"
      | "after:validate"
      | "before:resolve"
      | "after:resolve"
      | "before:deliver"
      | "after:deliver"
      | "before:finalize"
      | "after:finalize"
    >();
  });

  it("HookContext extends BaseHookContext with the stage", () => {
    expectTypeOf<HookContext>().toExtend<BaseHookContext>();
    expectTypeOf<HookContext["stage"]>().toEqualTypeOf<
      "validate" | "resolve" | "deliver" | "finalize"
    >();
  });

  it("PluginHook may be sync or async", () => {
    expectTypeOf<PluginHook>().toEqualTypeOf<(ctx: HookContext) => void | Promise<void>>();
  });

  it("a Plugin registers hooks under Partial<Record<HookName, PluginHook>>", () => {
    const logger: Plugin = {
      id: "logger",
      hooks: {
        "before:validate": (ctx) => {
          expectTypeOf(ctx).toEqualTypeOf<HookContext>();
        },
        "after:deliver": async () => {},
      },
    };

    expectTypeOf(logger.hooks).toEqualTypeOf<Partial<Record<HookName, PluginHook>> | undefined>();
  });
});

type InvoicePaidDef = NotificationDefinition<{ amount: number }> & {
  readonly nuntiusId: "invoice.paid";
};
type WelcomeDef = NotificationDefinition<{ name: string }> & { readonly nuntiusId: "welcome" };

describe("instance types", () => {
  it("accepts a mock provider", () => {
    const mockProvider: ProviderAdapter = {
      name: "mock",
      channels: ["email"],
      send: async () => {
        await Promise.resolve();
        return { success: true, messageId: "m-1" };
      },
    };

    const config: NuntiusConfig = { providers: [mockProvider] };
    expectTypeOf(config.providers).toEqualTypeOf<ReadonlyArray<ProviderAdapter>>();
  });

  it("accepts plugins in the config", () => {
    const logger: Plugin = {
      id: "logger",
      hooks: {
        "after:deliver": async () => {
          await Promise.resolve();
        },
      },
    };
    const config: NuntiusConfig = { providers: [], plugins: [logger] };
    expectTypeOf(config.plugins).toEqualTypeOf<ReadonlyArray<Plugin> | undefined>();
  });

  it("maps registered notifications to typed methods keyed by verbatim nuntiusId", () => {
    type Instance = NuntiusInstance<readonly [InvoicePaidDef, WelcomeDef]>;

    expectTypeOf<Instance["invoice.paid"]["send"]>().toEqualTypeOf<
      (opts: SendOptions<{ amount: number }>) => Promise<SendResult<{ amount: number }>>
    >();
    expectTypeOf<Instance["welcome"]["send"]>().toEqualTypeOf<
      (opts: SendOptions<{ name: string }>) => Promise<SendResult<{ name: string }>>
    >();
    expectTypeOf<Instance["welcome"]["batch"]>().toEqualTypeOf<
      (items: BatchOptions<{ name: string }>[]) => Promise<BatchResult<{ name: string }>>
    >();
  });

  it("exposes no fused send method and no notify alias", () => {
    type Instance = NuntiusInstance<readonly [InvoicePaidDef]>;
    type HasSendKey = "send" extends keyof Instance ? true : false;
    type HasNotifyKey = "notify" extends keyof Instance ? true : false;

    expectTypeOf<HasSendKey>().toEqualTypeOf<false>();
    expectTypeOf<HasNotifyKey>().toEqualTypeOf<false>();
  });

  it("config notifications drive the NuntiusInstance type", () => {
    type Config = NuntiusConfig<readonly [InvoicePaidDef, WelcomeDef]>;
    type IndexedNotifs = NonNullable<Config["notifications"]>;
    type InstanceFromConfig = NuntiusInstance<IndexedNotifs>;

    expectTypeOf<InstanceFromConfig>().toEqualTypeOf<
      NuntiusInstance<readonly [InvoicePaidDef, WelcomeDef]>
    >();
  });
});

describe("public surface", () => {
  it("re-exports the error vocabulary from the root barrel", () => {
    expect(isNuntiusError(new NuntiusError({ message: "x" }))).toBe(true);
  });

  it("re-exports the delivery types from the root barrel", () => {
    expectTypeOf<DeliveryStatus>().toEqualTypeOf<
      "queued" | "retrying" | "delivered" | "failed" | "cancelled"
    >();
    expectTypeOf<DeliveryStage>().toEqualTypeOf<"validate" | "resolve" | "deliver" | "finalize">();
  });
});
