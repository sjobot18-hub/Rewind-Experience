"use client";

import { useState } from "react";

const staticSeats = [
  "F1", "01","02","03","04","05","06","07","08","09","10",
  "11","12","13","14","15","16","17","18","19","20",
  "21","22","23","24","25","26","27","28","29","30",
  "31","32","33","34","35"
];

export default function SeatsClient() {
  const [paymentId, setPaymentId] = useState("");
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapSeats, setMapSeats] = useState<any[]>([]);

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
      setSelected(json.selectedSeat ?? null);
      setVerified(true);
      await loadSeatMap();
    } catch (e: any) {
      setError("Payment verification failed.");
      setVerified(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadSeatMap() {
    const response = await fetch("/api/seats/map", { method: "GET" });
    const json = await response.json();
    if (json.ok) {
      setMapSeats(json.seats ?? []);
    }
  }

  function selectLocalSeat(seat: string) {
    const seatRow = mapSeats.find((s) => s.seat_number === seat);
    if (!seatRow || seatRow.status === "occupied" || seatRow.status === "disabled") {
      setError("That seat is currently unavailable.");
      return;
    }

    setSelected(seat);
    setError(null);
  }

  async function confirmSeat(seat: string) {
    setError(null);
    if (!seat || !user || !event || !paymentId) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/seats/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, seat })
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        setError(json.message || "Seat could not be selected.");
        return;
      }

      setSelected(seat);
      setError(null);
      await loadSeatMap();
    } catch (e: any) {
      setError("Seat selection failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const seatRows = Array.from(new Set(mapSeats.map((s) => Number(s.row_number ?? 0)))).sort((a, b) => a - b);

  return (
    <main className="seat-portal min-h-screen">
      <section className="seat-shell">
        <section className="portal-title">
          <div className="brand-mark">Rewind Experience</div>
          <h1>Big Costa Bus</h1>
          <div className="subtitle">Select Your Seat</div>
        </section>

        {!verified && (
          <section className="verification-card">
            <div className="verification-heading">
              <h2>Payment ID verification</h2>
              <p>Enter your payment ID to continue.</p>
              <small>You need at least ₦5,000 total valid payment before selecting a seat.</small>
            </div>
            {error && <div className="error-box">{error}</div>}
            <div className="verify-form">
              <label>
                <span>Payment ID</span>
                <input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} placeholder="PAY0004" />
              </label>
              <button className="primary-button" disabled={loading} onClick={verifyPayment}>
                {loading ? "Verifying..." : "Verify Payment ID"}
              </button>
            </div>
          </section>
        )}

        {verified && user && event && (
          <section className="seat-layout">
            <section className="bus-panel">
              <div className="panel-head">
                <div>
                  <div className="event-label">{event.name} {event.year}</div>
                  <div className="bus-name">Big Costa Bus</div>
                </div>
                <div className="verified-chip">Payment verified</div>
              </div>

              <div className="legend-strip">
                <span className="legend-item"><span className="legend-dot window-dot"></span>Window</span>
                <span className="legend-item"><span className="legend-dot aisle-dot"></span>Aisle</span>
                <span className="legend-item"><span className="legend-dot middle-dot"></span>Middle</span>
              </div>

              <div className="bus-map-wrap">
                <div className="bus-super-header">
                  <span className="front-text">FRONT OF BUS</span>
                  <span className="driver">DRIVER</span>
                  <span className="back-text">BACK OF BUS</span>
                </div>
                <div className="bus-map">
                  <div className="bus-front"><div className="bus-driver">Driver</div></div>
                  <div className="rows-wrap">
                    <div className="bus-title-row">
                      <span className="bus-label">Front of Bus</span>
                      <span className="bus-label text-right">Back of Bus</span>
                    </div>
                    <div className="seat-rows">
                      {seatRows.map((rowNumber) => {
                        const rowSeats = mapSeats.filter((s) => Number(s.row_number) === rowNumber).sort((a, b) => Number(a.position_in_row) - Number(b.position_in_row));
                        return (
                          <div className="seat-row" key={rowNumber}>
                            {rowSeats.map((seat) => {
                              const selectedNow = selected === seat.seat_number;
                              const cls = [
                                "seat-card",
                                seat.status === "occupied" ? "occupied-card" : "",
                                seat.status === "disabled" ? "disabled-card" : "",
                                seat.status === "available" ? "available-card" : "",
                                selectedNow ? "selected-card" : "",
                              ].join(" ");
                              const label = seat.status === "occupied" ? seat.display_name : seat.status === "disabled" ? "DISABLED" : "AVAILABLE";
                              return (
                                <button key={seat.seat_id} className={cls} title={`${seat.seat_number} ${seat.seat_type}`}
                                  onClick={() => {
                                    if (seat.status === "occupied" || seat.status === "disabled") {
                                      setError("That seat is currently unavailable.");
                                      return;
                                    }
                                    selectLocalSeat(seat.seat_number);
                                  }}>
                                  <span className="seat-number">{seat.seat_number}</span>
                                  <span className="seat-type">{seat.seat_type || "Aisle"}</span>
                                  <span className="seat-name">{seat.status === "occupied" ? seat.display_name : label}</span>
                                  {selectedNow && <span className="seat-selected-label">YOUR SEAT</span>}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <aside className="selection-panel">
              <div className="guest-card">
                <div className="meta-label">Guest</div>
                <div className="guest-name">{user.full_name}</div>
              </div>

              <div className="selection-card">
                <div className="selection-label">Selected seat</div>
                {selected ? (
                  <div className="selected-summary">
                    <div className="selected-seat-number">{selected}</div>
                    <div className="selected-seat-meta">
                      <span className="window-tag">{mapSeats.find((s) => s.seat_number === selected)?.seat_type ?? "Seat"}</span>
                      <span className="selected-seat-row">Seat {selected}</span>
                    </div>
                  </div>
                ) : (
                  <div className="empty-summary">No seat selected</div>
                )}

                <button className="primary-button confirm-button" disabled={submitting} onClick={() => selected ? confirmSeat(selected) : setError("Choose a seat first.")}>{submitting ? "Confirming..." : "Confirm Seat"}</button>
              </div>

              {error && <div className="error-box side-error">{error}</div>}
            </aside>
          </section>
        )}
      </section>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }
        .seat-portal { background: #eef3f8; color: #12243a; font-family: Inter, Arial, sans-serif; }
        .seat-shell { max-width: 1280px; margin: 0 auto; padding: 24px 16px 56px; }
        .portal-title { text-align: center; margin-bottom: 20px; }
        .brand-mark { font-size: 11px; font-weight: 900; letter-spacing: .22em; color: #27415c; text-transform: uppercase; }
        .portal-title h1 { margin: 12px 0 8px; font-size: clamp(30px, 4vw, 42px); font-weight: 900; color: #102a43; }
        .subtitle { font-size: 13px; color: #475569; }
        .verification-card, .bus-panel, .selection-panel { border-radius: 16px; background: #fff; border: 1px solid rgba(148,163,184,.4); box-shadow: 0 8px 30px rgba(15,23,42,.08); }
        .verification-card { max-width: 640px; margin: 0 auto; padding: 26px; }
        .verification-heading h2 { color: #102a43; margin: 0 0 10px; font-size: 26px; font-weight: 900; }
        .verification-heading p { color: #64748b; margin: 0; font-weight: 700; }
        .verification-heading small { display: block; color: #64748b; margin-top: 8px; }
        .verify-form { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
        .verify-form label span { display: block; font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 8px; }
        .verify-form input { width: 100%; min-height: 44px; border-radius: 10px; border: 1px solid #cbd5e1; padding: 12px; font-size: 14px; }
        .primary-button { min-height: 42px; padding: 12px 18px; border-radius: 8px; background: #102a43; color: #fff; font-size: 12px; font-weight: 900; letter-spacing: .1em; border: none; cursor: pointer; }
        .primary-button:hover { background: #1e3a5f; }
        .seat-layout { display: grid; grid-template-columns: minmax(680px, 1fr) 320px; gap: 24px; align-items: start; }
        .bus-panel { padding: 20px; }
        .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .event-label { font-size: 11px; font-weight: 900; letter-spacing: .16em; color: #64748b; text-transform: uppercase; }
        .bus-name { font-size: 26px; font-weight: 900; color: #102a43; margin-top: 6px; }
        .verified-chip { background: #dcfce7; color: #166534; border-radius: 999px; padding: 8px 14px; font-size: 11px; font-weight: 900; }
        .legend-strip { display: flex; gap: 16px; align-items: center; justify-content: center; margin: 18px 0 12px; flex-wrap: wrap; }
        .legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; color: #475569; }
        .legend-dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
        .window-dot { background: #bfdbfe; border: 1px solid #2563eb; }
        .aisle-dot { background: #d1fae5; border: 1px solid #10b981; }
        .middle-dot { background: #fde68a; border: 1px solid #b45309; }
        .bus-map-wrap { border-radius: 16px; background: linear-gradient(180deg, #eef4f9, #ddeaf1); border: 1px solid #cbd5e1; padding: 14px; overflow-x: auto; }
        .bus-super-header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; font-size: 11px; font-weight: 900; color: #475569; margin-bottom: 8px; }
        .front-text { justify-self: start; text-transform: uppercase; letter-spacing: .09em; }
        .back-text { justify-self: end; text-transform: uppercase; letter-spacing: .09em; }
        .driver { justify-self: center; background: #102a43; color: #fff; border-radius: 999px; padding: 5px 16px; border: 1px solid #102a43; }
        .bus-map { border-radius: 12px; background: #eef4f9; padding: 12px; border: 1px solid #cbd5e1; }
        .bus-front { height: 58px; background: #102a43; border-radius: 12px 12px 0 0; text-align: center; display: flex; align-items: center; justify-content: center; color: #fff; }
        .bus-driver { border-radius: 10px; border: 1px solid #e2e8f0; padding: 4px 14px; font-weight: 800; background: #27415c; }
        .rows-wrap { margin-top: 14px; }
        .bus-title-row { display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; color: #475569; margin-bottom: 10px; }
        .seat-rows { display: flex; flex-direction: column; gap: 8px; }
        .seat-row { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; justify-content: center; }
        .seat-card { width: clamp(52px, 60px, 62px); min-height: 54px; border-radius: 10px; border: 1px solid #94a3b8; background: #fff; color: #102a43; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-weight: 900; cursor: pointer; }
        .seat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(15,23,42,.15); }
        .seat-number { font-size: 11px; }
        .seat-type { font-size: 8px; text-transform: uppercase; color: #475569; }
        .seat-name { font-size: 10px; }
        .available-card { background: #ecfdf5; color: #065f46; }
        .occupied-card { background: #fed7aa; color: #9a5d00; }
        .disabled-card { background: #e5e7eb; color: #475569; }
        .selected-card { background: #ffedd5; color: #7c2d12; border: 2px solid #f59e0b; }
        .seat-selected-label { font-size: 8px; color: #7c2d12; font-weight: 900; margin-top: 4px; }
        .selection-panel { padding: 20px; min-height: 100%; }
        .guest-card { border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
        .meta-label, .selection-label { font-size: 10px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; color: #64748b; }
        .guest-name { font-size: 26px; font-weight: 900; color: #102a43; margin-top: 8px; }
        .selection-card { margin-top: 20px; }
        .selected-summary { background: #eef4f9; border-radius: 12px; padding: 16px; margin: 12px 0 14px; }
        .selected-seat-number { font-size: 40px; font-weight: 900; color: #102a43; }
        .selected-seat-meta { display: flex; gap: 8px; align-items: center; }
        .window-tag { font-size: 10px; font-weight: 900; color: #fff; background: #102a43; border-radius: 999px; padding: 4px 8px; }
        .selected-seat-row { font-size: 11px; color: #475569; font-weight: 700; }
        .empty-summary { padding: 16px; background: #eef4f9; border-radius: 12px; color: #64748b; font-size: 12px; font-weight: 800; }
        .confirm-button { width: 100%; margin-top: 14px; }
        .error-box { background: #fee2e2; color: #b91c1c; border-radius: 10px; padding: 11px 12px; font-size: 12px; font-weight: 800; margin-top: 12px; }
        @media (max-width: 900px) {
          .seat-layout { grid-template-columns: 1fr; }
          .seat-rows { gap: 8px; }
          .seat-card { min-height: 50px; }
        }
      `}</style>
    </main>
  );
}
