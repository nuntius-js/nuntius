import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";

import {
  NuntiusError,
  NuntiusProviderError,
  NuntiusSchemaError,
  isNuntiusError,
} from "../index.ts";
import type { NuntiusErrorCode } from "../index.ts";

describe("NuntiusError", () => {
  it("defaults the code to UNKNOWN_ERROR when omitted", () => {
    expect(new NuntiusError({ message: "x" }).code).toBe("UNKNOWN_ERROR");
  });
});

describe("error type surface", () => {
  it("NuntiusErrorCode is the seven literal codes", () => {
    expectTypeOf<NuntiusErrorCode>().toEqualTypeOf<
      | "SCHEMA_ERROR"
      | "CONFIG_ERROR"
      | "PROVIDER_ERROR"
      | "RESOLVE_ERROR"
      | "DELIVER_ERROR"
      | "FINALIZE_ERROR"
      | "UNKNOWN_ERROR"
    >();
  });

  it("NuntiusError.code is the full code union", () => {
    expectTypeOf<NuntiusError["code"]>().toEqualTypeOf<NuntiusErrorCode>();
  });

  it("subclasses narrow code to their forced literal", () => {
    expectTypeOf<NuntiusSchemaError["code"]>().toEqualTypeOf<"SCHEMA_ERROR">();
    expectTypeOf<NuntiusProviderError["code"]>().toEqualTypeOf<"PROVIDER_ERROR">();
  });
});

describe("isNuntiusError", () => {
  it("returns true for Nuntius errors", () => {
    expect(isNuntiusError(new NuntiusError({ message: "x" }))).toBe(true);
    expect(isNuntiusError(new NuntiusSchemaError({ message: "x", issues: [] }))).toBe(true);
    expect(
      isNuntiusError(
        new NuntiusProviderError({ message: "x", provider: "mock", retriable: false }),
      ),
    ).toBe(true);
  });

  it("returns false for plain errors and non-objects", () => {
    expect(isNuntiusError(new Error("plain"))).toBe(false);
    expect(isNuntiusError({})).toBe(false);
    expect(isNuntiusError(null)).toBe(false);
    expect(isNuntiusError(42)).toBe(false);
    expect(isNuntiusError(undefined)).toBe(false);
  });
});

describe("NuntiusSchemaError", () => {
  it("forces SCHEMA_ERROR and carries the zod issues", () => {
    const schema = z.object({ amount: z.number() });
    const parsed = schema.safeParse({ amount: "not a number" });

    if (parsed.success) throw new Error("expected a failed parse");

    const err = new NuntiusSchemaError({
      message: "invalid payload",
      issues: parsed.error.issues,
    });

    expect(err.code).toBe("SCHEMA_ERROR");
    expect(err.issues.length).toBeGreaterThan(0);
    expect(err.issues[0]?.path).toEqual(["amount"]);
    expect(err).toBeInstanceOf(NuntiusError);
  });

  it("serializes issues in toJSON", () => {
    const err = new NuntiusSchemaError({
      message: "invalid",
      issues: [{ code: "custom", path: ["amount"], message: "Expected number, received string" }],
    });

    expect(err.toJSON()).toMatchObject({
      code: "SCHEMA_ERROR",
      issues: [{ code: "custom", path: ["amount"], message: "Expected number, received string" }],
    });
  });
});

describe("NuntiusProviderError", () => {
  it("forces PROVIDER_ERROR and carries provider metadata", () => {
    const err = new NuntiusProviderError({
      message: "provider rejected the request",
      provider: "mock",
      httpStatus: 401,
      providerCode: "unauthorized",
      retriable: false,
    });

    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.provider).toBe("mock");
    expect(err.httpStatus).toBe(401);
    expect(err.providerCode).toBe("unauthorized");
    expect(err.retriable).toBe(false);
    expect(err).toBeInstanceOf(NuntiusError);
  });

  it("round-trips through JSON", () => {
    const err = new NuntiusProviderError({
      message: "provider rejected the request",
      provider: "mock",
      httpStatus: 429,
      providerCode: 447,
      retriable: true,
      notificationId: "n-1",
      channel: "sms",
    });

    expect(JSON.parse(JSON.stringify(err))).toEqual(err.toJSON());
  });
});
