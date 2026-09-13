export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-aurora">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-widest text-primary">{eyebrow}</p>
        )}
        <h1 className="mt-2 text-title font-semibold text-balance">{title}</h1>
        {children && (
          <div className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">{children}</div>;
}

/** A numbered step heading, for the multi-stage demo flows. */
export function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs tabular text-primary">
        {n}
      </span>
      {children}
    </span>
  );
}
