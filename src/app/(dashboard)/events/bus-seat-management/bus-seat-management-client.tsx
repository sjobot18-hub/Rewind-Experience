"use client";

import { useEffect, useState } from "react";

export default function BusSeatManagementClient({ event, admin, isOwner, permissions }: any) {
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMap() {
      try {
        setLoading(true);
        const response = await fetch(`/api/seats/map?event_id=${event?.id ?? ""}`);
        const json = await response.json();
        if (json.ok) {
          setSeats(json.seats ?? []);
        }
      } catch {
        setSeats([]);
      } finally {
        setLoading(false);
      }
    }

    if (event?.id) {
      loadMap();
    }
  }, [event?.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Bus & Seat Management</div>
          <h1 className="text-2xl font-black text-navy mt-2">Rewind Experience</h1>
          <div className="text-sm text-slate-500">Big Costa</div>
        </div>
        <button className="btn-primary" onClick={() => setOpen(!open)}>{open ? "Close" : "Open Seat Selection"}</button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card"><span className="font-bold text-slate-600">Administrator</span><p className="text-sm mt-2">{admin}</p></div>
        <div className="card"><span className="font-bold text-slate-600">Event</span><p className="text-sm mt-2">{event?.name ?? "Rewind Experience"}</p></div>
        <div className="card"><span className="font-bold text-slate-600">Bus</span><p className="text-sm mt-2">Big Costa</p></div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <span className="font-black text-navy">Big Costa Seat Map</span>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {loading ? "Loading" : `${seats.length} seats`}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-5 md:grid-cols-7 gap-2">
          {seats.map((seat) => (
            <div key={seat.seat_id} className="rounded-xl border p-2 text-center bg-white">
              <div className="font-black text-slate-800">{seat.seat_number}</div>
              <div className={`mt-1 text-[10px] font-bold uppercase ${seat.status === "occupied" ? "text-amber-700" : seat.status === "disabled" ? "text-slate-500" : "text-emerald-700"}`}>{seat.status}</div>
              <div className="mt-1 text-[10px] font-semibold truncate text-slate-500">{seat.display_name}</div>
              <div className="mt-2 flex justify-center gap-1">
                <button className="btn-secondary btn-xs">Release</button>
                <button className="btn-secondary btn-xs">Assign</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .btn-secondary { border: 1px solid #94a3b8; background: #fff; color: #102a43; ... }
        .btn-xs { font-size: 10px; padding: 4px 8px; border-radius: 8px; }
      `}</style>
    </div>
  );
}
