# TanStack Start Migration Plan

Status: draft — survey complete, implementation not started.

This document records the findings of a codebase survey for migrating the
Curb app from Next.js to TanStack Start, and lays out a phased plan.

## Context

The app currently runs on Next.js 16 (App Router) under `curb/`. The plan is
to migrate it to TanStack Start (TanStack Router + Vite + server functions)
while preserving behavior and keeping the domain logic untouched.

Naming: **WebsiteSeeker** is the product. **Curb** is the app/engine that
powers it, alongside the vendored **Agentic OS** service.

## What is already framework-agnostic

The migration is confined almost entirely to the `curb/src/app/` layer.

- `curb/src/lib/` — SQLite (`better-sqlite3`), filesystem, fetch, AI SDK,
  Playwright, Stripe, Google Places, and all core business logic
  (`src/lib/core/`). No Next.js coupling except one file.
- `curb/src/lib/form-service.ts` — the only `lib` file that imports
  Next.js, and only a type: `import type { NextRequest } from "next/server"`.
  Trivial to remove.
- `curb/src/components/` — shadcn/ui primitives (framework-agnostic). One
  exception: `site-file-editor.tsx` uses `next/dynamic` and `next/image`.

## Next.js surface area

Measured across `curb/src/`:

| Feature | Count | Where |
|---|---|---|
| `next/server` (`NextRequest`, `NextResponse`) | 42 | 41 `route.ts` handlers + `lib/form-service.ts` |
| `next/navigation` (`useRouter`, `usePathname`, `useParams`, `useSearchParams`) | 6 | `app-frame`, `sidebar`, `businesses`, `businesses/[id]`, `purchase/[token]` |
| `next/link` | 6 | `sidebar`, `page` (home) + 4 in the vendored Pages CMS fork |
| `next/image` | 2 | `businesses/[id]/page`, `site-file-editor` |
| `next/font/google` | 1 | `layout.tsx` (Manrope + IBM Plex Mono) |
| `next/dynamic` | 1 | `site-file-editor` (Monaco) |
| `"use client"` files | 29 | client components |
| `"use server"` / `use cache` | 0 | no server actions — server logic is all in route handlers + `lib` |

### Route inventory (41 `route.ts` handlers)

- `api/activity`
- `api/agentic-os/{chat,health,tasks}`
- `api/audit`
- `api/businesses` + `api/businesses/[id]` and subroutes
  (`audit`, `deploy-customer`, `deploy-preview`, `email`, `export`,
  `generate`, `sale`, `sale/activate`, `sale/payment-link`, `site-editor`)
- `api/discover`
- `api/emails`, `api/emails/[id]`, `api/emails/bulk-approve`
- `api/enrichment`
- `api/export`
- `api/forms/submit`
- `api/generate`, `api/generate-next`
- `api/health`
- `api/outreach`
- `api/place-photo`
- `api/public-sales/[token]`, `api/public-sales/[token]/download`
- `api/settings` and OAuth subroutes (`anthropic-oauth`, `anthropic-oauth/start`,
  `anthropic-oauth/exchange`, `openai-oauth`, `openai-oauth/start`, `models`)
- `api/sites/[...path]` (static generated-site serving)
- `api/stats`
- `api/stripe/webhook`

### Pages

- `layout.tsx` (root layout, metadata, fonts)
- `page.tsx` (home)
- `discover/page.tsx`
- `businesses/page.tsx`, `businesses/[id]/page.tsx`
- `outreach/page.tsx`
- `settings/page.tsx`
- `purchase/[token]/page.tsx`

### Next-specific config

- `curb/next.config.ts` — `serverExternalPackages: ['better-sqlite3',
  'playwright']` and the rewrite `/sites/:path+` → `/api/sites/:path*`.
- `curb/tsconfig.json` — the `next` plugin.
- `curb/eslint.config.mjs` — `eslint-config-next`.
- `curb/next-env.d.ts` — generated; gitignored.
- `package.json` scripts — `next dev`, `next build`, `next start`.

## Migration mapping

| Next.js | TanStack Start |
|---|---|
| App Router file routes (`[id]`, `[token]`, `[...path]`) | TanStack Router file routes (`$id`, `$token`, `$` splat) |
| `layout.tsx` | `__root.tsx` (`createRootRoute`) |
| `route.ts` (`export async function GET/POST/...`) | `createServerFn` or `api` routes |
| `NextRequest` / `request.nextUrl.searchParams` | Web `Request` + `new URL(request.url).searchParams` |
| `NextResponse.json(...)` / `new NextResponse(...)` | Web `Response` / `Response.json(...)` |
| `{ params: Promise<{ id }> }` | TanStack Router route params |
| `next/link` | `@tanstack/react-router` `<Link>` |
| `next/navigation` hooks | TanStack Router `useParams` / `useSearch` / `useRouter` / `useLocation` |
| `next/font/google` | self-hosted fonts or `@fontsource/*` |
| `next/image` | `<img>` or `unpic` |
| `next/dynamic` | `React.lazy` + `Suspense`, or Vite async import |
| `next.config.ts` | `vite.config.ts` |
| `serverExternalPackages` | Vite `ssr.external` / `optimizeDeps.exclude` |
| `/sites/:path+` rewrite | a catch-all route or handler in the router |
| `next build` / `next start` | `vinxi build` / Node server entry |

## Phased plan

### Phase 1 — Scaffold side-by-side

- Add TanStack Start + Vite tooling to `curb/` without removing Next.js.
- Bring over `src/lib` and `src/components` unchanged.
- Keep `next dev` working so the app stays runnable throughout.

### Phase 2 — Router shell

- Port `layout.tsx` → `__root.tsx` (root layout, `<html>`/`<body>`, global CSS,
  `AppFrame`, Toaster).
- Port `page.tsx` (home) as the first route to prove the pipeline.
- Port `app-frame.tsx` and `sidebar.tsx`; swap `next/link` → TanStack `<Link>`
  and `next/navigation` → TanStack hooks.

### Phase 3 — Pages

- Port the remaining pages (`discover`, `businesses`, `businesses/$id`,
  `outreach`, `settings`, `purchase/$token`).
- Replace `next/image` with `<img>`/`unpic`.

### Phase 4 — Server functions / API routes

- Convert the 41 `route.ts` handlers to `createServerFn` (or `api` routes).
- Mechanical replacements: `NextRequest` → `Request`,
  `request.nextUrl.searchParams` → `new URL(request.url).searchParams`,
  `NextResponse.json(...)` → `Response.json(...)`, `new NextResponse(body,
  {status, headers})` → `new Response(body, {status, headers})`.
- Port `api/sites/$` (the generated-site static server) carefully — see
  "Trickiest parts".
- Remove the `type NextRequest` import from `lib/form-service.ts`.

### Phase 5 — Assets and config

- Fonts: replace `next/font/google` with `@fontsource/manrope` and
  `@fontsource/ibm-plex-mono` (or self-host the woff2).
- `next/dynamic` → `React.lazy`/`Suspense` for Monaco in `site-file-editor.tsx`.
- Replace `next.config.ts` with `vite.config.ts`:
  - externalize `better-sqlite3` and `playwright` for SSR;
  - reimplement the `/sites/:path+` → `api/sites/:path*` rewrite as a router
    catch-all route.
- Update `tsconfig.json` (drop the `next` plugin), `eslint.config.mjs` (drop
  `eslint-config-next`), remove `next-env.d.ts`.

### Phase 6 — Vendored Pages CMS fork

- Adapt `src/vendor/pages-cms-fork/` (4 files use `next/link` /
  `next/navigation`).
- Decide: adapt in place, or replace the fork with a framework-agnostic admin
  UI. Prefer adapt-in-place to preserve current behavior.

### Phase 7 — Build, launch, and cleanup

- Update `package.json` scripts (`vinxi build` / server start).
- Update `scripts/launch-curb.mjs` (the `.next` → new build-dir assumptions,
  `BUILD_INPUT_FILES`, `hasProductionBuild`, `NEXT_BUILD_ID_PATH`).
- Update `docker/curb.Dockerfile` (`next build` → `vinxi build`, drop the
  `.next` COPY steps for the new output dir).
- Remove `next`, `eslint-config-next` and any remaining Next references.

### Phase 8 — Verify

- Typecheck (`tsc --noEmit`).
- `npm run build` + `npm run start` locally.
- Run the launcher (`./launch-curb.command` / `scripts/launch-curb.mjs`).
- Docker `docker compose up --build`.
- Smoke test: discover → audit → generate → preview (static site serving) →
  outreach → export; settings OAuth; stripe webhook; public sales token routes.

## Trickiest parts

1. **`api/sites/[...path]`** — static generated-site serving with base-href
   injection, `HEAD` support, legacy artifact handling, and the
   `/sites/:path+` rewrite. Logic is self-contained but the most Next-coupled
   handler. Port it carefully and keep it covered by a manual preview test.
2. **Vendored Pages CMS fork** — third-party Next.js code. Adapting it means
   touching vendored files; replacing it is a larger product decision.
3. **`better-sqlite3` + `playwright` under Vite SSR** — native modules must be
   externalized so they load from `node_modules` at runtime, not bundled.
4. **Async `params` contract** — Next 15+ passes `params` as a Promise; TanStack
   Router params have a different shape, so every dynamic handler needs a
   mechanical but careful rewrite.

## Risks

- TanStack Start is pre-1.0; API surface may shift between versions. Pin a
  version and re-verify on upgrades.
- The migration is large but mechanical; the risk is concentrated in the
  static-site server and the vendored fork, not the bulk of the route handlers.

## Open questions

- Adapt vs. replace the vendored Pages CMS fork.
- Whether `api/` handlers become `createServerFn` (RPC) or HTTP `api` routes —
  the current client code fetches `/api/...`, so HTTP routes preserve the
  existing contract with least churn.
- Image strategy (`unpic` vs. plain `<img>`) for the two `next/image` call sites.
