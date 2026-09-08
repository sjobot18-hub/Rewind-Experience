"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  label: string;
}

export default function NavClient({
  navItems,
  adminName,
  isOwner,
}: {
  navItems: NavItem[];
  adminName: string;
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Desktop sidebar */}
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
                pathname === item.href
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
            Logout
          </button>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex overflow-x-auto z-20">
        {navItems.slice(0, 5).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 min-w-[70px] text-center py-2.5 text-[11px] font-medium ${
              pathname === item.href ? "text-blue" : "text-slate-500"
            }`}
          >
            {item.label}
          </Link>
        ))}
        <button onClick={handleLogout} className="flex-1 min-w-[70px] text-center py-2.5 text-[11px] font-medium text-unpaid">
          Logout
        </button>
      </nav>
    </>
  );
}
