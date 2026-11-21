"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number; section?: string };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  let lastSection: string | undefined;
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path === it.href || path.startsWith(it.href + "/");
        const header = it.section && it.section !== lastSection ? it.section : null;
        lastSection = it.section;
        return (
          <div key={it.href} className="shrink-0">
            {header && (
              <p className="mt-4 hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:block">{header}</p>
            )}
            <Link
              href={it.href}
              className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {it.label}
              {!!it.badge && (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{it.badge}</span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
