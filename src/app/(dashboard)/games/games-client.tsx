"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Game, GameLocation, GameStatus } from "@/lib/types";

interface GamesClientProps {
  initialGames: Game[];
  eventId: string;
  isOwner: boolean;
  permissions: string[];
}

function canManage(permissions: string[], isOwner: boolean) {
  return isOwner || permissions.includes("manage_event_settings");
}

function formatGameDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

export default function GamesClient({
  initialGames,
  eventId,
  isOwner,
  permissions,
}: GamesClientProps) {
  const supabase = createClient();
  const [games, setGames] = useState<Game[]>(initialGames);
  const [showForm, setShowForm] = useState(false);
  const [formLocation, setFormLocation] = useState<GameLocation>("beach");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTiktokUrl, setFormTiktokUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState<GameLocation>("beach");
  const [editDescription, setEditDescription] = useState("");
  const [editTiktokUrl, setEditTiktokUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const beachGames = games.filter((g) => g.location === "beach").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const apartmentGames = games.filter((g) => g.location === "apartment").sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = games.length;
  const pending = games.filter((g) => g.status === "pending").length;
  const completed = games.filter((g) => g.status === "completed").length;

  async function refresh() {
    const { data } = await supabase.from("games").select("*").eq("event_id", eventId).order("created_at", { ascending: false });
    setGames((data as Game[]) ?? []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!formName.trim()) {
      setSubmitError("Game name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          name: formName.trim(),
          location: formLocation,
          description: formDescription.trim(),
          tiktok_url: formTiktokUrl.trim() || null,
          notes: formNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSubmitError(data.message ?? "Failed to create game.");
        return;
      }
      setShowForm(false);
      setFormName("");
      setFormDescription("");
      setFormTiktokUrl("");
      setFormNotes("");
      setFormLocation("beach");
      await refresh();
    } catch {
      setSubmitError("Something went wrong.");
    }
    setSubmitting(false);
  }

  async function handleComplete(gameId: string) {
    try {
      const res = await fetch("/api/games/" + gameId + "/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, id: gameId }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message ?? "Failed to update game.");
        return;
      }
      setConfirmComplete(null);
      await refresh();
    } catch {
      alert("Something went wrong.");
    }
  }

  async function handleDelete(gameId: string) {
    try {
      const res = await fetch("/api/games/" + gameId, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, id: gameId }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message ?? "Failed to delete game.");
        return;
      }
      setConfirmDelete(null);
      await refresh();
    } catch {
      alert("Something went wrong.");
    }
  }

  function openEdit(game: Game) {
    setEditingGame(game);
    setEditName(game.name);
    setEditLocation(game.location);
    setEditDescription(game.description ?? "");
    setEditTiktokUrl(game.tiktok_url ?? "");
    setEditNotes(game.notes ?? "");
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    if (!editingGame) return;

    if (!editName.trim()) {
      setEditError("Game name is required.");
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await fetch("/api/games/" + editingGame.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          id: editingGame.id,
          name: editName.trim(),
          location: editLocation,
          description: editDescription.trim(),
          tiktok_url: editTiktokUrl.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setEditError(data.message ?? "Failed to update game.");
        return;
      }
      setEditingGame(null);
      await refresh();
    } catch {
      setEditError("Something went wrong.");
    }
    setEditSubmitting(false);
  }

  const managing = canManage(permissions, isOwner);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy">Games</h1>
          <p className="text-sm text-slate-500">
            {total} total &middot; {pending} pending &middot; {completed} completed
          </p>
        </div>
        {managing && (
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm py-2 px-4">
            {showForm ? "Cancel" : "+ Add Game"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-3">
          {submitError && <div className="bg-red-50 text-unpaid text-sm rounded-lg px-4 py-3">{submitError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Game Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field" placeholder="e.g. Tug of War" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Location *</label>
              <select value={formLocation} onChange={(e) => setFormLocation(e.target.value as GameLocation)} className="input-field">
                <option value="beach">Beach</option>
                <option value="apartment">Apartment</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Description / How to Play</label>
            <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="input-field" rows={3} placeholder="Describe how the game is played..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">TikTok Video URL</label>
              <input type="text" value={formTiktokUrl} onChange={(e) => setFormTiktokUrl(e.target.value)} className="input-field" placeholder="https://www.tiktok.com/..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Notes</label>
              <input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="input-field" placeholder="Optional notes" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary text-sm py-2 px-4">{submitting ? "Saving..." : "Add Game"}</button>
          </div>
        </form>
      )}

      <div className="flex gap-4 border-b border-slate-200 pb-1">
        <button
          onClick={() => {}}
          className="text-sm font-semibold text-blue border-b-2 border-blue pb-1"
        >
          Beach Games ({beachGames.length})
        </button>
        <button
          onClick={() => {}}
          className="text-sm font-semibold text-slate-500 hover:text-slate-700 pb-1"
        >
          Apartment Games ({apartmentGames.length})
        </button>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Beach Games</h2>
          {beachGames.length === 0 && <p className="text-slate-400 text-sm">No beach games yet.</p>}
          <div className="grid gap-3">
            {beachGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onComplete={() => setConfirmComplete(game.id)}
                onDelete={() => setConfirmDelete(game.id)}
                onEdit={() => openEdit(game)}
                confirmingComplete={confirmComplete === game.id}
                confirmingDelete={confirmDelete === game.id}
                onCancelConfirm={() => { setConfirmComplete(null); setConfirmDelete(null); }}
                onConfirmComplete={handleComplete}
                onConfirmDelete={handleDelete}
                eventId={eventId}
                canManage={managing}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Apartment Games</h2>
          {apartmentGames.length === 0 && <p className="text-slate-400 text-sm">No apartment games yet.</p>}
          <div className="grid gap-3">
            {apartmentGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onComplete={() => setConfirmComplete(game.id)}
                onDelete={() => setConfirmDelete(game.id)}
                onEdit={() => openEdit(game)}
                confirmingComplete={confirmComplete === game.id}
                confirmingDelete={confirmDelete === game.id}
                onCancelConfirm={() => { setConfirmComplete(null); setConfirmDelete(null); }}
                onConfirmComplete={handleComplete}
                onConfirmDelete={handleDelete}
                eventId={eventId}
                canManage={managing}
              />
            ))}
          </div>
        </section>
      </div>

      {editingGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="card w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy">Edit Game</h2>
            {editError && <div className="bg-red-50 text-unpaid text-sm rounded-lg px-4 py-3">{editError}</div>}
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Game Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Location</label>
                <select value={editLocation} onChange={(e) => setEditLocation(e.target.value as GameLocation)} className="input-field">
                  <option value="beach">Beach</option>
                  <option value="apartment">Apartment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Description / How to Play</label>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="input-field" rows={3} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">TikTok Video URL</label>
                <input type="text" value={editTiktokUrl} onChange={(e) => setEditTiktokUrl(e.target.value)} className="input-field" placeholder="https://www.tiktok.com/..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Notes</label>
                <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="input-field" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingGame(null)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
                <button type="submit" disabled={editSubmitting} className="btn-primary text-sm py-2 px-4">{editSubmitting ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function GameCard({
  game,
  onComplete,
  onDelete,
  onEdit,
  confirmingComplete,
  confirmingDelete,
  onCancelConfirm,
  onConfirmComplete,
  onConfirmDelete,
  eventId,
  canManage,
}: {
  game: Game;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
  confirmingComplete: boolean;
  confirmingDelete: boolean;
  onCancelConfirm: () => void;
  onConfirmComplete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  eventId: string;
  canManage: boolean;
}) {
  const isCompleted = game.status === "completed";

  return (
    <div className={`card ${isCompleted ? "border-l-4 border-l-paid" : "border-l-4 border-l-part"}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-navy text-base break-words">{game.name}</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isCompleted ? "bg-green-100 text-paid" : "bg-orange-100 text-part"}`}>
              {isCompleted ? "COMPLETED" : "PENDING"}
            </span>
          </div>
          {game.description && <p className="text-sm text-slate-500 mt-1 break-words">{game.description}</p>}
          {game.tiktok_url && (
            <a href={game.tiktok_url} target="_blank" rel="noreferrer" className="btn-primary text-xs py-1.5 px-3 mt-2 inline-block">
              Watch Game Video
            </a>
          )}
          {game.notes && <p className="text-xs text-slate-400 mt-1 italic">{game.notes}</p>}
          <p className="text-xs text-slate-400 mt-1">Created: {formatGameDate(game.created_at)}{isCompleted && game.completed_at ? ` · Completed: ${formatGameDate(game.completed_at)}` : ""}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
        {canManage && !isCompleted && (
          confirmingComplete ? (
            <span className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Mark this game as completed?</span>
              <button onClick={() => onConfirmComplete(game.id)} className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-700">Yes, Complete</button>
              <button onClick={onCancelConfirm} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
            </span>
          ) : (
            <button onClick={onComplete} className="btn-primary text-xs py-1.5 px-3">Mark Completed</button>
          )
        )}
        {canManage && isCompleted && (
          <button onClick={onComplete} className="btn-secondary text-xs py-1.5 px-3">Reopen</button>
        )}
        {canManage && (
          <>
            <button onClick={onEdit} className="btn-secondary text-xs py-1.5 px-3">Edit</button>
            {confirmingDelete ? (
              <span className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Delete?</span>
                <button onClick={() => onConfirmDelete(game.id)} className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-700">Yes, Delete</button>
                <button onClick={onCancelConfirm} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
              </span>
            ) : (
              <button onClick={onDelete} className="text-unpaid text-xs font-semibold hover:underline">Delete</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
