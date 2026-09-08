"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EventRecord } from "@/lib/types";

export default function SettingsClient({ event }: { event: EventRecord }) {
  const supabase = createClient();
  const router = useRouter();

  const [name, setName] = useState(event.name);
  const [presentedBy, setPresentedBy] = useState(event.presented_by);
  const [eventDate, setEventDate] = useState(event.event_date ?? "");
  const [mensPrice, setMensPrice] = useState(String(event.mens_ticket_price));
  const [womensPrice, setWomensPrice] = useState(String(event.womens_ticket_price));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMessage(null); setError(null);

    const { error: updateError } = await supabase
      .from("events")
      .update({
        name,
        presented_by: presentedBy,
        event_date: eventDate || null,
        mens_ticket_price: parseFloat(mensPrice),
        womens_ticket_price: parseFloat(womensPrice),
      })
      .eq("id", event.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Settings saved. New ticket prices apply to guests registered from now on — existing guests keep their original fee.");
    router.refresh();
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-bold text-navy">Event Settings</h1>

      <form onSubmit={handleSubmit} className="card space-y-3">
        {message && <div className="bg-green-50 text-paid text-sm rounded-lg px-4 py-3">{message}</div>}
        {error && <div className="bg-red-50 text-unpaid text-sm rounded-lg px-4 py-3">{error}</div>}

        <div>
          <label className="block text-sm font-medium mb-1.5">Event Name</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Presented By</label>
          <input className="input-field" value={presentedBy} onChange={(e) => setPresentedBy(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Event Date</label>
          <input type="date" className="input-field" value={eventDate ?? ""} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Men's Ticket Price (₦)</label>
          <input type="number" min="0" className="input-field" value={mensPrice} onChange={(e) => setMensPrice(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Women's Ticket Price (₦)</label>
          <input type="number" min="0" className="input-field" value={womensPrice} onChange={(e) => setWomensPrice(e.target.value)} />
        </div>
        <p className="text-xs text-slate-400">
          Price changes only affect guests registered after saving. Existing guests keep the fee
          they were assigned at registration.
        </p>
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
