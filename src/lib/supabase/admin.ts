import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// IMPORTANT: this file imports "server-only" so Next.js will throw a build
// error if anything in the browser bundle ever tries to import it. The
// service role key bypasses Row Level Security completely — treat every
// function that touches this client as a trusted, carefully-reviewed choke
// point (invitation acceptance, password reset issuance, admin creation).
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
