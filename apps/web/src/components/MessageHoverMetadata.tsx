import type { ReactNode } from "react";

export function MessageHoverUsage({ children }: { children: ReactNode }) {
  return (
    <span
      data-testid="message-hover-usage"
      className="pointer-events-none absolute top-6 end-0 z-10 max-w-44 truncate text-xs tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 group-has-[[aria-expanded=true]]/message:opacity-100"
    >
      {children}
    </span>
  );
}

export function MessageHoverMetadata({
  side,
  pinned = false,
  children,
}: {
  side: "start" | "end";
  pinned?: boolean;
  children: ReactNode;
}) {
  // Touch exposes More; hover-capable pointers reveal the full rail on demand.
  const reveal = pinned
    ? "pointer-events-auto opacity-100"
    : "pointer-events-auto opacity-100 [@media(hover:hover)_and_(pointer:fine)]:pointer-events-none [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover/message:pointer-events-auto [@media(hover:hover)_and_(pointer:fine)]:group-hover/message:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus-within:pointer-events-auto [@media(hover:hover)_and_(pointer:fine)]:focus-within:opacity-100";

  return (
    <div
      data-testid="message-hover-rail"
      className={`absolute top-1/2 z-10 flex -translate-y-1/2 items-center transition-opacity ${reveal} ${
        side === "end" ? "start-full ms-1" : "end-full me-1"
      }`}
    >
      {children}
    </div>
  );
}
