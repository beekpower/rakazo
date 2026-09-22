import type { MessageUsage, ThreadMessage } from "@rakazo/contracts";

export type { MessageUsage };

export function isMessageUsage(value: unknown): value is MessageUsage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.provider === "string" &&
    candidate.provider.length > 0 &&
    typeof candidate.model === "string" &&
    candidate.model.length > 0 &&
    Number.isInteger(candidate.inputTokens) &&
    Number.isInteger(candidate.outputTokens) &&
    (candidate.inputTokens as number) >= 0 &&
    (candidate.outputTokens as number) >= 0
  );
}

export function addMessageUsage(
  previous: MessageUsage | undefined,
  next: MessageUsage,
): MessageUsage {
  const usage = {
    provider: next.provider,
    model: next.model,
    inputTokens: next.inputTokens,
    outputTokens: next.outputTokens,
  };
  if (!previous) return usage;
  const sameModel = previous.provider === usage.provider && previous.model === usage.model;
  return {
    provider: sameModel ? usage.provider : "",
    model: sameModel ? usage.model : "",
    inputTokens: previous.inputTokens + usage.inputTokens,
    outputTokens: previous.outputTokens + usage.outputTokens,
  };
}

export function aggregateUsageRecords(
  rows: ReadonlyArray<{
    runId: string | null;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }>,
): Map<string, MessageUsage> {
  const byRun = new Map<string, MessageUsage>();
  for (const row of rows) {
    if (!row.runId) continue;
    byRun.set(
      row.runId,
      addMessageUsage(byRun.get(row.runId), {
        provider: row.provider,
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
      }),
    );
  }
  return byRun;
}

/** Progress and subagent bubbles are live chrome, not the terminal reply. */
export function isEphemeralBotMessageId(id: string): boolean {
  return id.startsWith("progress:") || id.startsWith("subagent:");
}

/**
 * Prefer the last durable bot message for a run (terminal reply / final narration).
 * Fall back to the last ephemeral bot bubble so live usage can land before a durable reply.
 */
export function findMessageUsageTargetIndex(
  messages: readonly ThreadMessage[],
  runId: string,
): number {
  let durableIndex = -1;
  let fallbackIndex = -1;
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    if (message.role !== "bot" || message.runId !== runId) continue;
    fallbackIndex = i;
    if (!isEphemeralBotMessageId(message.id)) durableIndex = i;
  }
  return durableIndex >= 0 ? durableIndex : fallbackIndex;
}

function withoutUsage(message: ThreadMessage): ThreadMessage {
  if (!("usage" in message) || message.usage === undefined) return message;
  const { usage: _usage, ...rest } = message;
  return rest;
}

/**
 * Keep a run's usage on one bot message so narration / subagent / terminal do not
 * each show the full run total.
 */
export function concentrateMessageUsageByRunId(
  messages: readonly ThreadMessage[],
  runId: string | undefined,
): ThreadMessage[] {
  if (!runId) return messages as ThreadMessage[];
  const targetIndex = findMessageUsageTargetIndex(messages, runId);
  if (targetIndex < 0) return messages as ThreadMessage[];

  const target = messages[targetIndex]!;
  let donor = target.usage;
  if (!donor) {
    for (const message of messages) {
      if (message.role === "bot" && message.runId === runId && message.usage) {
        donor = message.usage;
        break;
      }
    }
  }

  let changed = false;
  const next = messages.map((message, index) => {
    if (message.role !== "bot" || message.runId !== runId) return message;
    if (index === targetIndex) {
      if (!donor || message.usage === donor) return message;
      changed = true;
      return { ...message, usage: donor };
    }
    if (message.usage) {
      changed = true;
      return withoutUsage(message);
    }
    return message;
  });
  return changed ? next : (messages as ThreadMessage[]);
}

export function applyMessageUsageByRunId(
  messages: readonly ThreadMessage[],
  runId: string | undefined,
  usage: MessageUsage,
): ThreadMessage[] {
  if (!runId) return messages as ThreadMessage[];
  const targetIndex = findMessageUsageTargetIndex(messages, runId);
  if (targetIndex < 0) return messages as ThreadMessage[];

  let previous = messages[targetIndex]!.usage;
  if (!previous) {
    for (const message of messages) {
      if (message.role === "bot" && message.runId === runId && message.usage) {
        previous = message.usage;
        break;
      }
    }
  }

  let changed = false;
  const next = messages.map((message, index) => {
    if (message.role !== "bot" || message.runId !== runId) return message;
    if (index === targetIndex) {
      changed = true;
      return { ...message, usage: addMessageUsage(previous, usage) };
    }
    if (message.usage) {
      changed = true;
      return withoutUsage(message);
    }
    return message;
  });
  return changed ? next : (messages as ThreadMessage[]);
}

/** Page-load join: attach each run's aggregated usage to one preferred bot message. */
export function attachMessageUsageByRun(
  messages: readonly ThreadMessage[],
  usageByRun: ReadonlyMap<string, MessageUsage>,
  terminalMessageIdByRun?: ReadonlyMap<string, string>,
): ThreadMessage[] {
  if (usageByRun.size === 0) return messages as ThreadMessage[];

  const targetByRun = new Map<string, number>();
  for (const runId of usageByRun.keys()) {
    const terminalId = terminalMessageIdByRun?.get(runId);
    const index =
      terminalId !== undefined
        ? messages.findIndex((message) => message.id === terminalId)
        : findMessageUsageTargetIndex(messages, runId);
    if (index >= 0) targetByRun.set(runId, index);
  }
  if (targetByRun.size === 0) return messages as ThreadMessage[];

  let changed = false;
  const next = messages.map((message, index) => {
    if (message.role !== "bot" || !message.runId) return message;
    const usage = usageByRun.get(message.runId);
    if (!usage) return message;
    if (targetByRun.get(message.runId) !== index) return message;
    changed = true;
    return { ...message, usage };
  });
  return changed ? next : (messages as ThreadMessage[]);
}

/** After merging history pages, keep each run's usage on one preferred message. */
export function concentrateAllMessageUsage(messages: readonly ThreadMessage[]): ThreadMessage[] {
  const runIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "bot" && message.runId && message.usage) runIds.add(message.runId);
  }
  let next = messages as ThreadMessage[];
  for (const runId of runIds) {
    next = concentrateMessageUsageByRunId(next, runId);
  }
  return next;
}
