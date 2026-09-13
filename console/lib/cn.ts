import { twMerge } from "tailwind-merge";

/**
 * Joins class names and resolves Tailwind conflicts, last-wins.
 *
 * This started as a plain string join on the reasoning that we own every component here, so
 * there was no third-party class string to de-conflict. That reasoning was wrong, and a
 * rendered page showed it: `<Badge className="bg-critical/10 text-critical">` came out grey,
 * because Badge's own base `bg-muted text-muted-foreground` and the override have identical
 * specificity, so the winner is whichever Tailwind emitted later in the stylesheet -- not
 * whichever appeared later in the class attribute. Overriding our OWN base classes is the
 * common case, not the rare one.
 *
 * twMerge removes the losing class entirely instead of relying on source order.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
