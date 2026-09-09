import { getCurrentAdmin, getActiveEvent } from "@/lib/currentAdmin";
import BusSeatManagementClient from "./bus-seat-management-client";

export default async function BusSeatManagementPage() {
  const { profile, permissions, isOwner } = await getCurrentAdmin();
  const event = await getActiveEvent();
  return <BusSeatManagementClient event={event} admin={profile.full_name} isOwner={isOwner} permissions={permissions} />;
}
