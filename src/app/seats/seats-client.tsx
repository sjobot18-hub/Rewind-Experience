"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  event: any;
  admin: string;
  isOwner: boolean;
  permissions: string[];
};

export default function BusSeatManagementClient({
  event,
  admin,
  isOwner,
  permissions,
}: Props) {
  const [open, setOpen] = useState(
    Boolean(event?.seat_selection_open)
  );

  const [deadline, setDeadline] = useState(
    event?.seat_selection_deadline ?? ""
  );

  const [seats, setSeats] = useState<any[]>([]);
  const [eligibleGuests, setEligibleGuests] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busySeatId, setBusySeatId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const [message, setMessage] = useState<string | null>(null);

  const [selectedSeat, setSelectedSeat] = useState<any | null>(null);
  const [guestQuery, setGuestQuery] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState("");

  const eventId = event?.id
    ? String(event.id)
    : "";

  function getManageUrl() {
    if (!eventId) {
      return "/api/seats/manage";
    }

    return `/api/seats/manage?event_id=${encodeURIComponent(
      eventId
    )}`;
  }

  async function loadSeatMap(showLoading = true) {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const response = await fetch(getManageUrl(), {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        setMessage(
          json.message ??
            "Unable to load the seat map."
        );

        setSeats([]);
        setEligibleGuests([]);
        return;
      }

      setSeats(
        Array.isArray(json.seats)
          ? json.seats
          : []
      );

      setEligibleGuests(
        Array.isArray(json.eligibleGuests)
          ? json.eligibleGuests
          : []
      );

      /*
       * The seat map is permanent and belongs to Big Costa.
       * The open/closed state belongs to the event.
       *
       * If the API returns event settings, use them.
       * Otherwise keep the current client state.
       */
      if (json.event) {
        if (
          typeof json.event.seat_selection_open ===
          "boolean"
        ) {
          setOpen(
            json.event.seat_selection_open
          );
        }

        if (
          Object.prototype.hasOwnProperty.call(
            json.event,
            "seat_selection_deadline"
          )
        ) {
          setDeadline(
            json.event.seat_selection_deadline ??
              ""
          );
        }
      }

      setMessage(null);
    } catch (error: any) {
      setMessage(
        error?.message ??
          "Unable to load the seat map."
      );

      setSeats([]);
      setEligibleGuests([]);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!eventId) {
      setSeats([]);
      setEligibleGuests([]);
      setLoading(false);
      return;
    }

    loadSeatMap();
  }, [eventId]);

  const guestOptions = useMemo(() => {
    const query = guestQuery
      .trim()
      .toLowerCase();

    if (!query) {
      return eligibleGuests;
    }

    return eligibleGuests.filter(
      (guest: any) => {
        const searchableText = [
          guest.full_name,
          guest.guest_code,
          guest.public_payment_id,
          guest.payment_code,
          guest.payment_id,
        ]
          .filter(
            (value) =>
              value !== null &&
              value !== undefined
          )
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      }
    );
  }, [eligibleGuests, guestQuery]);

  async function updateSeatSelection(
    nextOpen: boolean,
    nextDeadline: string
  ) {
    if (!eventId) {
      setMessage(
        "No active event was found."
      );
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/seats/manage",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "seat_selection",
            event_id: eventId,
            seat_selection_open:
              nextOpen,
            seat_selection_deadline:
              nextDeadline || null,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.ok) {
        setMessage(
          json.message ??
            "Seat selection state could not be updated."
        );
        return;
      }

      setOpen(
        typeof json.seat_selection_open ===
          "boolean"
          ? json.seat_selection_open
          : nextOpen
      );

      setDeadline(
        json.seat_selection_deadline ??
          nextDeadline ??
          ""
      );

      setMessage(
        nextOpen
          ? "Seat selection is now open."
          : "Seat selection is now closed."
      );

      /*
       * Refresh the seat data without displaying
       * a distracting loading state.
       */
      await loadSeatMap(false);
    } catch (error: any) {
      setMessage(
        error?.message ??
          "Seat selection state could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetAllSeats() {
    const confirmed = window.confirm(
      "Reset all seats?\n\n" +
        "This will release all current Big Costa seat assignments " +
        "and make all 36 seats available.\n\n" +
        "Payment and guest records will not be affected."
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/seats/manage",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "reset_all_seats",
            event_id: eventId || null,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.ok) {
        setMessage(
          json.message ??
            "Unable to reset all seats."
        );
        return;
      }

      /*
       * Clear the local map immediately so the admin
       * interface cannot continue displaying stale
       * occupied seats while the database refreshes.
       */
      setSeats((currentSeats) =>
        currentSeats.map((seat) => {
          if (
            seat.status === "disabled"
          ) {
            return seat;
          }

          return {
            ...seat,
            status: "available",
            display_name: "AVAILABLE",
            guest_id: null,
            guest_name: null,
            assignment_id: null,
          };
        })
      );

      setSelectedSeat(null);
      setSelectedGuestId("");
      setGuestQuery("");

      setMessage(
        "All Big Costa seat assignments have been released."
      );

      await loadSeatMap(false);
    } catch (error: any) {
      setMessage(
        error?.message ??
          "Unable to reset all seats."
      );
    } finally {
      setLoading(false);
    }
  }

  async function releaseSeat(seat: any) {
    if (
      !seat ||
      seat.status !== "occupied"
    ) {
      return;
    }

    const occupantName =
      seat.display_name ||
      "this member";

    const confirmed = window.confirm(
      `Release seat ${seat.seat_number} currently assigned to ${occupantName}?`
    );

    if (!confirmed) {
      return;
    }

    setBusySeatId(seat.seat_id);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/seats/manage",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "release",
            event_id: eventId || null,
            seat_id: seat.seat_id,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.ok) {
        setMessage(
          json.message ??
            "Unable to release seat. Please try again."
        );
        return;
      }

      setMessage(
        `Seat ${seat.seat_number} was released.`
      );

      /*
       * Immediately update the local seat so the
       * admin interface reflects the release.
       */
      setSeats((currentSeats) =>
        currentSeats.map((currentSeat) => {
          if (
            String(currentSeat.seat_id) !==
            String(seat.seat_id)
          ) {
            return currentSeat;
          }

          return {
            ...currentSeat,
            status: "available",
            display_name: "AVAILABLE",
            guest_id: null,
            guest_name: null,
            assignment_id: null,
          };
        })
      );

      await loadSeatMap(false);
    } catch (error: any) {
      setMessage(
        error?.message ??
          "Unable to release seat. Please try again."
      );
    } finally {
      setBusySeatId(null);
    }
  }

  function openAssign(seat: any) {
    if (
      !seat ||
      seat.status !== "available"
    ) {
      return;
    }

    setSelectedSeat(seat);
    setSelectedGuestId("");
    setGuestQuery("");
    setMessage(null);
  }

  async function confirmAssign() {
    if (
      !selectedSeat ||
      !selectedGuestId
    ) {
      setMessage(
        "Choose an eligible guest to assign."
      );
      return;
    }

    const guest = eligibleGuests.find(
      (item: any) =>
        String(item.id) ===
        String(selectedGuestId)
    );

    if (!guest) {
      setMessage(
        "Selected guest is not eligible for seat assignment."
      );
      return;
    }

    const confirmed = window.confirm(
      `Assign seat ${selectedSeat.seat_number} to ${guest.full_name}?`
    );

    if (!confirmed) {
      return;
    }

    setAssigning(true);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/seats/manage",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "assign",
            event_id: eventId || null,
            seat_id: selectedSeat.seat_id,
            guest_id: selectedGuestId,
            payment_id:
              guest.payment_id ??
              null,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.ok) {
        setMessage(
          json.message ??
            "Unable to assign seat. Please try again."
        );

        if (json.existingSeat) {
          setMessage(
            `This member already has seat ${json.existingSeat}.`
          );
        }

        return;
      }

      setMessage(
        `Seat ${selectedSeat.seat_number} assigned to ${guest.full_name}.`
      );

      setSelectedSeat(null);
      setSelectedGuestId("");
      setGuestQuery("");

      await loadSeatMap(false);
    } catch (error: any) {
      setMessage(
        error?.message ??
          "Unable to assign seat. Please try again."
      );
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="space-y-4 admin-seat-wrap">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            Bus & Seat Management
          </div>

          <h1 className="text-2xl font-black text-navy mt-2">
            Rewind Experience
          </h1>

          <div className="text-sm text-slate-500">
            Big Costa
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <span className="font-bold text-slate-600">
            Administrator
          </span>

          <p className="text-sm mt-2">
            {admin}
          </p>
        </div>

        <div className="card">
          <span className="font-bold text-slate-600">
            Event
          </span>

          <p className="text-sm mt-2">
            {event?.name ??
              "Rewind Experience"}
          </p>
        </div>

        <div className="card">
          <span className="font-bold text-slate-600">
            Bus
          </span>

          <p className="text-sm mt-2">
            Big Costa
          </p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-black text-navy">
            Seat Selection
          </span>

          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {open ? "Open" : "Closed"}
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
              Seat Selection State
            </label>

            <div className="flex gap-2 mt-2">
              <button
                type="button"
                className="btn-primary btn-xs"
                disabled={
                  saving ||
                  open ||
                  !eventId
                }
                onClick={() =>
                  updateSeatSelection(
                    true,
                    deadline
                  )
                }
              >
                Open
              </button>

              <button
                type="button"
                className="btn-secondary btn-xs"
                disabled={
                  saving ||
                  !open ||
                  !eventId
                }
                onClick={() =>
                  updateSeatSelection(
                    false,
                    deadline
                  )
                }
              >
                Close
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
              Seat Selection Deadline
            </label>

            <input
              type="datetime-local"
              className="input-field mt-2"
              value={
                deadline
                  ? String(
                      deadline
                    )
                      .replace(
                        /\.\d{3}Z$/,
                        ""
                      )
                      .replace(
                        /Z$/,
                        ""
                      )
                  : ""
              }
              onChange={(e) =>
                setDeadline(
                  e.target.value
                )
              }
            />
          </div>

          <div>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={
                saving ||
                !eventId
              }
              onClick={() =>
                updateSeatSelection(
                  open,
                  deadline
                )
              }
            >
              {saving
                ? "Saving..."
                : "Save Seat Selection"}
            </button>
          </div>
        </div>

        {message && (
          <div className="text-xs font-bold text-slate-700">
            {message}
          </div>
        )}
      </div>

      <div className="card seat-map-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-black text-navy">
            Big Costa Seat Map
          </span>

          <span className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {loading
                ? "Loading"
                : `${seats.length} seats`}
            </span>

            <button
              type="button"
              className="btn-secondary btn-xs"
              disabled={
                loading ||
                seats.length === 0
              }
              onClick={resetAllSeats}
            >
              Reset All Seats
            </button>
          </span>
        </div>

        {seats.length === 0 &&
          !loading && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-sm font-bold text-slate-700">
                No seats found.
              </div>

              <div className="text-xs text-slate-500 mt-1">
                The permanent Big Costa seat map
                could not be loaded.
              </div>
            </div>
          )}

        <div className="mt-4 grid grid-cols-5 md:grid-cols-7 gap-2 seat-grid">
          {seats.map((seat) => (
            <div
              key={seat.seat_id}
              className="seat-card"
            >
              <div className="seat-number">
                {seat.seat_number}
              </div>

              <div
                className={`seat-status ${seat.status}`}
              >
                {seat.status}
              </div>

              <div className="seat-name">
                {seat.display_name}
              </div>

              <div className="seat-actions">
                {seat.status ===
                  "occupied" && (
                  <button
                    type="button"
                    className="admin-seat-btn release"
                    disabled={
                      busySeatId ===
                      seat.seat_id
                    }
                    onClick={() =>
                      releaseSeat(
                        seat
                      )
                    }
                  >
                    {busySeatId ===
                    seat.seat_id
                      ? "Releasing..."
                      : "Release"}
                  </button>
                )}

                {seat.status ===
                  "available" && (
                  <button
                    type="button"
                    className="admin-seat-btn assign"
                    onClick={() =>
                      openAssign(
                        seat
                      )
                    }
                  >
                    Assign
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedSeat && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center z-50 p-3">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <div className="font-black text-slate-800">
                  Assign seat{" "}
                  {selectedSeat.seat_number}
                </div>

                <div className="text-xs text-slate-500">
                  Eligible guests only
                </div>
              </div>

              <button
                type="button"
                className="btn-secondary btn-xs"
                onClick={() =>
                  setSelectedSeat(
                    null
                  )
                }
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid md:grid-cols-[1fr_auto] gap-3 items-center">
                <input
                  className="input-field"
                  placeholder="Search guest name, code, payment code..."
                  value={guestQuery}
                  onChange={(e) =>
                    setGuestQuery(
                      e.target.value
                    )
                  }
                />

                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={
                    !selectedGuestId ||
                    assigning
                  }
                  onClick={
                    confirmAssign
                  }
                >
                  {assigning
                    ? "Assigning..."
                    : "Confirm"}
                </button>
              </div>

              <div className="max-h-[280px] overflow-auto border rounded-lg">
                {guestOptions.length ===
                  0 && (
                  <div className="p-4 text-xs text-slate-500">
                    No eligible guests
                    found.
                  </div>
                )}

                {guestOptions.map(
                  (guest: any) => (
                    <div
                      key={guest.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2 border-b last:border-b-0 ${
                        selectedGuestId ===
                        guest.id
                          ? "bg-slate-50"
                          : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800">
                          {guest.full_name}
                        </div>

                        <div className="text-[11px] text-slate-500">
                          <span className="font-semibold">
                            Guest ID:
                          </span>{" "}
                          {String(
                            guest.id ??
                              ""
                          ).slice(
                            0,
                            8
                          )}

                          <span className="mx-1">
                            ·
                          </span>

                          <span className="font-semibold">
                            Payment ID:
                          </span>{" "}
                          {guest.public_payment_id ??
                            guest.payment_id ??
                            "—"}

                          <span className="mx-1">
                            ·
                          </span>

                          <span className="font-semibold">
                            Status:
                          </span>{" "}
                          {guest.payment_status ??
                            "paid"}
                        </div>

                        <div className="text-[11px] text-slate-500">
                          <span className="font-semibold">
                            Paid:
                          </span>{" "}
                          ₦
                          {Number(
                            guest.total_paid ??
                              0
                          ).toLocaleString()}

                          <span className="mx-1">
                            ·
                          </span>

                          <span className="font-semibold">
                            Seat:
                          </span>{" "}
                          {guest.seat_number ??
                            "No active seat"}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-secondary btn-xs"
                        disabled={
                          assigning
                        }
                        onClick={() =>
                          setSelectedGuestId(
                            String(
                              guest.id
                            )
                          )
                        }
                      >
                        {selectedGuestId ===
                        guest.id
                          ? "Selected"
                          : "Select"}
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .admin-seat-wrap {
          font-family: Arial, sans-serif;
        }

        .seat-map-card {
          overflow-x: auto;
        }

        .seat-grid {
          min-width: 360px;
        }

        .seat-card {
          min-height: 96px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #fff;
          padding: 8px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          box-shadow: none;
        }

        .seat-number {
          font-size: 14px;
          font-weight: 900;
          color: #14213d;
          line-height: 1.1;
        }

        .seat-status {
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .seat-status.available {
          color: #047857;
        }

        .seat-status.occupied {
          color: #b45309;
        }

        .seat-status.disabled {
          color: #6b7280;
        }

        .seat-name {
          font-size: 10px;
          color: #475569;
          min-height: 14px;
          max-width: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .seat-actions {
          margin-top: 6px;
          display: flex;
          gap: 4px;
          justify-content: center;
        }

        .admin-seat-btn {
          border-radius: 8px;
          padding: 4px 10px;
          font-size: 10px;
          font-weight: 700;
          min-height: 24px;
        }

        .admin-seat-btn.assign {
          background: #005a8c;
          color: white;
          border: 1px solid #005a8c;
        }

        .admin-seat-btn.release {
          background: #fff;
          color: #b45309;
          border: 1px solid #b45309;
        }

        .admin-seat-btn:disabled {
          opacity: 0.85;
          cursor: wait;
        }

        .btn-primary {
          background: #18212f;
          color: white;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 800;
        }

        .btn-primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .btn-secondary {
          border: 1px solid #94a3b8;
          background: #fff;
          color: #102a43;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 800;
        }

        .btn-secondary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .btn-xs {
          font-size: 10px;
          padding: 4px 8px;
          border-radius: 8px;
        }

        .btn-sm {
          font-size: 11px;
          padding: 8px 12px;
          border-radius: 8px;
        }

        .input-field {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 10px;
          color: #102a43;
          background: white;
        }

        .input-field:focus {
          outline: none;
          border-color: #64748b;
          box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.12);
        }

        @media (max-width: 640px) {
          .seat-grid {
            grid-template-columns: repeat(
              5,
              minmax(48px, 1fr)
            );
            gap: 6px;
          }

          .seat-card {
            min-height: 88px;
            padding: 6px;
          }

          .seat-name {
            font-size: 9px;
            max-width: 60px;
          }
        }
      `}</style>
    </div>
  );
}