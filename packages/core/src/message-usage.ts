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

export function applyMessageUsageByRunId(
  messages: readonly ThreadMessage[],
  runId: string | undefined,
  usage: MessageUsage,
): ThreadMessage[] {
  if (!runId) return messages as ThreadMessage[];
  let changed = false;
  const next = messages.map((message) => {
    if (message.runId !== runId || message.role !== "bot") return message;
    changed = true;
    return { ...message, usage: addMessageUsage(message.usage, usage) };
  });
  return changed ? next : (messages as ThreadMessage[]);
}
