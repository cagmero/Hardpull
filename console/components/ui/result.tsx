"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./button";

/** Copy-to-clipboard for values a user has to move between apps -- subjectIds, grant tokens. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard is blocked outside a secure context; leave the label unchanged rather
          // than claiming a copy that did not happen.
        }
      }}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
        "text-muted-foreground transition-colors duration-[120ms] ease-out hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** Monospaced value with a copy affordance. Truncates visually, copies in full. */
export function Mono({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem]">{value}</code>
      <CopyButton value={value} />
    </span>
  );
}

/**
 * The three states every data surface needs, in one place so no page can quietly skip one.
 * `idle` renders the empty state, which says what to do next rather than just "no data".
 */
export function ResultPanel({
  state,
  error,
  empty,
  children,
  className,
}: {
  state: "idle" | "loading" | "error" | "ready";
  error?: string;
  empty: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  if (state === "loading") {
    return (
      <div className={cn("space-y-2.5", className)} aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading</span>
        {/* Skeletons rather than a bare spinner: the layout does not jump when data lands. */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative overflow-hidden rounded-md bg-muted" style={{ height: 44 }}>
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-background/50 to-transparent motion-safe:animate-[shimmer_1.4s_infinite]" />
          </div>
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        role="alert"
        className={cn("rounded-md border border-critical/30 bg-critical/5 p-4", className)}
      >
        <p className="text-sm font-medium text-critical">Something went wrong</p>
        <p className="mt-1 break-words text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (state === "idle") {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {empty}
      </div>
    );
  }

  return <div className={cn("animate-fade", className)}>{children}</div>;
}

/** Pretty-printed JSON for raw API responses -- the "show me exactly what came back" surface. */
export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-md border border-border bg-muted/50 p-4 font-mono text-[0.8125rem] leading-relaxed",
        className,
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function InlineSpinner() {
  return <Spinner className="text-muted-foreground" />;
}
