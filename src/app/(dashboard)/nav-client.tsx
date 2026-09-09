"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EventRecord } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
}

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavClient({
  navItems,
  adminName,
  isOwner,
  activeEvent,
}: {
  navItems: NavItem[];
  adminName: string;
  isOwner: boolean;
  activeEvent: EventRecord | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    setMobileOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const frequentNavItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/guests", label: "Guests" },
    { href: "/payments", label: "Payments" },
    { href: "/expenses", label: "Expenses" },
  ];

  return (
    <>
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 bg-navy text-white px-4 py-2 flex items-center justify-between">
        <div className="min-w-0 pr-3">
          <p className="text-[9px] uppercase tracking-[0.16em] text-gold">Active Event</p>
          <p className="font-semibold text-[13px] leading-tight truncate">
            {activeEvent ? `${activeEvent.name} ${activeEvent.year}` : "No active event"}
          </p>
        </div>
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-gold"
        >
          <span className="flex flex-col gap-1">
            <span className="block h-0.5 w-4 bg-current rounded" />
            <span className="block h-0.5 w-4 bg-current rounded" />
            <span className="block h-0.5 w-4 bg-current rounded" />
          </span>
        </button>
      </header>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="md:hidden fixed inset-0 z-40 bg-slate-950/45"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <nav className="hidden md:flex md:flex-col md:w-56 bg-white border-r border-slate-200 shrink-0">
        <div className="px-5 py-5 border-b border-slate-100">
          <p className="font-bold text-navy leading-tight">Rewind Experience</p>
          <p className="text-xs text-slate-400">{isOwner ? "Owner" : "Administrator"}</p>
        </div>
        <div className="flex-1 py-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-5 py-2.5 text-sm font-medium ${
                isCurrentPath(pathname, item.href)
                  ? "text-blue bg-blue/5 border-r-2 border-blue"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-500 truncate mb-2">{adminName}</p>
          <button onClick={handleLogout} className="text-sm text-unpaid font-medium">
            Log Out
          </button>
        </div>
      </nav>

      <aside
        className={`md:hidden fixed left-0 top-0 bottom-0 z-50 w-[280px] max-w-[85vw] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200">
          <div>
            <p className="font-bold text-navy">Rewind Experience</p>
            <p className="text-xs text-slate-500">{isOwner ? "Owner" : "Administrator"}</p>
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>
        <div className="overflow-y-auto py-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`block px-5 py-3 text-sm font-medium ${
                isCurrentPath(pathname, item.href)
                  ? "text-blue bg-blue/5 border-l-4 border-blue"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-5 py-3 text-left text-sm font-medium text-unpaid hover:bg-slate-50"
          >
            Log Out
          </button>
        </div>
        <div className="border-t border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500 truncate">{adminName}</p>
        </div>
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center overflow-x-auto z-20">
        {frequentNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 min-w-[72px] text-center py-2 text-[11px] font-medium ${
              isCurrentPath(pathname, item.href) ? "text-blue" : "text-slate-500"
            }`}
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex-1 min-w-[72px] text-center py-2 text-[11px] font-medium text-slate-500"
        >
          More
        </button>
      </nav>
    </>
  );
}
