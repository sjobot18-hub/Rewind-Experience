"use client";

import { useState } from "react";

const busSeats = [
  "F1", "01","02","03","04","05","06","07","08","09","10",
  "11","12","13","14","15","16","17","18","19","20",
  "21","22","23","24","25","26","27","28","29","30",
  "31","32","33","34","35"
];

export default function SeatsClient() {
  const [paymentId, setPaymentId] = useState("");
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function verifyPayment() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/seats/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId })
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        setError(json.message || "Payment could not be verified.");
        setVerified(false);
        return;
      }
      setUser(json.guest);
      setEvent(json.event);
      setSelected(json.selectedSeat);
      setVerified(true);
    } catch (e: any) {
      setError("Payment verification failed.");
      setVerified(false);
    } finally {
      setLoading(false);
    }
  }

  async function confirmSeat(seat: string) {
    setError(null);
    if (!seat || !user) return;
    setSelected(seat);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="max-w-6xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-blue">Rewind Experience</div>
          <h1 className="text-3xl font-black text-navy mt-3">Big Costa Bus</h1>
          <div className="text-sm text-slate-500 mt-2">Select Your Seat</div>
        </div>

        {!verified && (
          <div className="max-w-xl mx-auto card">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-navy">Payment ID verification</h2>
              <p className="text-sm text-slate-500 mt-1">Enter your payment ID to continue.</p>
            </div>
            {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
            <div className="space-y-4">
              <label className="block">
                <span className="block text-sm font-semibold mb-2">Payment ID</span>
                <input className="input-field" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} placeholder="PAY-2026-00482" />
              </label>
              <button className="btn-primary w-full" disabled={loading} onClick={verifyPayment}>
                {loading ? "Verifying..." : "Verify Payment ID"}
              </button>
            </div>
          </div>
        )}

        {verified && user && event && (
          <div className="grid lg:grid-cols-[1fr_420px] gap-6">
            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">{event.name} {event.year}</div>
                  <div className="text-xl font-black text-navy">Big Costa Bus</div>
                </div>
                <div className="rounded-full bg-green-50 text-green-800 px-4 py-2 text-xs font-bold">Payment verified</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-center mb-4">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Seat selection available
                  </span>
                </div>

                <div className="bus-map">
                  <div className="bus-front">
                    <div className="bus-driver">Driver</div>
                  </div>
                  <div className="rows-wrap">
                    <div className="bus-title-row">
                      <span className="bus-label">Front of Bus</span>
                      <span className="bus-label text-right">Back of Bus</span>
                    </div>
                    <div className="seat-grid">
                      <button className="seat front-seat" title="F1">F1</button>
                      {busSeats.filter((s) => s !== "F1").map((seat) => (
                        <button key={seat} className={seat === selected ? "seat selected-seat" : "seat available-seat"} title={seat} onClick={() => confirmSeat(seat)}>
                          {seat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <aside className="card">
              <div className="mb-5">
                <div className="text-xs uppercase tracking-wide text-slate-500">Guest</div>
                <div className="text-lg font-black text-navy">{user.full_name}</div>
                <div className="text-xs text-slate-500">{user.guest_code}</div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Selected seat</div>
                {selected ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="text-3xl font-black text-navy">{selected}</div>
                    <div className="text-xs text-slate-600 mt-2">Seat {selected} · Row {Math.max(1, Number(selected) > 35 ? 1 : Math.ceil(Number(selected) / 5))}</div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No seat selected</div>
                )}

                <button className="btn-primary w-full mt-4" onClick={() => confirmSeat(selected || "01")}>Confirm Seat</button>
              </div>
            </aside>
          </div>
        )}
      </section>

      <style jsx>{`
        .bus-map { border-radius: 14px; background: linear-gradient(180deg, #eef4f9, #ddeaf1); padding: 14px; border: 1px solid #cbd5e1; }
        .bus-front { height: 56px; border-radius: 16px 16px 0 0; background: #102a43; color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; letter-spacing: 0.12em; }
        .bus-driver { border-radius: 12px; border: 1px solid #e2e8f0; padding: 6px 18px; background: #27415c; }
        .rows-wrap { margin-top: 14px; }
        .bus-title-row { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 10px; }
        .bus-label { letter-spacing: 0.08em; }
        .seat-grid { display: grid; grid-template-columns: repeat(6, minmax(36px, 1fr)); gap: 8px; align-items: center; justify-items: center; }
        .seat { width: 38px; height: 38px; border-radius: 10px; font-size: 12px; font-weight: 900; border: 1px solid #94a3b8; background: #fff; color: #102a43; }
        .front-seat { background: #e1e7ee; color: #102a43; }
        .available-seat { background: #eefaf5; color: #0f766e; border-color: #94a3b8; }
        .selected-seat { background: #ffbd59; color: #702b00; border: 2px solid #b45309; }
      `}</style>
    </main>
  );
}
