import type * as z from "zod";

export const NUNTIUS_ERROR_CODES = [
  "SCHEMA_ERROR",
  "CONFIG_ERROR",
  "PROVIDER_ERROR",
  "RESOLVE_ERROR",
  "DELIVER_ERROR",
  "FINALIZE_ERROR",
  "UNKNOWN_ERROR",
] as const;

export type NuntiusErrorCode = (typeof NUNTIUS_ERROR_CODES)[number];

export type NuntiusErrorOptions = {
  message: string;
  code?: NuntiusErrorCode;
  notificationId?: string;
  channel?: string;
  cause?: unknown;
};

export class NuntiusError extends Error {
  readonly code: NuntiusErrorCode;
  readonly notificationId?: string;
  readonly channel?: string;

  constructor(opts: NuntiusErrorOptions) {
    super(opts.message, { cause: opts.cause });
    this.name = "NuntiusError";
    this.code = opts.code ?? "UNKNOWN_ERROR";
    this.notificationId = opts.notificationId;
    this.channel = opts.channel;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      notificationId: this.notificationId,
      channel: this.channel,
    };
  }
}

export const isNuntiusError = (value: unknown): value is NuntiusError =>
  value instanceof NuntiusError;

export type NuntiusSchemaErrorOptions = NuntiusErrorOptions & {
  issues: z.ZodError["issues"];
};

export class NuntiusSchemaError extends NuntiusError {
  declare readonly code: "SCHEMA_ERROR";
  readonly issues: z.ZodError["issues"];

  constructor(opts: NuntiusSchemaErrorOptions) {
    super({ ...opts, code: "SCHEMA_ERROR" });
    this.issues = opts.issues;
  }

  override toJSON() {
    return { ...super.toJSON(), issues: this.issues };
  }
}

export type NuntiusProviderErrorOptions = NuntiusErrorOptions & {
  provider: string;
  httpStatus?: number;
  providerCode?: string | number;
  retriable: boolean;
};

export class NuntiusProviderError extends NuntiusError {
  declare readonly code: "PROVIDER_ERROR";
  readonly provider: string;
  readonly httpStatus?: number;
  readonly providerCode?: string | number;
  readonly retriable: boolean;

  constructor(opts: NuntiusProviderErrorOptions) {
    super({ ...opts, code: "PROVIDER_ERROR" });
    this.provider = opts.provider;
    this.httpStatus = opts.httpStatus;
    this.providerCode = opts.providerCode;
    this.retriable = opts.retriable;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      provider: this.provider,
      httpStatus: this.httpStatus,
      providerCode: this.providerCode,
      retriable: this.retriable,
    };
  }
}

export class NuntiusResolveError extends NuntiusError {
  declare readonly code: "RESOLVE_ERROR";
  constructor(opts: NuntiusErrorOptions) {
    super({ ...opts, code: "RESOLVE_ERROR" });
  }
}

export type NuntiusDeliverErrorOptions = NuntiusErrorOptions & {
  provider: string;
  retriable: boolean;
};

export class NuntiusDeliverError extends NuntiusError {
  declare readonly code: "DELIVER_ERROR";
  readonly provider: string;
  readonly retriable: boolean;
  constructor(opts: NuntiusDeliverErrorOptions) {
    super({ ...opts, code: "DELIVER_ERROR" });
    this.provider = opts.provider;
    this.retriable = opts.retriable;
  }
  override toJSON() {
    return { ...super.toJSON(), provider: this.provider, retriable: this.retriable };
  }
}

export class NuntiusFinalizeError extends NuntiusError {
  declare readonly code: "FINALIZE_ERROR";
  constructor(opts: NuntiusErrorOptions) {
    super({ ...opts, code: "FINALIZE_ERROR" });
  }
}
