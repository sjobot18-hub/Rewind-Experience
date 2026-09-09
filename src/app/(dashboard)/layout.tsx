import { getCurrentAdmin, getActiveEvent, can } from "@/lib/currentAdmin";
import NavClient from "./nav-client";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, permissions, isOwner } = await getCurrentAdmin();
  const activeEvent = await getActiveEvent();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", show: can(permissions, isOwner, "view_dashboard") },
    { href: "/guests", label: "Guests", show: can(permissions, isOwner, "manage_guests") },
    { href: "/outstanding", label: "Outstanding", show: can(permissions, isOwner, "manage_payments") },
    { href: "/payments", label: "Payments", show: can(permissions, isOwner, "manage_payments") },
    { href: "/expenses", label: "Expenses", show: can(permissions, isOwner, "manage_expenses") },
    { href: "/finance", label: "Finance", show: can(permissions, isOwner, "view_finance") },
    { href: "/reports", label: "Reports", show: can(permissions, isOwner, "manage_reports") },
    { href: "/events", label: "Events", show: isOwner || can(permissions, isOwner, "create_events") },
    { href: "/admins", label: "Administrators", show: isOwner || can(permissions, isOwner, "manage_administrators") },
    { href: "/audit-log", label: "Audit Log", show: can(permissions, isOwner, "view_audit_logs") },
    { href: "/settings", label: "Settings", show: isOwner || can(permissions, isOwner, "manage_event_settings") },
  ].filter((i) => i.show);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <NavClient navItems={navItems} adminName={profile.full_name} isOwner={isOwner} activeEvent={activeEvent} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="hidden md:flex bg-navy text-white px-4 py-3 items-center justify-between sticky top-0 z-10">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gold">Active Event</p>
            <p className="font-semibold text-sm">
              {activeEvent ? `${activeEvent.name} ${activeEvent.year}` : "No active event"}
            </p>
          </div>
          <span className="text-xs text-slate-300 hidden sm:block">{profile.full_name}</span>
        </header>

        <main className="flex-1 p-4 pt-20 md:p-6 pb-28 md:pb-6 md:pt-0">{children}</main>
      </div>
    </div>
  );
}
