import { getCurrentAdmin, getActiveEvent } from "@/lib/currentAdmin";
import BusSeatManagementClient from "@/app/(dashboard)/events/bus-seat-management/bus-seat-management-client";

export default async function SeatAdminManagePage() {
  const { profile, permissions, isOwner } = await getCurrentAdmin();
  const event = await getActiveEvent();

  return (
    <BusSeatManagementClient
      event={event}
      admin={profile.full_name}
      isOwner={isOwner}
      permissions={permissions}
    />
  );
}
