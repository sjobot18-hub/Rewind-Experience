import { createClient } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/currentAdmin";
import { formatNaira, formatDate } from "@/lib/format";

export default async function FinancePage() {
  const activeEvent = await getActiveEvent();
  if (!activeEvent) return <p className="text-slate-500">No active event selected.</p>;

  const supabase = createClient();
  const { data } = await supabase
    .from("finance_timeline")
    .select("*")
    .eq("event_id", activeEvent.id)
    .eq("is_voided", false)
    .order("txn_date", { ascending: true })
    .order("created_at", { ascending: true });

  let running = 0;
  const rows = (data ?? []).map((r) => {
    running += Number(r.money_in) - Number(r.money_out);
    return { ...r, running_balance: running };
  }).reverse(); // show most recent first

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-navy">Finance Timeline</h1>

      <div className="grid gap-2 md:hidden">
        {rows.map((r) => (
          <div key={r.txn_id} className="card">
            <div className="flex justify-between">
              <p className="font-semibold text-sm">{r.description}</p>
              <p className={`text-sm font-bold ${r.txn_type === "payment" ? "text-paid" : "text-unpaid"}`}>
                {r.txn_type === "payment" ? "+" : "-"}{formatNaira(r.money_in || r.money_out)}
              </p>
            </div>
            <p className="text-xs text-slate-400">{formatDate(r.txn_date)} · {r.txn_code}</p>
            <p className="text-xs text-slate-500 mt-1">Running Balance: {formatNaira(r.running_balance)}</p>
          </div>
        ))}
        {rows.length === 0 && <p className="text-slate-400 text-sm">No transactions yet.</p>}
      </div>

      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Transaction ID</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Money In</th>
              <th className="py-2 pr-4">Money Out</th>
              <th className="py-2 pr-4">Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.txn_id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{formatDate(r.txn_date)}</td>
                <td className="py-2 pr-4">{r.txn_code}</td>
                <td className="py-2 pr-4 capitalize">{r.txn_type}</td>
                <td className="py-2 pr-4">{r.description}</td>
                <td className="py-2 pr-4 text-paid">{r.money_in > 0 ? formatNaira(r.money_in) : "—"}</td>
                <td className="py-2 pr-4 text-unpaid">{r.money_out > 0 ? formatNaira(r.money_out) : "—"}</td>
                <td className="py-2 pr-4 font-medium">{formatNaira(r.running_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-slate-400 text-sm py-4">No transactions yet.</p>}
      </div>
    </div>
  );
}
