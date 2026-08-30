import type { Contact, Recipient, RecipientResolver } from "../types/send.ts";
import { NuntiusResolveError } from "../errors/index.ts";

export type ResolvedRecipient = {
  recipient?: Recipient;
  contact: Contact;
};

export function isRecipient(to: Recipient | Contact): to is Recipient {
  return "userId" in to && typeof to.userId === "string";
}

export async function resolve(
  to: Recipient | Contact,
  resolver: RecipientResolver | undefined,
  notificationId: string,
): Promise<ResolvedRecipient> {
  if (!isRecipient(to)) {
    return { contact: to };
  }
  if (!resolver) {
    throw new NuntiusResolveError({
      message: `Recipient requires a resolver for notification '${notificationId}'`,
      notificationId,
    });
  }
  try {
    const contact = await resolver(to);
    return { recipient: to, contact };
  } catch (cause) {
    throw new NuntiusResolveError({
      message: `Resolver failed for notification '${notificationId}'`,
      notificationId,
      cause,
    });
  }
}
