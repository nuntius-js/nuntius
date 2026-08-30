import type * as z from "zod";
import { NuntiusSchemaError } from "../errors/index.ts";

export function validate<P>(schema: z.ZodType<P>, payload: unknown, notificationId: string): P {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new NuntiusSchemaError({
      message: `Payload failed schema validation for notification '${notificationId}'`,
      notificationId,
      issues: result.error.issues,
    });
  }
  return result.data;
}
