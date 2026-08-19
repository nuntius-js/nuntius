import type * as z from "zod";

import { NuntiusError } from "../errors/index.ts";
import { BUILTIN_CHANNEL_NEEDS, CHANNEL_NEEDS } from "../types/notification.ts";
import type {
  ChannelConfig,
  ChannelNeeds,
  EmailChannel,
  NotificationDefinition,
  PushChannel,
  SmsChannel,
} from "../types/notification.ts";

export type DefineChannelConfig<K extends string = string> = {
  name: K;
  needs: ChannelNeeds;
};

export function defineChannel<K extends string>(
  channelDef: DefineChannelConfig<K>,
): (opts?: Record<string, unknown>) => ChannelConfig {
  return (opts?: Record<string, unknown>): ChannelConfig => ({
    ...(opts ?? {}),
    needs: channelDef.needs,
    channel: channelDef.name,
  });
}

export function email(opts?: { from?: string; subject?: string }): EmailChannel {
  return {
    ...(opts ?? {}),
    channel: "email",
    needs: "email",
  };
}

export function sms(opts?: { from?: string }): SmsChannel {
  return {
    ...(opts ?? {}),
    channel: "sms",
    needs: "phone",
  };
}

export function push(opts?: { title?: string }): PushChannel {
  return {
    ...(opts ?? {}),
    channel: "push",
    needs: "pushToken",
  };
}

export type NotificationConfig<P> = {
  nuntiusId: string;
  schema: z.ZodType<P>;
  channels: ReadonlyArray<ChannelConfig>;
};

const NUNTIUS_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const NUNTIUS_ID_MAX_LENGTH = 100;

export function notification<P>(config: NotificationConfig<P>): NotificationDefinition<P> {
  if (
    typeof config.nuntiusId !== "string" ||
    config.nuntiusId.trim().length === 0 ||
    config.nuntiusId.length > NUNTIUS_ID_MAX_LENGTH ||
    !NUNTIUS_ID_PATTERN.test(config.nuntiusId)
  ) {
    throw new NuntiusError({
      code: "CONFIG_ERROR",
      message: `nuntiusId must be a non-empty string of lowercase alphanumeric segments joined by '.', '_' or '-', max ${NUNTIUS_ID_MAX_LENGTH} characters`,
    });
  }

  const schema: unknown = config.schema;
  if (
    typeof schema !== "object" ||
    schema === null ||
    typeof (schema as { safeParse?: unknown }).safeParse !== "function"
  ) {
    throw new NuntiusError({
      code: "CONFIG_ERROR",
      notificationId: config.nuntiusId,
      message: "schema must be a Zod schema (expected a safeParse method)",
    });
  }

  if (config.channels.length === 0) {
    throw new NuntiusError({
      code: "CONFIG_ERROR",
      notificationId: config.nuntiusId,
      message: `Notification '${config.nuntiusId}' must declare at least one channel`,
    });
  }

  const seenChannels = new Set<string>();
  for (const channelItem of config.channels) {
    const channelName: string = channelItem.channel;
    if (channelName.trim().length === 0) {
      throw new NuntiusError({
        code: "CONFIG_ERROR",
        notificationId: config.nuntiusId,
        message: `Notification '${config.nuntiusId}' contains an invalid channel config object`,
      });
    }

    const runtimeNeeds: unknown = channelItem.needs;
    if (
      runtimeNeeds === undefined ||
      typeof runtimeNeeds !== "string" ||
      !(CHANNEL_NEEDS as readonly string[]).includes(runtimeNeeds)
    ) {
      throw new NuntiusError({
        code: "CONFIG_ERROR",
        notificationId: config.nuntiusId,
        channel: channelName,
        message: `Channel '${channelName}' has invalid needs: "${String(runtimeNeeds)}". Valid: ${CHANNEL_NEEDS.join(", ")}`,
      });
    }

    const pinnedNeeds = (BUILTIN_CHANNEL_NEEDS as Record<string, string | undefined>)[channelName];
    if (pinnedNeeds !== undefined && runtimeNeeds !== pinnedNeeds) {
      throw new NuntiusError({
        code: "CONFIG_ERROR",
        notificationId: config.nuntiusId,
        channel: channelName,
        message: `Channel '${channelName}' must declare needs: "${pinnedNeeds}", got "${runtimeNeeds}"`,
      });
    }

    if (seenChannels.has(channelName)) {
      throw new NuntiusError({
        code: "CONFIG_ERROR",
        notificationId: config.nuntiusId,
        message: `Notification '${config.nuntiusId}' contains duplicate channel '${channelName}'`,
      });
    }
    seenChannels.add(channelName);
  }

  const frozen: NotificationDefinition<P> = Object.freeze({
    nuntiusId: config.nuntiusId,
    schema: config.schema,
    channels: Object.freeze(
      config.channels.map((channelItem) => Object.freeze({ ...channelItem })),
    ),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- phantom type field; never read at runtime
    _payload: undefined as unknown as P,
  });
  return frozen;
}
