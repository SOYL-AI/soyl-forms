"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings2 } from "lucide-react";
import { signOut } from "@/lib/auth/actions";

export function UserMenu({
  email,
  name,
  workspaceName,
}: {
  email: string | null;
  name: string | null;
  workspaceName: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-2xl border border-line bg-paper p-1.5 shadow-pop"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{name ?? email ?? "Account"}</p>
            {name && email ? <p className="truncate text-xs text-ink-faint">{email}</p> : null}
            <p className="mt-0.5 truncate text-[11px] uppercase tracking-wide text-ink-faint">{workspaceName}</p>
          </div>
          <Link
            role="menuitem"
            href="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-ink/5 hover:text-ink"
          >
            <Settings2 className="h-4 w-4" /> Account settings
          </Link>
          <form action={signOut}>
            <button
              role="menuitem"
              type="submit"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink-soft hover:bg-ink/5 hover:text-ink"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
