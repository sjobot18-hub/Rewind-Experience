"use client";

import { useState } from "react";

export default function BusSeatManagementClient({ event, admin, isOwner, permissions }: any) {
  const [open, setOpen] = useState(false);
  const busSeats = [
    "F1", "01","02","03","04","05","06","07","08","09","10",
    "11","12","13","14","15","16","17","18","19","20",
    "21","22","23","24","25","26","27","28","29","30",
    "31","32","33","34","35"
  ];

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

      <div className="card">
        <div className="grid grid-cols-8 gap-2">
          <button className="seat admin-seat">F1</button>
          {busSeats.filter((s) => s !== "F1").map((seat) => (
            <button key={seat} className="seat admin-seat" title={seat}>{seat}</button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card"><span className="font-bold text-slate-600">Administrator</span><p className="text-sm mt-2">{admin}</p></div>
        <div className="card"><span className="font-bold text-slate-600">Event</span><p className="text-sm mt-2">{event?.name ?? "Rewind Experience"}</p></div>
        <div className="card"><span className="font-bold text-slate-600">Bus</span><p className="text-sm mt-2">Big Costa</p></div>
      </div>

      <style jsx>{`
        .seat-grid { display: grid; grid-template-columns: repeat(6, minmax(36px, 1fr)); gap: 8px; }
        .seat { width: 38px; height: 38px; border-radius: 8px; font-size: 11px; font-weight: 900; border: 1px solid #94a3b8; background: #fff; color: #102a43; }
        .admin-seat { margin: 2px; }
      `}</style>
    </div>
  );
}
