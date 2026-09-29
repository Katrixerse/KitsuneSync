"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useKitsune, useSaveError } from "@/lib/store";

const LINKS = [
  { href: "/dashboard", label: "ID" },
  { href: "/lists", label: "Lists" },
  { href: "/shelf", label: "Shelf" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const { library } = useKitsune();
  const saveError = useSaveError();

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-void/85 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
          <span className="text-neon-pink">狐</span>
          <span className="hidden sm:inline">
            Kitsune<span className="text-neon-cyan">Sync</span>
          </span>
        </Link>
        <ul className="ml-auto flex items-center gap-0.5 overflow-x-auto sm:gap-1">
          {LINKS.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`block px-1.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition sm:px-3 sm:text-[11px] sm:tracking-widest ${
                    active ? "bg-neon-cyan/10 text-neon-cyan" : "text-mute hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        {saveError && (
          <span role="alert" className="font-mono text-[11px] text-neon-pink">
            ✖ {saveError}
          </span>
        )}
        {library && (
          <span className="hidden font-mono text-[11px] text-mute md:inline">
            @{library.user.name}
            {library.demo && <span className="ml-1 text-neon-yellow">[demo]</span>}
          </span>
        )}
      </nav>
    </header>
  );
}
