"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app/customers", label: "顧客", icon: "👤" },
  { href: "/app/bookings", label: "予約", icon: "📅" },
  { href: "/app/slots", label: "空き枠", icon: "🕒" },
  { href: "/app/report", label: "レポート", icon: "📈" },
  { href: "/app/settings", label: "設定", icon: "⚙️" },
];

export function BottomNav() {
  return <NavBar pathname={usePathname()} />;
}

/** pathname が分からない間（初回表示）は、どれも選択していない状態で表示する */
export function NavBar({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl">
        {ITEMS.map((it) => {
          const active = pathname.startsWith(it.href) || (it.href === "/app/customers" && pathname.startsWith("/app/visits"));
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "font-bold text-brand-600" : "text-neutral-500"}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="text-lg leading-none" aria-hidden>{it.icon}</span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
