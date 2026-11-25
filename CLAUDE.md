# Tools Portal

Internal platform hosting employee tools behind RBAC. See README.md for modules and deployment.

## Design System: "Sympl UI"

The platform MUST match the look, feel and UX patterns of the SymplPM platform. The full reference is `docs/design-system.md`. The components in `src/components/ui/` and `src/components/layout/` are the canonical implementations: use them as they are and extend rather than restyle them. Branding (site name, accent word, logo) is admin-configurable, so never hard-code the product name; read it with `getBranding()` (`src/lib/settings.ts`) or `BrandMark` (`src/components/brand.tsx`).

## Architecture

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Database:** PostgreSQL via Prisma 7 with `@prisma/adapter-pg` (`src/lib/prisma.ts`, config in `prisma.config.ts`)
- **Auth:** NextAuth v5 credentials (bcrypt, JWT) in `src/lib/auth.ts`. The JWT only carries the user id; role, status and access are loaded fresh per request by `getCurrentUser()` in `src/lib/rbac.ts`.
- **RBAC:** permissions catalogue `src/lib/permissions.ts`; effective access `src/lib/access.ts`; page guards `requireUser/requirePermission/requireTool`; route guard `guard({ permission?, tool? })`.
- **Audit:** `logAudit()` in `src/lib/audit.ts`. Every mutation, sign-in attempt and denied access must be logged.
- **Secrets:** encrypt anything sensitive with `encrypt/decrypt` (`src/lib/crypto.ts`, AES-256-GCM, `APP_ENCRYPTION_KEY`). Never return secrets to the browser.
- **Email:** Microsoft Graph client-credentials `sendMail` in `src/lib/graph-mail.ts`; templates in `src/lib/email-templates.ts`.
- **Backups:** `src/lib/backup.ts` (generic over Prisma DMMF; every model must be in `TABLE_ORDER`). Scheduler in `src/lib/scheduler.ts`, started from `src/instrumentation.ts`.
- **Styling:** Tailwind CSS v4 (no tailwind.config; `globals.css` uses `@import "tailwindcss"`). Radix UI + class-variance-authority + tailwind-merge. Lucide icons. Geist font.
- **Deploy:** Docker (`Dockerfile`, `docker-compose.yml`), config from a git-ignored `.env`, served at http://10.0.10.106:8016.

## Key Conventions

- All pages under `src/app/(app)/` are authenticated and wrapped by AppShell. Server `page.tsx` checks access, loads data and renders a `"use client"` component.
- Public pages: `/login`, `/invite/[token]`, `/forgot-password`, `/reset-password/[token]`; public APIs live under `/api/public/` and `/api/branding/`. Everything else is gated by `src/proxy.ts` and server-side guards.
- Tools live at `src/app/(app)/tools/<slug>/` with APIs at `src/app/api/tools/<slug>/`, registered in `src/lib/tools/registry.ts`.
- `route.ts` files export only HTTP method handlers; put schemas and helpers in `src/lib/`.
- API routes check the session and permission first (`guard`), then validate and trim the body with `parseBody(req, zodSchema)` from `src/lib/api.ts`.
- Use `cn()` from `@/lib/utils` for className merging. Primary colour is blue-600. Sidebar gray-900; content gray-50; white cards with gray-200 borders.
- Forms use Input/Select/Textarea/Checkbox/Switch/Label components, not raw elements. Dialogs use `DialogContent`. Tables use `src/components/ui/table.tsx`. Alerts use `src/components/ui/alert.tsx`.
- React effects only set state inside async callbacks, never synchronously (`react-hooks/set-state-in-effect` is on).
- Run `npm run lint`, `npm run typecheck` and `npm test` before committing.

## Important: Next.js 16

@AGENTS.md
