import { describe, expect, it } from "vitest";
import {
  addMessageUsage,
  aggregateUsageRecords,
  applyMessageUsageByRunId,
  isMessageUsage,
} from "./message-usage.js";

describe("message usage", () => {
  it("accepts a complete usage payload and rejects incomplete ones", () => {
    expect(
      isMessageUsage({
        provider: "scripted",
        model: "scripted",
        inputTokens: 12,
        outputTokens: 40,
      }),
    ).toBe(true);
    expect(isMessageUsage({ model: "scripted", inputTokens: 12, outputTokens: 40 })).toBe(false);
    expect(
      isMessageUsage({ provider: "scripted", model: "", inputTokens: 1, outputTokens: 1 }),
    ).toBe(false);
  });

  it("keeps the latest model and sums tokens across records for a run", () => {
    const byRun = aggregateUsageRecords([
      {
        runId: "run-1",
        provider: "openai",
        model: "gpt-4.1",
        inputTokens: 10,
        outputTokens: 4,
      },
      {
        runId: "run-1",
        provider: "openai",
        model: "gpt-4.1-mini",
        inputTokens: 2,
        outputTokens: 8,
      },
      {
        runId: null,
        provider: "openai",
        model: "ignored",
        inputTokens: 99,
        outputTokens: 99,
      },
    ]);

    expect(byRun.get("run-1")).toEqual({
      provider: "openai",
      model: "gpt-4.1-mini",
      inputTokens: 12,
      outputTokens: 12,
    });
    expect(
      addMessageUsage(undefined, { provider: "x", model: "y", inputTokens: 1, outputTokens: 2 }),
    ).toEqual({
      provider: "x",
      model: "y",
      inputTokens: 1,
      outputTokens: 2,
    });
  });

  it("applies run usage only to bot messages with that run", () => {
    const messages = [
      {
        id: "user-1",
        threadId: "thread-1",
        seq: 1,
        role: "user" as const,
        blocks: [],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:00.000Z",
      },
      {
        id: "bot-1",
        threadId: "thread-1",
        seq: 2,
        role: "bot" as const,
        blocks: [],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:01.000Z",
      },
      {
        id: "bot-2",
        threadId: "thread-1",
        seq: 3,
        role: "bot" as const,
        blocks: [],
        runId: "run-2",
        createdAt: "2026-09-22T00:00:02.000Z",
      },
    ];
    const usage = {
      provider: "scripted",
      model: "scripted",
      inputTokens: 12,
      outputTokens: 40,
    };

    const next = applyMessageUsageByRunId(messages, "run-1", usage);

    expect(next[0]).toBe(messages[0]);
    expect(next[1]).toMatchObject({ id: "bot-1", usage });
    expect(next[2]).toBe(messages[2]);
    expect(applyMessageUsageByRunId(messages, undefined, usage)).toBe(messages);
  });
});
