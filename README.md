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
| **Shipping Rates Generator** | `/tools/shipping-rates` | Users granted the tool. Upload the ship cost history report, quote UPS Ground and USPS Ground Advantage from each warehouse for zones 2–8, find the most-used zone and the weight where UPS becomes cheaper, and check quotes against actual costs. |

Effective tool access = tools of the user's role + user "Grant" overrides − user "Deny" overrides. Disabled tools are hidden from everyone.

## Deploying with `deploy.sh` (recommended)

On the server (Docker with the compose plugin, git):

```bash
git clone https://github.com/jonbrulotte-arch/tools-portal.git && cd tools-portal
```

```bash
./deploy.sh install
```

`install` checks Docker, disk space and port 8016. It then creates `.env`: it generates every secret, asks for the first admin's email, name and password, and sets the file to mode 600. Finally it builds the image, starts PostgreSQL and the app, and waits until the app's health check passes. For automation, pass `--yes --admin-email you@company.com --admin-name "Your Name"`.

| Command | What it does |
|---|---|
| `./deploy.sh update` | Dumps the database, runs `git pull --ff-only`, rebuilds and restarts, then waits for the health check. If the new version doesn't become healthy, it rolls the app back to the previous image automatically and prints the command to restore the pre-update database dump. Options: `--branch main`, `--force`, `--no-pull`. |
| `./deploy.sh rollback [--with-db latest\|FILE]` | Switches back to the previous image and optionally restores a database dump. A safety dump is taken first. |
| `./deploy.sh backup` | Saves a database dump to `.deploy/db-backups/` and copies the in-app backups to `.deploy/app-backups/`. Copy `.deploy/` off the server regularly. |
| `./deploy.sh restore-db FILE\|latest` | Replaces the database with a dump. A safety dump is taken first. |
| `./deploy.sh status` | Shows containers, health, running and previous versions, recent dumps, deploy history and disk space. |
| `./deploy.sh logs [app\|db]`, `start`, `stop`, `restart` | Day-to-day operations. |
| `./deploy.sh env-check` | Validates `.env`: secret strength, a URL-safe DB password and URL format. |

Every run is logged to `.deploy/deploy.log`. The last 10 database dumps are kept (`--keep N` changes this). `./deploy.sh help` lists all options. The app exposes `GET /api/public/health` (database check plus running version), which Docker's healthcheck and the script use.

## Deploying manually (Docker, http://10.0.10.106:8016)

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

In the tool, open **Stores** → **Add store**. Only admins can add, edit, test or remove stores: Super Admins, and users whose role has at least one admin permission (Users, Roles, Tools, Access Log, Backup or Settings). Other users with access to the tool can create discounts on the connected stores but never see the Stores tab. Two ways to authenticate:

- **Client ID & secret (Dev Dashboard app, recommended).** Create an app in the Shopify Dev Dashboard with Admin API scopes `write_discounts, read_discounts, read_products`, release a version and install it on the store (the store must be in your organization). Paste the Client ID and secret. The portal exchanges them for an access token with the client-credentials grant and refreshes it every 24 hours.
- **Admin API access token.** For an existing custom app created in Shopify admin: paste its `shpat_…` token (same scopes).

Use **Test connection** to confirm the store name, currency and scopes.

**Form settings.** Shown to Super Admins and to roles with *Shopify Discount Code Generator: manage tool settings* (Admin → Roles & Permissions). The tool's **Form settings** tab sets what the New discount form starts with for *Requirements & limits* (minimum purchase, total usage limit, one use per customer) and *Combinations*, for all stores. Each group can be **locked for regular users**: they see it greyed out with "Set by your admin", and the server rejects a submission that changes a locked value (logged as `shopify.discount_blocked_by_lock`). Admins and settings managers can still change locked values on each discount. Credentials are encrypted at rest and never sent back to the browser.

Creating a discount: **New discount** → pick the store(s) → title and code (single code or N generated unique codes) → percentage, fixed amount or free shipping → applies to all products, specific collections or specific products (single store) → minimum purchase, usage limits, combinations, start/end dates → **Create discount**. The tool calls `discountCodeBasicCreate` / `discountCodeFreeShippingCreate` (plus `discountRedeemCodeBulkAdd` for extra codes) and records the request, response and result in the discount log. Users see their own discounts unless they have *Shopify: view all discounts*.

## Shipping Rates Generator

Tabs: **Analysis**, **Cost reports**, **Quotes** and **Settings**. Settings is shown to Super Admins and roles with *Shipping Rates Generator: manage tool settings*.

**Cost reports.** Upload the Ship Cost History export (`.xlsx`, up to 80 MB) and it is processed in the background (about 15 s for 70,000 rows).
- UPS invoice lines are added up per tracking number: freight, fuel, residential, delivery area and so on.
- The warehouse comes from the UPS shipper account in the tracking number (Settings → UPS accounts) or from the USPS origin ZIP.
- Only our own **prepaid** shipping is analysed. Third-party and collect packages are left out, though they still help learn which UPS zone each city is in.
- USPS rows have no zone. The zone is taken from our UPS shipments to the same city where there are any; otherwise it is estimated from the distance, using zone boundaries learned per warehouse from the UPS invoices.
- Only totals per carrier, service, warehouse, zone and weight are stored. No names or addresses are kept.

**Quotes.** A run requests one rate per warehouse, zone (2–8) and weight. That means USPS Ground Advantage at 4/8/12/15.99 oz and 1–20 lb, plus UPS Ground commercial and residential at 1–150 lb (4,536 quotes with the defaults).
- Each zone is quoted to one destination ZIP: the one set in Settings, else the city we ship to most in that zone according to the latest report, else a ZIP mid-way through the zone by distance.
- Runs can be cancelled and exported to CSV.
- **Scheduled run** (Settings → Scheduled quote run): runs the full grid automatically, weekly on the chosen day (default Monday 1:00 AM Pacific, after UPS's weekly fuel-surcharge update) or daily, in the chosen time zone (the server clock is UTC). Live mode only; skipped if a run is already going. Failed quotes are re-quoted once at the end, and only the newest N scheduled runs are kept (runs started by hand are never deleted). Starts, skips and clean-ups are in the Access Log as `shipping.scheduled_run*`.

**Modes.** In **simulated** mode (the default) prices are placeholders, so the cutoff and accuracy figures are only a demonstration. A banner says so everywhere. Switch to **live** once credentials are set:
- **UPS:** create an app at developer.ups.com with the *Rating* product. Enter its Client ID and secret, and set the shipper accounts. Negotiated rates are used when the account has them.
- **USPS (Endicia):** enter the Requester ID, Account ID and pass phrase, and the production `EwsLabelService.asmx` endpoint (the default is Endicia's test server).
- **Save & test** sends one real 2 lb zone-5 quote. Secrets are encrypted at rest and never sent back to the browser.

**Analysis** shows:
- shipments per zone for each warehouse;
- per warehouse and zone, the lightest weight from which UPS stays cheaper than USPS, both from the quotes and from our actual costs;
- a rate-by-weight chart with a table under it (USPS, UPS commercial and UPS residential prices per weight and which is cheaper), exportable to CSV for the current warehouse and zone or for all of them;
- quote-vs-actual accuracy per carrier, warehouse and zone.

**Product quote** quotes one part at its real weight and box size.
- Enter a part number and **Look up in Salsify**. The part's shipping weight and length × width × height are read from Salsify, and you can adjust them or type them by hand.
- **Get quotes** asks UPS Ground (commercial and residential) and USPS Ground Advantage for a price from each chosen warehouse to every zone, using the same destination ZIPs as the rate chart. The package size is sent, so the carriers apply dimensional weight.
- Each price is shown next to the rate chart (a quote run) at the part's billable weight, with the difference and the cheaper carrier for business and home addresses. Results can be exported to CSV.
- Billable weight: UPS L×W×H ÷ 139; USPS L×W×H ÷ 166 only for parcels over 1 cubic foot.

**Salsify setup.**
- In the tool's **Settings → Salsify**, set the organization ID (from the Salsify address bar, `app.salsify.com/app/orgs/s-…/`). Also set the field names to read; the defaults are *Shipping Weight (Pounds)*, *Shipping Length/Width/Height (Inches)*, *Item Name* and *Shipping Packaging Type*. The part number is the Salsify product ID.
- **Fallback fields** (default *UPC Weight (Pounds)* and *UPC Length/Width/Height (Inches)*) are used when a part doesn't have all four shipping values. They're used as a set, so weight and size describe the same package; if the fallback set is incomplete too, only the gaps are filled. Product quote flags parts that used fallback values.
- Each user adds their **own Salsify API key** in **My Profile → Salsify API key**. The key is encrypted per user (`UserCredential` table), never sent back to the browser, and used only for that user's lookups. Saving, testing, removing and every lookup are recorded in the Access Log.

ZIP and city coordinates come from [GeoNames](https://www.geonames.org/) (CC BY 4.0), bundled in `src/lib/shipping/us-geo.json`.

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
4. Every tool automatically gets a *"<tool>: manage tool settings"* permission (`toolSettingsPermission(slug)` in `src/lib/permissions.ts`); guard the tool's settings pages and APIs with it, and describe what it covers in the registry's `settingsDescription`. Extra capabilities go in `EXTRA_TOOL_PERMISSIONS`; both appear in the role editor automatically.
5. Add any new Prisma models to `TABLE_ORDER` in `src/lib/backup.ts` (backups fail loudly if one is missing).
