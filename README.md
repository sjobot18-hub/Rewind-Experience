# The Rewind Experience — Event Finance System

A real, production-oriented event management and finance system: Next.js 14
(App Router) frontend + Supabase (Postgres, Auth, Row Level Security) backend
+ Resend for transactional email (invitations, password resets).

This is not a mockup. Every calculation is derived live from stored
transactions in Postgres, permissions are enforced by Row Level Security at
the database layer (not just hidden buttons), and there is no public
"create account" path — administrators can only be created through an
invitation link or by you directly via the Supabase dashboard for the first
Owner account.

---

## 1. What you need before you start

1. A free [Supabase](https://supabase.com) account (hosted Postgres + Auth).
2. A free [Resend](https://resend.com) account (for sending invitation and
   password-reset emails). Resend requires you to verify a sending domain,
   or you can use their shared test domain while developing.
3. [Node.js](https://nodejs.org) 18 or later installed.
4. A [Vercel](https://vercel.com) account when you're ready to deploy (free
   tier is enough), or any other Node hosting of your choice.

---

## 2. Create your Supabase project and database schema

1. Go to supabase.com → **New project**. Note the project's **Project URL**
   and **anon public key** and **service_role key** (Project Settings → API).
2. Open the **SQL Editor** in your Supabase project.
3. Run the three migration files in this repo **in order**, pasting each
   file's contents and clicking "Run":
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_functions.sql`
   - `supabase/migrations/0003_event_lifecycle.sql`

   (If you prefer the CLI: install the [Supabase CLI](https://supabase.com/docs/guides/cli),
   run `supabase link --project-ref YOUR_PROJECT_REF`, then `supabase db push`.)

This creates every table, the Row Level Security policies, and the
transaction-safe functions that record payments/expenses and generate
sequential IDs. It also seeds your first event: **The Rewind Experience
2026**, Men's ₦35,000 / Women's ₦25,000.

---

## 3. Create the Owner account (the ONE safe way)

There is deliberately no public sign-up page. To create the first Owner:

1. In Supabase, go to **Authentication → Users → Add User**. Create a user
   with your email and a strong password. Copy the generated **User UID**.
2. Back in the SQL Editor, run (replace the placeholders):

   ```sql
   insert into public.admin_profiles (id, full_name, email, role, status, is_owner)
   values ('PASTE-THE-USER-UID-HERE', 'Your Full Name', 'you@example.com', 'owner', 'active', true);
   ```

That's it — this is the only Owner, and the database itself prevents a
second `is_owner = true` row from ever being created (see the unique index
in `0001_init.sql`). From here on, all other administrators are created via
the in-app **Invite Administrator** flow, which emails a secure invitation
link — never a public registration form.

---

## 4. Configure environment variables

Copy the example file and fill in your real values:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key      # server-only, never exposed to the browser

RESEND_API_KEY=your-resend-api-key
EMAIL_FROM="The Rewind Experience <no-reply@yourdomain.com>"

NEXT_PUBLIC_APP_URL=http://localhost:3000            # update to your real deployed URL in production
```

Also set these two, plus `EMAIL_FROM`, in Supabase → **Authentication →
URL Configuration**: add `http://localhost:3000/reset-password` (and your
production URL) to the allowed redirect URLs, so password-reset links work.

---

## 5. Open and run the project in VS Code

1. Unzip/open this project folder in VS Code (`File → Open Folder…`).
2. Open a terminal in VS Code (`` Ctrl+` ``  /  `` Cmd+` ``).
3. Install dependencies:

   ```bash
   npm install
   ```

4. Make sure `.env.local` exists with the values from step 4 above.
5. Start the dev server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.
   You'll be redirected to `/login` — sign in with the Owner account you
   created in step 3.

Recommended VS Code extensions: **ESLint**, **Tailwind CSS IntelliSense**,
**Prettier**. None are required to run the project.

---

## 6. Deploying (so it's usable on real phones, not just localhost)

1. Push this project to a GitHub repository.
2. In Vercel: **Add New Project** → import the repo.
3. Add the same environment variables from `.env.local` in Vercel's
   Project Settings → Environment Variables (use your real production
   `NEXT_PUBLIC_APP_URL` this time).
4. Deploy. Add the production URL's `/reset-password` path to Supabase's
   allowed redirect URLs as in step 4.

---

## 7. What's fully implemented

- Email/password login, Forgot Password, and secure reset (Supabase Auth,
  bcrypt password hashing — passwords are never stored or seen by this app).
- Invitation-only administrator onboarding with expiring, single-use,
  hashed tokens; the invited person cannot choose their own role/permissions.
- Owner-only permission management; admins can't self-promote or create a
  second Owner (enforced by RLS, not just UI).
- Multi-event system: create, switch, and archive events; guests/payments/
  expenses/reports/audit logs are always scoped to one event.
- Guest registration with automatic gender-based ticket pricing, permanently
  captured per guest.
- Payments: multiple transactions per guest, automatic sequential Payment
  IDs and Receipt Numbers, overpayment detection, and a duplicate-payment
  warning (same guest/amount/method within 5 minutes).
- Expenses with category tracking and a running available-balance check that
  warns (but doesn't silently block) an expense that would go negative.
- Finance Timeline with a chronological running balance.
- Dashboard and Reports, entirely derived from live queries — nothing is
  hardcoded or manually editable.
- Append-only Audit Log (no admin, including the Owner, can edit or delete
  entries — enforced by RLS).
- Void (not delete) for payments and expenses, preserving financial history.
- CSV export for guests, payments, and expenses. Print-to-PDF via the
  browser print dialog on receipts and reports.
- Mobile-first responsive layout (card lists on phones, tables on desktop).

## 8. What you should extend before treating this as fully "production ready"

The brief's own testing checklist (final section) should be run end-to-end
by you against your real Supabase project before relying on this for a real
event's money — in particular:

- **PDF export as a downloadable file** (currently uses the browser's native
  Print dialog, which covers "print/save as PDF" but a dedicated PDF
  generation library like `jspdf` — already in `package.json` — can be wired
  in for one-click PDF downloads of reports/receipts).
- **Complete event backup/export** (§41) — an endpoint that bundles guests,
  payments, expenses, settings, and audit logs into one downloadable JSON/CSV
  archive. The building blocks (all data is already queryable per event) are
  in place; this is a straightforward addition in `src/app/api/export/`.
- **Demo/sample data seeding** (§48) — intentionally not included, since
  seeded demo financial-looking records are risky to ship by default; add a
  clearly-labelled seed script only if you want it for a walkthrough.
- Rate limiting on `/api/password-reset/request` and `/api/invites/create`
  at your hosting/CDN layer, to blunt automated abuse.
