# OpenHR

A small, self-hosted HR app for leave and expense claims. You sign in with Google, and admins and managers approve requests. It's built as an open alternative to the core leave and claims modules of hosted HR "super apps".

**Stack:** Next.js 15 (App Router, server actions) · PostgreSQL 16 · Prisma 6 (binary-free: WASM query compiler + `pg` driver) · Auth.js v5 (Google OAuth) · Tailwind 4 · Docker.

## Features

| Area | What you get |
|---|---|
| **Sign-in** | Google OAuth only. Access is by invitation (admin adds the email first), with optional domain auto-join (`ALLOWED_EMAIL_DOMAINS`). Deactivated users are locked out immediately. |
| **Roles** | **Admin**: approves anyone, manages people and settings. **Manager**: approves their direct reports. **Employee**: applies for leave and submits claims. Nobody approves their own request. |
| **Leave** | Leave types with yearly defaults, per-person entitlement overrides, half days (AM/PM), and weekends and public holidays excluded. Checks for overlaps and balance, plus pending/approved/rejected/cancelled/revoked statuses, year-end carry-forward with a cap per type, and a team calendar. The calendar hides the leave type (e.g. medical) from everyone except the owner and their approvers. |
| **Claims** | Categories with per-claim limits, receipt upload (JPG/PNG/WEBP/HEIC/PDF, max 8 MB, served only to the owner and their approvers), approve/reject with a note, and a CSV export for payroll. |
| **Admin** | Add/edit employees, CSV import, departments, reporting lines (loops are prevented), leave types, holidays, claim categories, and an audit log of every action. |
| **Notifications** | Email (SMTP) to approvers on new requests and to employees on decisions. Without SMTP, messages are written to the server log. |

Seeded defaults follow the **Malaysian Employment Act 1955** minimums: Annual 8, Medical 14, Hospitalisation 60, Maternity 98, Paternity 7, plus Compassionate 3 and Unpaid. Annual leave is 8/12/16 days and sick leave 14/18/22 depending on length of service, so set per-person entitlements on each employee's page. Only fixed-date national holidays are seeded. Add Chinese New Year, Hari Raya, Deepavali and state holidays under **Leave setup → Public holidays**.

## Deploy with Docker (recommended)

```bash
cp .env.example .env        # fill in the required values
docker compose up -d --build
```

The app listens on port 3000. On start it applies database migrations and inserts the reference data (leave types, claim categories, holidays) the first time only. Put it behind a reverse proxy with HTTPS, such as Caddy, nginx or an AWS ALB.

### Google OAuth setup

1. In Google Cloud Console, go to **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose **Web application**.
2. Add `https://<your-domain>/api/auth/callback/google` as an **Authorised redirect URI**.
3. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
4. On Google Workspace, setting the OAuth consent screen to **Internal** limits sign-in to your organisation's accounts. OpenHR still checks each email against its own employee list.

### First admin

Put your email in `ADMIN_EMAILS`, then sign in with Google. You become an Admin. Then go to **Admin → Employees** and add people one at a time, or import a CSV with these columns:

```
email,name,department,job_title,manager_email,role,employee_no,join_date,phone
```

Assigning someone as a manager automatically gives them the Manager role.

## Running locally

```bash
npm install                  # also runs prisma generate
cp .env.example .env         # set DATABASE_URL, AUTH_SECRET; DEMO_LOGIN=true for local testing
npm run db:migrate
SEED_DEMO=true npm run db:seed   # sample people: admin@ / manager@ / employee@example.com
npm run dev
```

With `DEMO_LOGIN=true`, the login page lets you sign in as any existing user by email, with no password. Use this only for local evaluation.

## Operations

- **Backups:** dump the `pgdata` volume (`docker compose exec db pg_dump -U openhr openhr > backup.sql`) and back up the `uploads` volume, which holds the receipts.
- **Schema changes:** edit `prisma/schema.prisma`, then generate the SQL with `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/000N_name/migration.sql` against a dev database. `scripts/migrate.mjs` applies each folder once, in order, in a transaction.
- **Year end:** go to **Leave setup → Run carry forward** (e.g. 2026 → 2027). It's safe to run again because it overwrites the carried-forward amount rather than adding to it.
- **Receipt storage:** files are stored on local disk at `UPLOAD_DIR`. To use S3, replace `src/lib/storage.ts`; it's the only file that reads or writes receipts.

## Project layout

```
src/app/(app)/          pages behind login (dashboard, leave, claims, calendar, directory, approvals, admin)
src/app/(app)/*/actions.ts   server actions — every one re-checks the session and role
src/app/api/            auth, receipt download, claims CSV export
src/lib/                auth, permissions (session.ts), leave maths (leave.ts), mail, storage, audit
prisma/                 schema, SQL migrations, seed
scripts/migrate.mjs     dependency-light migration runner
```

## Not yet included

Payroll, attendance and clock-in, rostering, document storage, onboarding checklists, mobile apps (the web UI works on phones), multi-level approval chains, and leave accrual (prorating entitlement by month). The schema and the `canApprove()` helper are designed so these can be added later.
