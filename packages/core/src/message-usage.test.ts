import { describe, expect, it } from "vitest";
import {
  addMessageUsage,
  aggregateUsageRecords,
  applyMessageUsageByRunId,
  attachMessageUsageByRun,
  concentrateAllMessageUsage,
  concentrateMessageUsageByRunId,
  findMessageUsageTargetIndex,
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

  it("sums tokens for a run and blanks model when records disagree", () => {
    const mixed = aggregateUsageRecords([
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
    const same = aggregateUsageRecords([
      {
        runId: "run-2",
        provider: "scripted",
        model: "scripted",
        inputTokens: 12,
        outputTokens: 40,
      },
      {
        runId: "run-2",
        provider: "scripted",
        model: "scripted",
        inputTokens: 3,
        outputTokens: 1,
      },
    ]);

    expect(mixed.get("run-1")).toEqual({
      provider: "",
      model: "",
      inputTokens: 12,
      outputTokens: 12,
    });
    expect(same.get("run-2")).toEqual({
      provider: "scripted",
      model: "scripted",
      inputTokens: 15,
      outputTokens: 41,
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

  it("applies run usage only to the terminal bot message for that run", () => {
    const loaded = {
      provider: "scripted",
      model: "scripted",
      inputTokens: 12,
      outputTokens: 40,
    };
    const extra = {
      provider: "scripted",
      model: "scripted",
      inputTokens: 3,
      outputTokens: 1,
    };
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
        id: "bot-narration",
        threadId: "thread-1",
        seq: 2,
        role: "bot" as const,
        blocks: [{ kind: "text" as const, text: "Working on it." }],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:01.000Z",
      },
      {
        id: "subagent:research",
        threadId: "thread-1",
        seq: 3,
        role: "bot" as const,
        blocks: [
          {
            kind: "subagent" as const,
            agentId: "research",
            name: "Research",
            task: "Find sources",
            status: "running" as const,
          },
        ],
        runId: "run-1",
        usage: loaded,
        createdAt: "2026-09-22T00:00:02.000Z",
      },
      {
        id: "bot-terminal",
        threadId: "thread-1",
        seq: 4,
        role: "bot" as const,
        blocks: [{ kind: "text" as const, text: "Done." }],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:03.000Z",
      },
      {
        id: "bot-other-run",
        threadId: "thread-1",
        seq: 5,
        role: "bot" as const,
        blocks: [],
        runId: "run-2",
        createdAt: "2026-09-22T00:00:04.000Z",
      },
    ];

    expect(findMessageUsageTargetIndex(messages, "run-1")).toBe(3);

    const next = applyMessageUsageByRunId(messages, "run-1", extra);

    expect(next[0]).toBe(messages[0]);
    expect(next[1]).toEqual(messages[1]);
    expect(next[2]).not.toHaveProperty("usage");
    expect(next[3]).toMatchObject({
      id: "bot-terminal",
      usage: {
        provider: "scripted",
        model: "scripted",
        inputTokens: 15,
        outputTokens: 41,
      },
    });
    expect(next[4]).toBe(messages[4]);
    expect(applyMessageUsageByRunId(messages, undefined, extra)).toBe(messages);
  });

  it("falls back to the live bubble when no durable reply exists yet", () => {
    const usage = {
      provider: "scripted",
      model: "scripted",
      inputTokens: 12,
      outputTokens: 40,
    };
    const messages = [
      {
        id: "progress:run-1",
        threadId: "thread-1",
        seq: 2,
        role: "bot" as const,
        blocks: [{ kind: "progress" as const, text: "working…" }],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:01.000Z",
      },
      {
        id: "subagent:research",
        threadId: "thread-1",
        seq: 3,
        role: "bot" as const,
        blocks: [
          {
            kind: "subagent" as const,
            agentId: "research",
            name: "Research",
            task: "Find sources",
            status: "running" as const,
          },
        ],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:02.000Z",
      },
    ];

    expect(findMessageUsageTargetIndex(messages, "run-1")).toBe(1);
    expect(applyMessageUsageByRunId(messages, "run-1", usage)[1]).toMatchObject({
      id: "subagent:research",
      usage,
    });
  });

  it("attaches aggregated usage to the thread-wide terminal when given its id", () => {
    const usageByRun = new Map([
      [
        "run-1",
        {
          provider: "scripted",
          model: "scripted",
          inputTokens: 12,
          outputTokens: 40,
        },
      ],
    ]);
    const messages = [
      {
        id: "bot-narration",
        threadId: "thread-1",
        seq: 1,
        role: "bot" as const,
        blocks: [{ kind: "text" as const, text: "Working." }],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:01.000Z",
      },
      {
        id: "bot-terminal",
        threadId: "thread-1",
        seq: 2,
        role: "bot" as const,
        blocks: [{ kind: "text" as const, text: "Done." }],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:02.000Z",
      },
    ];

    const onPage = attachMessageUsageByRun(
      messages,
      usageByRun,
      new Map([["run-1", "bot-terminal"]]),
    );
    expect(onPage[0]).toEqual(messages[0]);
    expect(onPage[1]).toMatchObject({
      id: "bot-terminal",
      usage: usageByRun.get("run-1"),
    });

    const olderOnly = attachMessageUsageByRun(
      [messages[0]!],
      usageByRun,
      new Map([["run-1", "bot-terminal"]]),
    );
    expect(olderOnly[0]).toEqual(messages[0]);
  });

  it("moves usage onto the terminal reply when concentrating a run", () => {
    const usage = {
      provider: "scripted",
      model: "scripted",
      inputTokens: 12,
      outputTokens: 40,
    };
    const messages = [
      {
        id: "bot-narration",
        threadId: "thread-1",
        seq: 1,
        role: "bot" as const,
        blocks: [{ kind: "text" as const, text: "Working." }],
        runId: "run-1",
        usage,
        createdAt: "2026-09-22T00:00:01.000Z",
      },
      {
        id: "bot-terminal",
        threadId: "thread-1",
        seq: 2,
        role: "bot" as const,
        blocks: [{ kind: "text" as const, text: "Done." }],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:02.000Z",
      },
    ];

    const next = concentrateMessageUsageByRunId(messages, "run-1");
    expect(next[0]).not.toHaveProperty("usage");
    expect(next[1]).toMatchObject({ id: "bot-terminal", usage });
  });

  it("does not attach usage when the terminal seq is not on the page", () => {
    const usageByRun = new Map([
      [
        "run-1",
        {
          provider: "scripted",
          model: "scripted",
          inputTokens: 12,
          outputTokens: 40,
        },
      ],
    ]);
    const messages = [
      {
        id: "bot-narration",
        threadId: "thread-1",
        seq: 1,
        role: "bot" as const,
        blocks: [{ kind: "text" as const, text: "Working." }],
        runId: "run-1",
        createdAt: "2026-09-22T00:00:01.000Z",
      },
    ];

    expect(
      attachMessageUsageByRun(messages, usageByRun, new Map([["run-1", "bot-terminal"]])),
    ).toEqual(messages);
  });

  it("concentrates usage after older and newer pages are merged", () => {
    const usage = {
      provider: "scripted",
      model: "scripted",
      inputTokens: 12,
      outputTokens: 40,
    };
    const messages = [
      {
        id: "bot-narration",
        threadId: "thread-1",
        seq: 1,
        role: "bot" as const,
        blocks: [{ kind: "text" as const, text: "Working." }],
        runId: "run-1",
        usage,
        createdAt: "2026-09-22T00:00:01.000Z",
      },
      {
        id: "bot-terminal",
        threadId: "thread-1",
        seq: 2,
        role: "bot" as const,
        blocks: [{ kind: "text" as const, text: "Done." }],
        runId: "run-1",
        usage,
        createdAt: "2026-09-22T00:00:02.000Z",
      },
    ];

    const next = concentrateAllMessageUsage(messages);
    expect(next[0]).not.toHaveProperty("usage");
    expect(next[1]).toMatchObject({ id: "bot-terminal", usage });
  });
});
