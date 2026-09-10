import { getCurrentAdmin, getActiveEvent } from "@/lib/currentAdmin";
import BusSeatManagementClient from "./bus-seat-management-client";

export default async function BusSeatManagementPage({
  searchParams,
}: {
  searchParams?: { event_id?: string | string[] };
}) {
  const { profile, permissions, isOwner } = await getCurrentAdmin();
  const requestedEventId = typeof searchParams?.event_id === "string"
    ? searchParams.event_id
    : Array.isArray(searchParams?.event_id)
      ? searchParams.event_id[0]
      : undefined;

  const event = await getActiveEvent(requestedEventId);
  return <BusSeatManagementClient event={event} admin={profile.full_name} isOwner={isOwner} permissions={permissions} />;
}
