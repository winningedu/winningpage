# winningpage Repo Rules

Repo-specific facts and exceptions. General placement and naming rules live in the user's shared rules; this file wins on conflict. Update it in the same PR when the structure it describes changes.

## Placement examples and exceptions

- Domain folders: `api/_lib/goal/`, `api/_lib/inquiry/`, `api/_lib/consult/`, `api/_lib/growth/`, `api/_lib/selfeval/`, `api/_lib/diagnosis/`, `api/_lib/premium-book/`, `src/pages/admin/knowledge/`, `src/pages/admin/staff/`, `src/pages/admin/admission/`, `src/pages/admin/coupons/`, `src/pages/admin/goal/`, `src/pages/admin/learning-diagnosis/`, `src/pages/admin/members/`, `src/pages/admin/mentor/`, `src/pages/admin/premium-book/`, `src/pages/admin/revenue/`, `src/pages/admin/tenants/`.
- Feature folders shared by several domains: `api/_lib/ai/` (gemini, sdkAdapter, telemetry), `api/_lib/messaging/` (aligo, alimtalk).
- Shared top-level files: `handler.ts`, `http*.ts`, `supabaseAdmin.ts`, `serviceAccess.ts`, `programAccess.ts`, `phoneCode.ts`, `niceIdentity.ts`, `outbound.ts`, `adminAuth.ts`, `cronAuth.ts`, `site.ts`.
- `shared/` holds the contract layer used by both the browser and `api/`: per-domain request and response zod schemas, their types, codes, and limits (`shared/<domain>/`). No React, no DOM, no Node-only modules (`node:*`), no DB client, no `@/` alias; relative imports with `.js`. `shared/` imports nothing from `src/` or `api/`. `src/` never imports `api/`; the files that still do are a frozen allowlist in `shared/boundaries.test.ts` that only shrinks.
- `src/lib/diagnosis-v3/` is the pure-TS diagnosis engine shared by the browser and `api/` (no React, no `@/` alias, relative imports with `.js`).
- `src/lib/concurrency/` holds the read helpers shared by the browser and `api/` (`allInOrder`, `mapBounded`, `startEarly`): start independent reads together, then check results in the original order so error priority stays the same. Same rules as above.
- Cross-domain import example: growth reads `../_lib/goal/repo.js`. Never hoist it to hide the dependency.
- Six camelCase folders are legacy (`mentorApply`, `routeGuards`, `admissionResults`, `premiumBook`, `growthLanding`, `selfevalLanding`). Never add more.
- Admin menu keys (`aiTelemetry`, `knowledgeEvals`) are DB keys and may be camelCase. Keep them separate from folder names.

## Naming

- Components PascalCase (`BulkPanel.tsx`), other `.ts` camelCase, `api/_routes/` route files kebab-case (`send-phone-code.ts`).

## api/

- `api/_lib/` holds shared modules that Vercel does not turn into endpoints. All non-route server code goes here.
- Relative imports inside `api/` use the `.js` extension. `.ts` breaks production.
- New endpoints use `defineHandler` from `api/_lib/handler.ts` with `errorShape: "problem"` (RFC 9457, `application/problem+json`, always a `code`) and zod `body` / `query` schemas for input. Success bodies are the resource itself with no `ok` field; lists are wrapped in an object (`{ items }`). The older shapes (`detail`, `okDetail`, `error`, `coded`) stay only on routes not yet migrated.
- Endpoints live in `api/_routes/<path>.ts` and must be registered in a manifest chosen by `maxDuration`: `manifest.ts` (none), `manifest-60.ts`. The 30 s limit exists only for Hono routes (`api/app-30.ts`). A new limit needs a new `api/router-<n>.ts` entry, a manifest, and a `vercel.json` rewrite.
- Admin routes are moving to Hono (one batch per domain). A migrated domain is a sub-app `api/_routes/admin/<domain>.ts` (handlers inline, `const guard = admin({...})` per guard, `.all(path, methodNotAllowed(...))` after the methods, input via `validate()` with the `shared/<domain>/contract.ts` schemas) mounted in `api/_routes/admin/app.ts`, under the root app `api/_routes/app.ts`. Its paths leave the manifest and get a `vercel.json` rewrite to `/api/app` (or `-30`, `-60`) placed before the `/api/router` rewrites, with the same `..` lookahead. `api/_routes/app.test.ts` checks the route table (auth middleware first, 405 Allow) and the rewrites. Shared Hono code is in `api/_lib/hono/`.
- `api/router*.ts` and the Hono entries `api/app*.ts` (`export default { fetch: app.fetch }`) are the only general entry functions. Cron targets (`vercel.json` `crons`), `zoom-webhook.ts`, and `report-pdf.ts` (Chromium memory isolation) stay as standalone files in `api/`. `api/_routes/manifest.test.ts` enforces this.
- URLs are unchanged: `/api/<path>`.
- The `vercel.json` catch-all rewrite excludes paths with a `.` or `..` segment: Vercel matches the raw path but hands the function a normalized `req.url`, so `/api/goal/../change-phone` would otherwise reach the `change-phone` handler.

## Code

- Browser requests to `/api` use `api` from `src/lib/http/client.ts` (ky, `retry: 0`) inside react-query `useQuery` / `useMutation`. Pass the query `signal`. Request failures (HTTP error, timeout, network) arrive as `ApiError` (`status`, `code`, `detail`, `supportCode`); a response that fails `.json(schema)` throws ky `SchemaValidationError` instead, which means the client and server contracts disagree. Never add new browser `supabase.from` / `rpc` / `storage` calls or new `apiFetch` callers; `apiFetch` goes away when its last caller moves.
- `shared/http/problem.ts` is the one problem body schema (with `errors` and `zodIssuesToErrors()`), shared by `api/` and `src/`. Common problem codes are `PROBLEM_CODE` in `shared/http/codes.ts`.
- `npm run check:http-legacy` enforces the HTTP standard against `scripts/http-legacy.baseline.json`; area migrations shrink it to zero; never raise it.

- npm only. Never run pnpm or yarn.
- No fallback constants. Missing data means do not render, or surface an error.

## DB

- Migrations (`supabase/migrations/`) hold schema only. No data statements, including inside DO blocks (CI lint `scripts/check-migration-data-inserts.mjs`).
- Grants and revokes are schema: write them in migrations, one statement per line, following `supabase/README.md` "함수 EXECUTE 권한".
- Create migration files only with `supabase migration new` (CI checks the filename timestamp).
- CI applies migrations to dev and prod. Never run manual `db push`.
- Data changes (names, prices, reference rows, backfills) are not migrations. Follow `supabase/data/README.md`: SQL file in `supabase/data/`, idempotent, natural keys, owner approval, dev first, then prod.
- Never patch data over REST.
- Local DB: `npm run db:reseed`. No seed.sql, no production seed files.

## Time

- Server (`api/`) and DB compute and output in UTC. API instants are ISO 8601 `...Z`.
- The client converts to the browser zone for display and converts input (pickers, "today", ranges) before sending.
- Day, week, and month buckets take an IANA zone argument. Zone source: the viewer's `X-Time-Zone` header for screens, `tenants.time_zone` / `profiles.time_zone` for work with no viewer.
- Calendar dates an operator types (coupon end, banner window, contract) stay `date`.
- Use `src/lib/time/` (TS, shared with `api/`) and the DB helpers `fn_local_date`, `fn_day_start`, `fn_add_months`.
- Never hardcode a zone. `npm run check:time-zone` enforces it against `scripts/time-zone-literals.baseline.json`, which the coordinator shrinks to zero. A line that truly needs a literal carries `tz-literal-ok: <reason>`. Migrations at or before `20261123153447` (the squashed baseline) are already applied, so the check skips them; later migrations are scanned.
