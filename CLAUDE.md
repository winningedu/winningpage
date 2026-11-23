# winningpage Repo Rules

Repo-specific facts and exceptions. General placement and naming rules live in the user's shared rules; this file wins on conflict. Update it in the same PR when the structure it describes changes.

## Placement examples and exceptions

- Domain folders: `api/_lib/goal/`, `api/_lib/inquiry/`, `api/_lib/consult/`, `api/_lib/growth/`, `api/_lib/selfeval/`, `api/_lib/diagnosis/`, `src/pages/admin/knowledge/`, `src/pages/admin/staff/`, `src/pages/admin/admission/`, `src/pages/admin/coupons/`, `src/pages/admin/goal/`, `src/pages/admin/learning-diagnosis/`, `src/pages/admin/members/`, `src/pages/admin/mentor/`, `src/pages/admin/premium-book/`, `src/pages/admin/revenue/`, `src/pages/admin/tenants/`.
- Feature folders shared by several domains: `api/_lib/ai/` (gemini, sdkAdapter, telemetry), `api/_lib/messaging/` (aligo, alimtalk).
- Shared top-level files: `handler.ts`, `http*.ts`, `supabaseAdmin.ts`, `serviceAccess.ts`, `programAccess.ts`, `phoneCode.ts`, `niceIdentity.ts`, `outbound.ts`, `adminAuth.ts`, `cronAuth.ts`, `site.ts`.
- `src/lib/diagnosis-v3/` is the pure-TS diagnosis engine shared by the browser and `api/` (no React, no `@/` alias, relative imports with `.js`).
- Cross-domain import example: growth reads `../_lib/goal/repo.js`. Never hoist it to hide the dependency.
- Six camelCase folders are legacy (`mentorApply`, `routeGuards`, `admissionResults`, `premiumBook`, `growthLanding`, `selfevalLanding`). Never add more.
- Admin menu keys (`aiTelemetry`, `knowledgeEvals`) are DB keys and may be camelCase. Keep them separate from folder names.

## Naming

- Components PascalCase (`BulkPanel.tsx`), other `.ts` camelCase, `api/_routes/` route files kebab-case (`send-phone-code.ts`).

## api/

- `api/_lib/` holds shared modules that Vercel does not turn into endpoints. All non-route server code goes here.
- Relative imports inside `api/` use the `.js` extension. `.ts` breaks production.
- New endpoints use `defineHandler` from `api/_lib/handler.ts`.
- Endpoints live in `api/_routes/<path>.ts` and must be registered in a manifest chosen by `maxDuration`: `manifest.ts` (none), `manifest-30.ts`, `manifest-60.ts`. A new limit needs a new `api/router-<n>.ts` entry, a manifest, and a `vercel.json` rewrite.
- `api/router*.ts` are the only general entry functions. Cron targets (`vercel.json` `crons`), `zoom-webhook.ts`, and `report-pdf.ts` (Chromium memory isolation) stay as standalone files in `api/`. `api/_routes/manifest.test.ts` enforces this.
- URLs are unchanged: `/api/<path>`.
- The `vercel.json` catch-all rewrite excludes paths with a `.` or `..` segment: Vercel matches the raw path but hands the function a normalized `req.url`, so `/api/goal/../change-phone` would otherwise reach the `change-phone` handler.

## Code

- npm only. Never run pnpm or yarn.
- No fallback constants. Missing data means do not render, or surface an error.

## DB

- Migrations (`supabase/migrations/`) hold schema only. No data statements, including inside DO blocks (CI lint `scripts/check-migration-data-inserts.mjs`).
- Create migration files only with `supabase migration new` (CI checks the filename timestamp).
- CI applies migrations to dev and prod. Never run manual `db push`.
- Data changes (names, prices, reference rows, backfills, grants) are not migrations. Follow `supabase/data/README.md`: SQL file in `supabase/data/`, idempotent, natural keys, owner approval, dev first, then prod.
- Never patch data over REST.
- Local DB: `npm run db:reseed`. No seed.sql, no production seed files.

## Time

- Server (`api/`) and DB compute and output in UTC. API instants are ISO 8601 `...Z`.
- The client converts to the browser zone for display and converts input (pickers, "today", ranges) before sending.
- Day, week, and month buckets take an IANA zone argument. Zone source: the viewer's `X-Time-Zone` header for screens, `tenants.time_zone` / `profiles.time_zone` for work with no viewer.
- Calendar dates an operator types (coupon end, banner window, contract) stay `date`.
- Use `src/lib/time/` (TS, shared with `api/`) and the DB helpers `fn_local_date`, `fn_day_start`, `fn_add_months`.
- Never hardcode a zone. `npm run check:time-zone` enforces it against `scripts/time-zone-literals.baseline.json`, which the coordinator shrinks to zero. A line that truly needs a literal carries `tz-literal-ok: <reason>`. Migrations at or before `20261123153447` (the squashed baseline) are already applied, so the check skips them; later migrations are scanned.
