import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";

import { isNuntiusError } from "../../errors/index.ts";
import type { ChannelConfig, NotificationDefinition } from "../../types/notification.ts";
import {
  defineChannel,
  email,
  notification,
  push,
  sms,
  type NotificationConfig,
} from "../index.ts";

type ExpectedConfigError = {
  message: RegExp;
  notificationId?: string;
  channel?: string;
};

function expectConfigError(fn: () => void, expected: ExpectedConfigError) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    expect(isNuntiusError(err)).toBe(true);
    if (isNuntiusError(err)) {
      expect(err.code).toBe("CONFIG_ERROR");
      expect(err.message).toMatch(expected.message);
      if (expected.notificationId !== undefined) {
        expect(err.notificationId).toBe(expected.notificationId);
      }
      if (expected.channel !== undefined) {
        expect(err.channel).toBe(expected.channel);
      }
    }
  }
  expect(threw).toBe(true);
}

describe("email()", () => {
  it("declares needs: 'email' for the resolver", () => {
    expect(email().needs).toBe("email");
  });

  it("merges subject and from into the channel object", () => {
    const ch = email({ subject: "Invoice paid", from: "billing@example.com" });
    expect(ch).toEqual({
      channel: "email",
      needs: "email",
      subject: "Invoice paid",
      from: "billing@example.com",
    });
  });

  it("strips reserved keys from opts — JS callers can't relabel the channel or needs", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- simulate a runtime opts object (e.g. JS consumer)
    const ch = email({ channel: "sms", needs: "phone", subject: "Invoice" } as unknown as {
      subject?: string;
    });
    expect(ch).toEqual({ channel: "email", needs: "email", subject: "Invoice" });
  });

  it("is typed as EmailChannel — channel literal is 'email'", () => {
    expectTypeOf(email()).toExtend<{ readonly channel: "email" }>();
  });
});

describe("sms()", () => {
  it("declares needs: 'phone' for the resolver", () => {
    expect(sms().needs).toBe("phone");
  });

  it("merges from into the channel object", () => {
    expect(sms({ from: "+1234567890" })).toEqual({
      channel: "sms",
      needs: "phone",
      from: "+1234567890",
    });
  });

  it("strips reserved keys from opts — JS callers can't relabel the channel or needs", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- simulate a runtime opts object (e.g. JS consumer)
    const ch = sms({ channel: "email", needs: "email", from: "+1234567890" } as unknown as {
      from?: string;
    });
    expect(ch).toEqual({ channel: "sms", needs: "phone", from: "+1234567890" });
  });

  it("is typed as SmsChannel — channel literal is 'sms'", () => {
    expectTypeOf(sms()).toExtend<{ readonly channel: "sms" }>();
  });
});

describe("push()", () => {
  it("declares needs: 'pushToken' for the resolver", () => {
    expect(push().needs).toBe("pushToken");
  });

  it("merges title into the channel object", () => {
    expect(push({ title: "New message" })).toEqual({
      channel: "push",
      needs: "pushToken",
      title: "New message",
    });
  });

  it("strips reserved keys from opts — JS callers can't relabel the channel or needs", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- simulate a runtime opts object (e.g. JS consumer)
    const ch = push({ channel: "sms", needs: "phone", title: "New message" } as unknown as {
      title?: string;
    });
    expect(ch).toEqual({ channel: "push", needs: "pushToken", title: "New message" });
  });

  it("is typed as PushChannel — channel literal is 'push'", () => {
    expectTypeOf(push()).toExtend<{ readonly channel: "push" }>();
  });
});

describe("defineChannel()", () => {
  it("returns a factory that produces a channel object with the given name", () => {
    const slack = defineChannel({ name: "slack", needs: "none" });
    const result = slack({ webhookUrl: "https://hooks.slack.com/T123" });
    expect(result.channel).toBe("slack");
    expect(result).toMatchObject({ channel: "slack", webhookUrl: "https://hooks.slack.com/T123" });
  });

  it("requires a needs value — always emits it on the channel object", () => {
    const slackWithNeeds = defineChannel({ name: "slack", needs: "email" });
    const result = slackWithNeeds();
    expect(result).toMatchObject({ channel: "slack", needs: "email" });
  });

  it("accepts the 'none' sentinel for address-independent channels", () => {
    const broadcast = defineChannel({ name: "broadcast", needs: "none" });
    const result = broadcast();
    expect(result).toMatchObject({ channel: "broadcast", needs: "none" });
  });

  it("per-call opts cannot override the declared channel name or needs", () => {
    const slackWithNeeds = defineChannel({ name: "slack", needs: "email" });
    const result = slackWithNeeds({
      webhookUrl: "https://hooks.slack.com/T123",
      channel: "sms",
      needs: "phone",
    });
    expect(result).toMatchObject({
      channel: "slack",
      needs: "email",
      webhookUrl: "https://hooks.slack.com/T123",
    });
  });

  it("per-call opts cannot override a declared 'none' needs either", () => {
    const broadcast = defineChannel({ name: "broadcast", needs: "none" });
    const result = broadcast({ needs: "email", channel: "sms" });
    expect(result).toMatchObject({ channel: "broadcast", needs: "none" });
  });

  it("returns a valid ChannelConfig shape", () => {
    const discord = defineChannel({ name: "discord", needs: "pushToken" });
    expectTypeOf(discord()).toExtend<ChannelConfig>();
  });
});

describe("notification()", () => {
  it("returns a frozen definition object with the correct shape", () => {
    const def = notification({
      nuntiusId: "invoice.paid",
      schema: z.object({ amount: z.number() }),
      channels: [email()],
    });

    expect(def.nuntiusId).toBe("invoice.paid");
    expect(def.channels).toHaveLength(1);
    expect(def.channels[0]?.channel).toBe("email");
  });

  it("definition object is frozen (immutable)", () => {
    const def = notification({
      nuntiusId: "welcome",
      schema: z.object({ name: z.string() }),
      channels: [email()],
    });

    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.channels)).toBe(true);
  });

  it("each channel config inside the definition is frozen (immutable)", () => {
    const def = notification({
      nuntiusId: "welcome",
      schema: z.object({ name: z.string() }),
      channels: [email({ from: "hi@example.com" })],
    });

    expect(Object.isFrozen(def.channels[0])).toBe(true);
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- simulate a runtime mutation attempt on a frozen channel config
      (def.channels[0] as unknown as { from: string }).from = "hacked@example.com";
    }).toThrow();
  });

  it("does not freeze the caller's own channel objects (copy, not freeze-in-place)", () => {
    const ch = email({ from: "hi@example.com" });
    notification({
      nuntiusId: "welcome",
      schema: z.object({ name: z.string() }),
      channels: [ch],
    });

    expect(Object.isFrozen(ch)).toBe(false);
  });

  it("wires P through the schema so runtime Zod validation works", () => {
    const def = notification({
      nuntiusId: "invoice.paid",
      schema: z.object({ amount: z.number() }),
      channels: [email()],
    });

    const valid = def.schema.safeParse({ amount: 100 });
    expect(valid.success).toBe(true);

    const invalid = def.schema.safeParse({ amount: "not-a-number" });
    expect(invalid.success).toBe(false);
  });

  it("accepts multiple channels including custom defineChannel() doors", () => {
    const slack = defineChannel({ name: "slack", needs: "email" });
    const def = notification({
      nuntiusId: "order.shipped",
      schema: z.object({ orderId: z.string() }),
      channels: [email(), sms(), slack({ webhookUrl: "https://hooks.slack.com/T123" })],
    });

    expect(def.channels).toHaveLength(3);
    expect(def.channels.map((c) => c.channel)).toEqual(["email", "sms", "slack"]);
  });

  it("is strongly typed — payload type P flows from schema inference", () => {
    const def = notification({
      nuntiusId: "invoice.paid",
      schema: z.object({ amount: z.number() }),
      channels: [email()],
    });
    expectTypeOf(def).toExtend<NotificationDefinition<{ amount: number }>>();
  });

  it("throws CONFIG_ERROR when nuntiusId is empty string", () => {
    for (const nuntiusId of ["", "  "]) {
      expectConfigError(
        () =>
          notification({
            nuntiusId,
            schema: z.object({ amount: z.number() }),
            channels: [email()],
          }),
        { message: /nuntiusId must be a non-empty string/ },
      );
    }
  });

  it("throws CONFIG_ERROR when nuntiusId contains invalid characters", () => {
    for (const nuntiusId of [
      "invoice paid",
      "Invoice",
      "invoice/paid",
      ".invoice",
      "invoice..paid",
      "invoice.",
    ]) {
      expectConfigError(
        () =>
          notification({
            nuntiusId,
            schema: z.object({ amount: z.number() }),
            channels: [email()],
          }),
        { message: /nuntiusId must be a non-empty string/ },
      );
    }
  });

  it("throws CONFIG_ERROR when nuntiusId exceeds the max length", () => {
    expectConfigError(
      () =>
        notification({
          nuntiusId: "a".repeat(101),
          schema: z.object({ amount: z.number() }),
          channels: [email()],
        }),
      { message: /nuntiusId must be a non-empty string/ },
    );
  });

  it("accepts nuntiusId segments joined by dots, dashes, and underscores", () => {
    for (const nuntiusId of ["invoice-paid", "invoice_paid", "order.shipped"]) {
      const def = notification({
        nuntiusId,
        schema: z.object({ amount: z.number() }),
        channels: [email()],
      });
      expect(def.nuntiusId).toBe(nuntiusId);
    }
  });

  it("throws CONFIG_ERROR when schema is not a Zod schema (JS consumer runtime config)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- simulate a runtime-constructed config (e.g. JS consumer)
    const fakeSchema = {
      parse: () => ({ success: true, data: undefined }),
    } as unknown as NotificationConfig<unknown>["schema"];
    expectConfigError(
      () => notification({ nuntiusId: "invoice.paid", schema: fakeSchema, channels: [email()] }),
      { message: /schema must be a Zod schema/, notificationId: "invoice.paid" },
    );
  });

  it("throws CONFIG_ERROR when channels array is empty", () => {
    expectConfigError(
      () =>
        notification({
          nuntiusId: "invoice.paid",
          schema: z.object({ amount: z.number() }),
          channels: [],
        }),
      { message: /must declare at least one channel/, notificationId: "invoice.paid" },
    );
  });

  it("throws CONFIG_ERROR when a duplicate channel name appears in the array", () => {
    expectConfigError(
      () =>
        notification({
          nuntiusId: "invoice.paid",
          schema: z.object({ amount: z.number() }),
          channels: [email(), email()],
        }),
      { message: /duplicate channel 'email'/, notificationId: "invoice.paid" },
    );
  });

  it("throws CONFIG_ERROR when a channel declares an invalid needs value", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- simulate a runtime-constructed config (e.g. JS consumer)
    const badSlack = { channel: "slack", needs: "emaill" } as unknown as ChannelConfig;
    expectConfigError(
      () =>
        notification({
          nuntiusId: "invoice.paid",
          schema: z.object({ amount: z.number() }),
          channels: [badSlack],
        }),
      { message: /has invalid needs/, notificationId: "invoice.paid", channel: "slack" },
    );
  });

  it("throws CONFIG_ERROR when a channel omits needs entirely (JS consumer runtime config)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- simulate a runtime-constructed config without needs
    const missingNeeds = { channel: "webhook" } as unknown as ChannelConfig;
    expectConfigError(
      () =>
        notification({
          nuntiusId: "invoice.paid",
          schema: z.object({ amount: z.number() }),
          channels: [missingNeeds],
        }),
      { message: /has invalid needs/, notificationId: "invoice.paid", channel: "webhook" },
    );
  });

  it("throws CONFIG_ERROR when a built-in-named channel declares a mismatched needs value", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- simulate a runtime-constructed config (e.g. JS consumer or defineChannel misuse)
    const badEmail = { channel: "email", needs: "phone" } as unknown as ChannelConfig;
    expectConfigError(
      () =>
        notification({
          nuntiusId: "invoice.paid",
          schema: z.object({ amount: z.number() }),
          channels: [badEmail],
        }),
      { message: /must declare needs/, notificationId: "invoice.paid", channel: "email" },
    );
  });

  it("accepts a built-in-named channel with a matching needs value", () => {
    const def = notification({
      nuntiusId: "invoice.paid",
      schema: z.object({ amount: z.number() }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- simulate a JS-constructed config that happens to be consistent
      channels: [{ channel: "email", needs: "email" } as unknown as ChannelConfig],
    });
    expect(def.channels[0]).toMatchObject({ channel: "email", needs: "email" });
  });
});
