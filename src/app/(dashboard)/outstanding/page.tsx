import { createClient } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/currentAdmin";
import { formatNaira } from "@/lib/format";
import { GuestFinancials } from "@/lib/types";
import Link from "next/link";

export default async function OutstandingPage() {
  const activeEvent = await getActiveEvent();
  if (!activeEvent) return <p className="text-slate-500">No active event selected.</p>;

  const supabase = createClient();
  const { data } = await supabase
    .from("guest_financials")
    .select("*")
    .eq("event_id", activeEvent.id)
    .gt("balance", 0)
    .order("balance", { ascending: false });

  const guests = (data as GuestFinancials[]) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-navy">Outstanding Payments</h1>

      <div className="grid gap-3 md:hidden">
        {guests.map((g) => {
          const whatsappUrl = `https://wa.me/${g.phone_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
            `Hi ${g.full_name}, this is a reminder about your outstanding balance of ${formatNaira(g.balance)} for ${activeEvent.name} ${activeEvent.year}. Kindly complete your payment. Thank you!`
          )}`;
          return (
            <div key={g.guest_id} className="card">
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold">{g.full_name}</p>
                  <p className="text-xs text-slate-400">{g.guest_code} · {g.phone_number}</p>
                </div>
                <p className="font-bold text-unpaid">{formatNaira(g.balance)}</p>
              </div>
              <div className="flex gap-2 mt-3">
                <Link href={`/guests/${g.guest_id}`} className="btn-secondary flex-1 text-center text-xs py-2">Record Payment</Link>
                <a href={whatsappUrl} target="_blank" rel="noreferrer" className="btn-primary flex-1 text-center text-xs py-2">WhatsApp</a>
              </div>
            </div>
          );
        })}
        {guests.length === 0 && <p className="text-slate-400 text-sm">No outstanding balances. Everyone is paid up!</p>}
      </div>

      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4">Guest ID</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Ticket Fee</th>
              <th className="py-2 pr-4">Paid</th>
              <th className="py-2 pr-4">Remaining</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.guest_id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{g.guest_code}</td>
                <td className="py-2 pr-4">{g.full_name}</td>
                <td className="py-2 pr-4">{g.phone_number}</td>
                <td className="py-2 pr-4">{formatNaira(g.ticket_fee)}</td>
                <td className="py-2 pr-4">{formatNaira(g.total_paid)}</td>
                <td className="py-2 pr-4 font-medium text-unpaid">{formatNaira(g.balance)}</td>
                <td className="py-2 pr-4">
                  <Link href={`/guests/${g.guest_id}`} className="text-blue font-medium">Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {guests.length === 0 && <p className="text-slate-400 text-sm py-4">No outstanding balances.</p>}
      </div>
    </div>
  );
}
