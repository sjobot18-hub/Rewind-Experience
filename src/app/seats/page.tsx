import SeatsClient from "./seats-client";

export const dynamic = "force-dynamic";

export default function SeatsPage() {
  return (
    <SeatsClient
      event={null}
      admin=""
      isOwner={false}
      permissions={[]}
    />
  );
}
