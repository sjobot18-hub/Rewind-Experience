"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type SeatStatus = "available" | "occupied" | "disabled";

type Seat = {
  seat_id: string;
  seat_number: string;
  status: SeatStatus;
  is_disabled: boolean;
};

type MapResponse = {
  ok: boolean;
  message?: string;
  seats?: Seat[];
};

type Verification = {
  fullName: string;
  paymentId: string;
  selectedSeat: string | null;
  seatSelectionOpen: boolean;
  deadline: string | null;
  canChangeSeats: boolean;
};

type VerifyResponse = {
  ok: boolean;
  message?: string;
  guest?: { full_name?: string };
  payment?: { public_payment_id?: string };
  selectedSeat?: string | null;
  seatSelectionOpen?: boolean;
  deadline?: string | null;
  canChangeSeats?: boolean;
};

type SelectResponse = {
  ok: boolean;
  message?: string;
  seat?: string;
};

const noStoreHeaders = {
  "Cache-Control": "no-cache",
};

export default function PublicSeatsClient() {
  const [paymentId, setPaymentId] = useState("");
  const [verification, setVerification] = useState<Verification | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [pendingSeat, setPendingSeat] = useState<Seat | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedSeat, setConfirmedSeat] = useState<string | null>(null);

  const loadMap = useCallback(async () => {
    setMapLoading(true);

    try {
      const response = await fetch("/api/seats/map", {
        cache: "no-store",
        headers: noStoreHeaders,
      });
      const json: MapResponse = await response.json();

      if (!response.ok || !json.ok) {
        setSeats([]);
        setMessage(json.message ?? "Unable to load the Big Costa seat map.");
        return;
      }

      setSeats(Array.isArray(json.seats) ? json.seats : []);
    } catch {
      setSeats([]);
      setMessage("Unable to load the Big Costa seat map.");
    } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMap();
  }, [loadMap]);

  async function verifyPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerifying(true);
    setMessage(null);

    try {
      const response = await fetch("/api/seats/verify", {
        method: "POST",
        cache: "no-store",
        headers: {
          ...noStoreHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentId }),
      });
      const json: VerifyResponse = await response.json();

      if (!response.ok || !json.ok || !json.guest || !json.payment) {
        setVerification(null);
        setMessage(json.message ?? "Payment verification failed.");
        return;
      }

      setVerification({
        fullName: json.guest.full_name ?? "Member",
        paymentId: json.payment.public_payment_id ?? paymentId.trim(),
        selectedSeat: json.selectedSeat ?? null,
        seatSelectionOpen: Boolean(json.seatSelectionOpen),
        deadline: json.deadline ?? null,
        canChangeSeats: Boolean(json.canChangeSeats),
      });
      setPendingSeat(null);
      setConfirmedSeat(null);
      setMessage(null);
      await loadMap();
    } catch {
      setVerification(null);
      setMessage("Payment verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  function chooseSeat(seat: Seat) {
    if (
      !verification ||
      !verification.seatSelectionOpen ||
      seat.status !== "available" ||
      (verification.selectedSeat !== null && !verification.canChangeSeats)
    ) {
      return;
    }

    setPendingSeat(seat);
    setMessage(null);
  }

  async function confirmSeat() {
    if (!verification || !pendingSeat || !verification.seatSelectionOpen) {
      return;
    }

    setConfirming(true);
    setMessage(null);

    try {
      const response = await fetch("/api/seats/select", {
        method: "POST",
        cache: "no-store",
        headers: {
          ...noStoreHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentId: verification.paymentId,
          seat: pendingSeat.seat_number,
        }),
      });
      const json: SelectResponse = await response.json();

      if (!response.ok || !json.ok) {
        setMessage(json.message ?? "Unable to select that seat.");
        await loadMap();
        return;
      }

      setVerification((current) =>
        current
          ? { ...current, selectedSeat: json.seat ?? pendingSeat.seat_number }
          : current
      );
      setConfirmedSeat(json.seat ?? pendingSeat.seat_number);
      setPendingSeat(null);
      setMessage(null);
      await loadMap();
    } catch {
      setMessage("Unable to select that seat.");
    } finally {
      setConfirming(false);
    }
  }

  const closed = verification && !verification.seatSelectionOpen;
  const hasExistingSeat = verification?.selectedSeat !== null && verification?.selectedSeat !== undefined;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Rewind Experience</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">Big Costa</h1>
        <p className="mt-2 text-slate-600">Big Costa Seat Selection</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={verifyPayment}>
          <label className="flex-1">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Enter your Payment ID to continue</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={paymentId}
              onChange={(event) => setPaymentId(event.target.value)}
              placeholder="PAY-123456"
              autoComplete="off"
              required
            />
          </label>
          <button className="mt-auto rounded-lg bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-60" disabled={verifying} type="submit">
            {verifying ? "Verifying…" : "Continue"}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Use the Payment ID from your Rewind Experience payment receipt.</p>

        {verification && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-bold">{verification.fullName}</p>
            <p>{verification.paymentId}</p>
            <p className="mt-2 font-semibold text-emerald-700">Eligible for seat selection</p>
            {hasExistingSeat && <p className="mt-2">Your seat is already assigned: <strong>{verification.selectedSeat}</strong></p>}
            {hasExistingSeat && !verification.canChangeSeats && <p className="mt-1 text-slate-600">Seat changes are not available for this event.</p>}
            {hasExistingSeat && verification.canChangeSeats && !closed && <p className="mt-1 text-slate-600">Choose one available seat below to change your seat.</p>}
            {closed && <p className="mt-2 font-semibold text-amber-700">Seat selection is currently closed.</p>}
            {!closed && verification.deadline && <p className="mt-2">Selection deadline: {new Date(verification.deadline).toLocaleString()}</p>}
          </div>
        )}

        {message && <p className="mt-3 text-sm font-medium text-slate-700" role="status">{message}</p>}
      </section>

      {confirmedSeat && verification && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-slate-800">
          <h2 className="text-xl font-black text-emerald-900">Seat Confirmed</h2>
          <p className="mt-1">Your Big Costa seat has been successfully assigned.</p>
          <dl className="mt-3 grid gap-1 text-sm">
            <div><dt className="inline font-semibold">Member: </dt><dd className="inline">{verification.fullName}</dd></div>
            <div><dt className="inline font-semibold">Seat: </dt><dd className="inline">{confirmedSeat}</dd></div>
            <div><dt className="inline font-semibold">Payment ID: </dt><dd className="inline">{verification.paymentId}</dd></div>
          </dl>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">Big Costa Seat Map</h2>
            <p className="text-sm text-slate-600">Available seats can be selected after verification.</p>
          </div>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => void loadMap()} type="button">
            Refresh
          </button>
        </div>

        {mapLoading ? (
          <p className="mt-5 text-sm text-slate-600">Loading seats…</p>
        ) : (
          <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {seats.map((seat) => {
              const isOwnSeat = verification?.selectedSeat === seat.seat_number;
              const isPending = pendingSeat?.seat_id === seat.seat_id;
              const canSelect = Boolean(verification?.seatSelectionOpen) && seat.status === "available" && (!hasExistingSeat || Boolean(verification?.canChangeSeats));
              const label = isPending ? "Selected" : isOwnSeat ? "Your seat" : seat.status;
              const seatClass = isPending
                ? "border-sky-600 bg-sky-50"
                : isOwnSeat
                  ? "border-emerald-600 bg-emerald-50"
                  : seat.status === "available"
                    ? "border-emerald-200 bg-white"
                    : seat.status === "disabled"
                      ? "border-slate-300 bg-slate-100"
                      : "border-rose-200 bg-rose-50";

              return (
                <button
                  className={`min-h-20 rounded-lg border p-2 text-center disabled:cursor-not-allowed disabled:opacity-70 ${seatClass}`}
                  disabled={!canSelect || confirming}
                  key={seat.seat_id}
                  onClick={() => chooseSeat(seat)}
                  type="button"
                >
                  <span className="block text-lg font-black text-slate-900">{seat.seat_number}</span>
                  <span className="block text-xs font-semibold capitalize text-slate-600">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {pendingSeat && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
            <p className="font-semibold text-slate-800">Selected seat: {pendingSeat.seat_number}</p>
            <div className="flex gap-2">
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" onClick={() => setPendingSeat(null)} type="button">Cancel</button>
              <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={confirming} onClick={() => void confirmSeat()} type="button">
                {confirming ? "Confirming…" : "Confirm Seat"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
