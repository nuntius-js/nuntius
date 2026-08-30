import type { Contact, Recipient } from "../types/send.ts";
import type { ChannelConfig } from "../types/notification.ts";
import type { DeliveryContext, ProviderAdapter, ProviderSendResult } from "../provider/index.ts";
import { NuntiusDeliverError, NuntiusProviderError, NuntiusResolveError } from "../errors/index.ts";

export type DeliverInput = {
  notificationId: string;
  channels: ReadonlyArray<ChannelConfig>;
  payload: unknown;
  recipient?: Recipient;
  contact: Contact;
  providers: Record<string, ProviderAdapter>;
};

export type DeliverResult = {
  channel: ChannelConfig;
  result: ProviderSendResult;
};

export function pickChannel(
  channels: ReadonlyArray<ChannelConfig>,
  contact: Contact,
  providers: Record<string, ProviderAdapter>,
): ChannelConfig | null {
  for (const channel of channels) {
    if (!(channel.channel in providers)) {
      continue;
    }
    if (channel.needs === "none") {
      return channel;
    }
    const address = contact[channel.needs];
    if (address !== undefined && address !== "") {
      return channel;
    }
  }
  return null;
}

export async function deliver(input: DeliverInput): Promise<DeliverResult> {
  const channel = pickChannel(input.channels, input.contact, input.providers);
  if (channel === null) {
    const names = input.channels.map((c) => c.channel).join(", ");
    throw new NuntiusResolveError({
      message: `No channel could be delivered for notification '${input.notificationId}' — no registered provider and/or no resolved Contact address for: ${names}`,
      notificationId: input.notificationId,
    });
  }

  const provider = input.providers[channel.channel]!;
  const ctx: DeliveryContext = {
    notificationId: input.notificationId,
    config: channel,
    payload: input.payload,
    recipient: input.recipient,
    contact: input.contact,
  };
  let result: ProviderSendResult;
  try {
    result = await provider.send(ctx);
  } catch (cause) {
    if (cause instanceof NuntiusProviderError) throw cause;
    throw new NuntiusProviderError({
      provider: provider.name,
      notificationId: input.notificationId,
      channel: channel.channel,
      message: `Provider '${provider.name}' threw while sending via channel '${channel.channel}'`,
      cause,
      retriable: false,
    });
  }
  if (!result.success) {
    const cause = result.error;
    throw new NuntiusDeliverError({
      provider: provider.name,
      notificationId: input.notificationId,
      channel: channel.channel,
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
      retriable: cause instanceof NuntiusProviderError ? cause.retriable : false,
    });
  }
  return { channel, result };
}
