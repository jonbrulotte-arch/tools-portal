# Tools Portal

An internal platform that hosts tools for employees. Admins invite people by email, control which tools each person can open, and every action on the platform is recorded in an access log.

Built on the Sympl design-system starter: Next.js 16 (App Router), React 19, Prisma 7 + PostgreSQL, NextAuth v5, Tailwind v4. Visual rules are in `docs/design-system.md`; conventions for contributors are in `CLAUDE.md`.

## Modules

| Module | Where | Who |
|---|---|---|
| **Dashboard** | `/dashboard` | Everyone. Cards for the tools you can access, with a description and "what it's used for". |
| **Users** | Admin → Users | `admin.users`. Invite by name + email (sent through Microsoft Graph), resend invites, password resets, disable/enable, unlock, delete, change role, per-user tool overrides (Grant / Deny / Inherit). |
| **Roles & Permissions** | Admin → Roles & Permissions | `admin.roles`. Roles bundle admin permissions, tool access and tool-specific permissions. *Super Admin* always has everything. |
| **Tools** | Admin → Tools | `admin.tools`. Rename tools, edit descriptions/usage text and icon, enable/disable. |
| **Access Log** | Admin → Access Log | `admin.audit`. Every sign-in attempt (success, wrong password, unknown email, locked, disabled), sign-out, page view, admin change, backup and tool action, with IP and user agent. Filter, inspect and export to CSV. |
| **Backup & Restore** | Admin → Backup & Restore | `admin.backup`. Full JSON backups (gzipped) of every table, on demand or on a schedule; download, upload and restore. |
| **Settings** | Admin → Settings | `admin.settings`. Branding (site name, accent word, tagline, logo), Microsoft Graph email, sign-in security, backup schedule. |
| **Shopify Discount Code Generator** | `/tools/shopify-discounts` | Users granted the tool. Create discount codes on connected Shopify stores; every attempt is kept in the tool's discount log. |

Effective tool access = tools of the user's role + user "Grant" overrides − user "Deny" overrides. Disabled tools are hidden from everyone.

## Deploying (Docker, http://10.0.10.106:8016)

On the server (Docker with the compose plugin):

```bash
git clone <this repo> tools-portal && cd tools-portal
cp .env.example .env
```

Edit `.env`: set `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `POSTGRES_PASSWORD` and the `SEED_ADMIN_*` values. Generate each secret with `openssl rand -base64 32`. Then:

```bash
docker compose up -d --build
```

On every start the app container applies database migrations, makes sure the default roles, tools and first admin exist, and then serves on port **8016**. Sign in at `http://10.0.10.106:8016` with the seed admin and change the password under **My Profile**.

- `.env` is git-ignored and only read by Docker (`env_file`); nothing secret is baked into the image.
- PostgreSQL is not published to the host. Data lives in the `db-data` volume, backups in the `backups` volume (`/app/backups`).
- Keep a copy of `APP_ENCRYPTION_KEY` somewhere safe. Stored API secrets are encrypted with it, and restoring a backup on a new server needs the same key.
- The site runs over plain HTTP on the internal network. If you later put it behind HTTPS, update `AUTH_URL` and `APP_URL`.

Update to a new version with `git pull && docker compose up -d --build`.

## Email invitations (Microsoft Graph)

1. In Microsoft Entra ID → App registrations → **New registration** (single tenant).
2. **API permissions** → Add → Microsoft Graph → **Application permissions** → `Mail.Send` → **Grant admin consent**.
3. **Certificates & secrets** → New client secret; copy the *value*.
4. In the portal: Admin → Settings → Email. Enter the tenant ID, client ID, secret and the mailbox to send from (a licensed or shared mailbox), save, then **Send test email**.

Optional: limit the app to that one mailbox with an Exchange Online application access policy. If email isn't configured, inviting a user still works and the admin is shown the invite link to share manually.

## Connecting Shopify stores

In the tool, open **Stores** (requires the *Shopify: manage stores* permission) → **Add store**. Two ways to authenticate:

- **Client ID & secret (Dev Dashboard app, recommended).** Create an app in the Shopify Dev Dashboard with Admin API scopes `write_discounts, read_discounts, read_products`, release a version and install it on the store (the store must be in your organization). Paste the Client ID and secret. The portal exchanges them for an access token with the client-credentials grant and refreshes it every 24 hours.
- **Admin API access token.** For an existing custom app created in Shopify admin: paste its `shpat_…` token (same scopes).

Use **Test connection** to confirm the store name, currency and scopes. Credentials are encrypted at rest and never sent back to the browser.

Creating a discount: **New discount** → pick the store(s) → title and code (single code or N generated unique codes) → percentage, fixed amount or free shipping → applies to all products, specific collections or specific products (single store) → minimum purchase, usage limits, combinations, start/end dates → **Create discount**. The tool calls `discountCodeBasicCreate` / `discountCodeFreeShippingCreate` (plus `discountRedeemCodeBulkAdd` for extra codes) and records the request, response and result in the discount log. Users see their own discounts unless they have *Shopify: view all discounts*.

## Backups

- **Create backup now** writes `backup-YYYYMMDD-HHMMSS-manual.json.gz` to the backups volume. Scheduled backups (Settings → Backup schedule, daily at 02:00 by default, keeping 14) are pruned automatically; manual ones are never pruned.
- **Restore** replaces *all* data, including the access log, with the backup's contents in one transaction. Before restoring, the portal takes a `pre-restore` safety backup. Everyone is signed out afterwards.
- Download backups regularly and keep them off the server.

## Local development

Requires Node 22 and PostgreSQL.

```bash
npm install
cp .env.example .env
```

In `.env`, set `DATABASE_URL`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `AUTH_URL=http://localhost:8016`, `APP_URL=http://localhost:8016` and the `SEED_ADMIN_*` values. Then:

```bash
npx prisma migrate dev
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`. Database integration tests (backup round-trip, Shopify create flow against a mocked API) run when `TEST_DATABASE_URL` points to a disposable database with migrations applied.

## Adding a new tool

1. Add an entry to `src/lib/tools/registry.ts` (slug, name, description, usage text, icon from `src/components/tool-icon.tsx`). It's synced into the database on startup.
2. Build pages under `src/app/(app)/tools/<slug>/`, guarded with `requireTool("<slug>")`.
3. Put APIs under `src/app/api/tools/<slug>/`, guarded with `guard({ tool: "<slug>" })`, and record actions with `logAudit(...)`.
4. If the tool needs extra capabilities, add them to `TOOL_PERMISSIONS` in `src/lib/permissions.ts`; they appear in the role editor automatically.
5. Add any new Prisma models to `TABLE_ORDER` in `src/lib/backup.ts` (backups fail loudly if one is missing).
