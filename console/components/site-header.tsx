"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/verify", label: "Verify" },
  { href: "/furnish", label: "Furnish" },
  { href: "/pull", label: "Pull" },
  { href: "/file", label: "My file" },
  { href: "/standing", label: "Standing" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Logo />
          <span className="text-[0.9375rem] font-semibold tracking-tight">Hardpull</span>
        </Link>

        <nav aria-label="Main" className="no-scrollbar -mx-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative shrink-0 rounded-md px-3 py-2 text-sm transition-colors duration-[120ms] ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 -bottom-[13px] h-px bg-primary"
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span
      aria-hidden="true"
      className="grid h-7 w-7 place-items-center rounded-[9px] bg-gradient-to-br from-primary to-primary/60 shadow-subtle"
    >
      {/* Two overlapping ledgers that never meet -- the product in one mark. */}
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary-foreground" fill="none">
        <path d="M5 7.5h7M5 12h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M12.5 16.5h6.5M14 12h5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.65"
        />
      </svg>
    </span>
  );
}
