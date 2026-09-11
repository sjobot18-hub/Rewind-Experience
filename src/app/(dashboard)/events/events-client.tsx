"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatNaira, formatDate } from "@/lib/format";
import { EventRecord } from "@/lib/types";

export default function EventsClient({ events, isOwner }: { events: EventRecord[]; isOwner: boolean }) {
  const supabase = createClient();
  const router = useRouter();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("The Rewind Experience");
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [eventDate, setEventDate] = useState("");
  const [presentedBy, setPresentedBy] = useState("Beach/Apartment Hangout");
  const [mensPrice, setMensPrice] = useState("35000");
  const [womensPrice, setWomensPrice] = useState("25000");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSubmitting(true);

    const { error: rpcError } = await supabase.rpc("create_event", {
      p_name: name,
      p_year: parseInt(year, 10),
      p_event_date: eventDate || null,
      p_presented_by: presentedBy,
      p_mens_price: parseFloat(mensPrice),
      p_womens_price: parseFloat(womensPrice),
    });

    setSubmitting(false);
    if (rpcError) { setError(rpcError.message); return; }

    setShowForm(false);
    router.refresh();
  }

  async function handleSwitch(eventId: string) {
    const response = await fetch("/api/events/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId }),
    });

    const json = await response.json();

    if (!response.ok || !json.ok) {
      alert(json.message ?? "Failed to switch event.");
      return;
    }

    router.refresh();
  }

  async function handleArchive(eventId: string) {
    if (!confirm("Archive this event? It will remain accessible for reports but won't accept new financial transactions.")) return;
    await supabase.rpc("archive_event", { p_event_id: eventId });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Events</h1>
        {isOwner && (
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm py-2 px-4">
            {showForm ? "Cancel" : "+ New Event"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-3">
          {error && <div className="bg-red-50 text-unpaid text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1.5">Event Name</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Year</label>
            <input type="number" className="input-field" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Event Date</label>
            <input type="date" className="input-field" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Presented By</label>
            <input className="input-field" value={presentedBy} onChange={(e) => setPresentedBy(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Men's Ticket Price (₦)</label>
            <input type="number" className="input-field" value={mensPrice} onChange={(e) => setMensPrice(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Women's Ticket Price (₦)</label>
            <input type="number" className="input-field" value={womensPrice} onChange={(e) => setWomensPrice(e.target.value)} />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Creating..." : "Create Event"}
          </button>
        </form>
      )}

      <div className="grid gap-3">
        {events.map((ev) => (
          <div key={ev.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{ev.name} {ev.year}</p>
                <p className="text-xs text-slate-400">{ev.presented_by} {ev.event_date ? `· ${formatDate(ev.event_date)}` : ""}</p>
              </div>
              {ev.is_currently_active && (
                <span className="badge-paid">Active</span>
              )}
              {ev.status === "archived" && (
                <span className="text-xs text-slate-400 font-medium">Archived</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Men's: {formatNaira(ev.mens_ticket_price)} · Women's: {formatNaira(ev.womens_ticket_price)}
            </p>
            {isOwner && ev.status === "active" && (
              <div className="flex gap-2 mt-3">
                {!ev.is_currently_active && (
                  <button onClick={() => handleSwitch(ev.id)} className="btn-secondary text-xs py-2 px-3">
                    Switch To This Event
                  </button>
                )}
                <button onClick={() => handleArchive(ev.id)} className="text-xs text-unpaid font-medium">
                  Archive
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
