# PickupQR — Foundation phase

This is phase 1 of the PickupQR build: database schema, role-based auth
(RBAC), and a working project scaffold. Companies/drivers/employees UI,
the QR directory, WhatsApp integration, and maps come in later phases —
this phase proves the ground underneath them is solid.

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS · Supabase
(Postgres + Auth) · deployed to Vercel.

**Roles:** `super_admin`, `company_admin`, `driver`, `employee` — enforced
both in Postgres (Row Level Security) and in `src/middleware.ts` (route
gating), so a driver hitting `/dashboard/company-admin` in the URL bar
gets bounced regardless of what the UI shows.

**Documented assumptions** (the spec was ambiguous on these):
- "users" in the spec's data model is Supabase's built-in `auth.users` +
  a `public.profiles` table that extends it with `role`, `name`, `phone`,
  `company_id`. Every other table's RLS policy reads from `profiles`, not
  from `auth.users` directly (Supabase locks down the `auth` schema).
- New signups default to role `employee` (least privilege) via a
  database trigger. You explicitly promote people to `driver`,
  `company_admin`, or `super_admin` afterwards — see Section 5.
- `employees.profile_id` is nullable: most directory entries (bulk
  imports for QR purposes) never get a login. Only link it when that
  person also has an authenticated account.

---

## 1. What's in this phase

```
pickupqr/
  supabase/migrations/0001_init.sql   - full schema + RBAC + RLS
  scripts/create-admin.mjs            - bootstraps the first super_admin
  src/
    middleware.ts                     - session refresh + role gating
    lib/
      supabase/client.ts              - browser Supabase client
      supabase/server.ts              - server Supabase client
      database.types.ts               - hand-written types (regenerate later, Section 4)
    app/
      login/page.tsx                  - email/password + phone OTP
      reset-password/page.tsx
      auth/callback/route.ts          - handles reset/magic-link redirects
      unauthorized/page.tsx
      dashboard/
        layout.tsx                    - shared header + sign-out
        super-admin/page.tsx          - placeholder, counts only
        company-admin/page.tsx        - placeholder, counts only
        driver/page.tsx               - placeholder, lists assigned routes
        employee/page.tsx             - placeholder, shows own directory row
  .env.example
```

The four dashboard pages are intentionally bare - they exist to prove
the auth + RLS chain works end to end, not as the real UI (that's the
next phase).

---

## 2. Create your Supabase project and run the migration

1. Go to supabase.com -> New project. Pick a name, a database password
   (save it), and a region close to your users (e.g. a Canadian region
   for Montreal).
2. Wait for provisioning (~2 min), then open Project Settings -> API.
   Copy the Project URL and the anon public key.
3. Open SQL Editor in the Supabase dashboard -> New query, paste the
   entire contents of supabase/migrations/0001_init.sql, and run it.
   You should see "Success. No rows returned."
   - Alternatively, with the Supabase CLI:
     ```
     npx supabase login
     npx supabase link --project-ref YOUR_PROJECT_REF
     npx supabase db push
     ```
4. Also copy Project Settings -> API -> service_role key (secret -
   never put this in a NEXT_PUBLIC_* variable or commit it anywhere).

## 3. Enable auth methods

1. Authentication -> Providers -> Email: on by default, leave it on.
   Under Authentication -> Settings, you can turn off "Confirm email"
   for easier local testing (turn it back on before going live).
2. Authentication -> Providers -> Phone: toggle on. Phone OTP needs an
   SMS provider - Supabase supports Twilio, MessageBird, or Vonage.
   Pick one, create a free/trial account with them, and paste their
   Account SID/Auth Token (Twilio) into the Phone provider settings.
   Without this, the "Phone (OTP)" tab on the login page will fail with
   a provider error - that's expected until it's configured.
3. Authentication -> URL Configuration: set Site URL to
   http://localhost:3000 for now (you'll add your production URL in
   Section 8). Add http://localhost:3000/auth/callback and your future
   production callback URL under Redirect URLs.

## 4. Local setup

```
cd pickupqr
npm install
cp .env.example .env.local
```

Edit .env.local and fill in the three values from Section 2:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Run it:

```
npm run dev
```

Visit http://localhost:3000 - you'll be redirected to /login.

Once your project is live, regenerate real (not hand-written) types:

```
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/lib/database.types.ts
npm run build
```

## 5. Create your first super admin

Signups default to employee, and RLS correctly stops anyone from
promoting themselves - so the very first super_admin has to be created
with the service role key, from the server side:

```
node scripts/create-admin.mjs owner@yourcompany.com "a-strong-password"
```

Sign in at /login with those credentials -> you'll land on
/dashboard/super-admin and see live counts from your (empty) database.

## 6. Creating company_admin / driver / employee users for testing

Until the Employee Directory / user-management UI exists (a later
phase), create test users directly:

1. Supabase dashboard -> Authentication -> Users -> Add user (set
   email + password, confirm email).
2. Table Editor -> profiles -> find that user's row -> set role to
   company_admin or driver, and set company_id to a real company's id
   (create one first in the companies table).
3. For a driver, also add a row in drivers linking profile_id to that
   user and company_id to their company.

## 7. Testing login and permissions

- Sign in as each role and confirm:
  - super_admin sees /dashboard/super-admin with counts across
    everything.
  - company_admin sees /dashboard/company-admin, counts scoped to
    their own company_id only.
  - driver sees /dashboard/driver, only routes where driver_id matches
    their own drivers row.
  - employee sees /dashboard/employee, only their own directory row
    (if employees.profile_id is linked to them).
- Try loading another role's URL directly (e.g. a driver visiting
  /dashboard/company-admin) - you should land on /unauthorized.
- In the Supabase SQL editor, try `select * from employees;` while
  impersonating a non-admin role (Authentication -> Policies has a
  "Run as" tester) to confirm RLS actually blocks cross-company reads.

## 8. Deploying

Database/auth/storage are already live on Supabase from Section 2 -
nothing extra to deploy there. If you add tables/policies later, push
them the same way (Section 2, step 3).

Frontend + API on Vercel:

1. Push this project to a GitHub repo.
2. vercel.com -> New Project -> import the repo.
3. Under Environment Variables, add:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY (mark it sensitive; only used by
     server-side scripts/routes you add later - never referenced in
     browser code)
4. Deploy. Vercel gives you a https://your-app.vercel.app URL.
5. Back in Supabase -> Authentication -> URL Configuration: update Site
   URL to your Vercel URL, and add
   https://your-app.vercel.app/auth/callback to Redirect URLs.
6. Re-run scripts/create-admin.mjs locally (it talks to your live
   Supabase project via the service role key regardless of where the
   frontend is hosted) if you haven't already created a super admin.
7. Visit your production URL and repeat the Section 7 checks.

Scheduled jobs and WhatsApp webhook configuration are part of the
Employee Directory / WhatsApp phases - the tables for them
(whatsapp_accounts, whatsapp_messages) already exist in the schema, but
there's nothing to schedule or configure yet.

---

## Planning (shifts + WhatsApp)

Run `supabase/migrations/0002_planning.sql` after `0001_init.sql`. Admins use **Planning** on the company-admin/super-admin dashboard; drivers see only their own plannings under **My planning**. To send through WhatsApp Business, follow `docs/whatsapp-planning-setup.md`.

## Acceptance checklist for this phase

- [ ] Supabase project created, migration applied without errors
- [ ] Email/password login works
- [ ] Phone OTP login works (once an SMS provider is configured)
- [ ] Password reset flow works end-to-end
- [ ] First super_admin created via scripts/create-admin.mjs
- [ ] Each role, when signed in, lands on its own dashboard and cannot
      load another role's dashboard URL directly
- [ ] company_admin only ever sees data scoped to their own company
      (verified via the RLS policy tester, not just the UI)
- [ ] npm run build and npm run lint both pass clean
- [ ] Deployed to Vercel, Supabase Site URL/Redirect URLs updated to match

## Next phases

1. Employee Directory + permanent QR system - the core new feature:
   name+phone-based permanent QR tokens, bulk import/upsert, scan then
   "assign to this company," 3-month inactivity cleanup.
2. Driver/company dashboard UI - the 2x2 color-coded company grid,
   drag-and-drop sidebar, route pre-map preview, boarding-point picker.
3. WhatsApp Cloud API integration - embedded signup, message
   templates, webhook handling, and the Privacy/Consent/Terms/Data
   Deletion pages Meta requires for business verification.
