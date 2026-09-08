import { createClient } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/currentAdmin";
import { formatDate } from "@/lib/format";

export default async function AuditLogPage() {
  const activeEvent = await getActiveEvent();
  const supabase = createClient();

  const query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data } = activeEvent ? await query.eq("event_id", activeEvent.id) : await query;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-navy">Audit Log</h1>
      <p className="text-sm text-slate-500">Read-only. Entries cannot be edited or deleted by any administrator.</p>

      <div className="card space-y-3">
        {(data ?? []).map((log) => (
          <div key={log.id} className="border-b border-slate-100 pb-3 text-sm">
            <div className="flex justify-between">
              <p className="font-medium">{log.action.replaceAll("_", " ")}</p>
              <p className="text-xs text-slate-400">{formatDate(log.created_at)}</p>
            </div>
            <p className="text-xs text-slate-500">
              {log.actor_email ?? "system"} {log.record_type ? `· ${log.record_type} ${log.record_id ?? ""}` : ""}
            </p>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="text-slate-400 text-sm">No audit entries yet.</p>}
      </div>
    </div>
  );
}
