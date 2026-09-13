"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// A labelled input. The label is always a real <label> bound by id -- a placeholder is not a
// label, and a floating one disappears exactly when the user needs it most (while typing).
export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, mono, className, id, ...props },
  ref,
) {
  const generated = React.useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium leading-none">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hintId, errorId) || undefined}
        className={cn(
          "h-11 w-full rounded-md border border-input bg-background px-3.5 text-sm",
          "placeholder:text-muted-foreground/60",
          "transition-[border-color,box-shadow] duration-[120ms] ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          mono && "font-mono text-[0.8125rem]",
          error && "border-critical focus-visible:ring-critical",
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-[0.8125rem] font-medium text-critical">
          {error}
        </p>
      )}
    </div>
  );
});
