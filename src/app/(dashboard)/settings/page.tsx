import { getActiveEvent } from "@/lib/currentAdmin";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const activeEvent = await getActiveEvent();
  if (!activeEvent) return <p className="text-slate-500">No active event selected.</p>;

  return <SettingsClient event={activeEvent} />;
}
