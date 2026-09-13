import { cn } from "@/lib/cn";

export type VerdictLevel = "CLEAR" | "WARNING" | "CRITICAL" | "INSUFFICIENT_DATA";

// Severity is carried by color AND by the word itself, never by color alone -- a colorblind
// underwriter has to be able to read this, and so does a screenshot in a grayscale print-out.
const STYLES: Record<VerdictLevel, { chip: string; dot: string; label: string }> = {
  CLEAR: { chip: "border-clear/25 bg-clear/10 text-clear", dot: "bg-clear", label: "Clear" },
  WARNING: {
    chip: "border-warning/25 bg-warning/10 text-warning",
    dot: "bg-warning",
    label: "Warning",
  },
  CRITICAL: {
    chip: "border-critical/25 bg-critical/10 text-critical",
    dot: "bg-critical",
    label: "Critical",
  },
  INSUFFICIENT_DATA: {
    chip: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    label: "Insufficient data",
  },
};

export function VerdictBadge({ verdict, className }: { verdict: VerdictLevel; className?: string }) {
  const style = STYLES[verdict] ?? STYLES.INSUFFICIENT_DATA;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        style.chip,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden="true" />
      {style.label}
    </span>
  );
}

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
