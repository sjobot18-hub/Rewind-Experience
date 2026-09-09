// Single source of truth for the permission catalogue. Keep this in sync with
// the permission strings referenced by RLS policies in
// supabase/migrations/0001_init.sql — the database enforces these, this file
// is what the UI uses to decide what to show/hide (a courtesy, not a
// security boundary — the real boundary is the database).

export const ALL_PERMISSIONS = [
  "view_dashboard",
  "manage_guests",
  "manage_payments",
  "manage_expenses",
  "view_finance",
  "manage_reports",
  "export_data",
  "manage_event_settings",
  "manage_seats",
  "create_events",
  "manage_administrators",
  "invite_administrators",
  "view_audit_logs",
  "manage_backups",
  "delete_records",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  view_dashboard: "View Dashboard",
  manage_guests: "Manage Guests",
  manage_payments: "Manage Payments",
  manage_expenses: "Manage Expenses",
  view_finance: "View Finance",
  manage_reports: "Manage Reports",
  export_data: "Export Data",
  manage_event_settings: "Manage Event Settings",
  manage_seats: "Manage Seats",
  create_events: "Create Events",
  manage_administrators: "Manage Administrators",
  invite_administrators: "Invite Administrators",
  view_audit_logs: "View Audit Logs",
  manage_backups: "Manage Backups",
  delete_records: "Delete Records",
};

export const ROLE_DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  owner: [...ALL_PERMISSIONS],
  finance_admin: [
    "view_dashboard",
    "manage_guests",
    "manage_payments",
    "manage_expenses",
    "view_finance",
    "manage_reports",
    "export_data",
    "manage_seats",
  ],
  event_admin: ["view_dashboard", "manage_guests", "manage_event_settings", "manage_reports", "manage_seats"],
  custom_admin: ["view_dashboard"],
};

export function hasPermission(userPermissions: string[], isOwner: boolean, perm: Permission) {
  return isOwner || userPermissions.includes(perm);
}
