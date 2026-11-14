# winningpage Repo Rules

Repo-specific facts and exceptions. General placement and naming rules live in the user's shared rules; this file wins on conflict. Update it in the same PR when the structure it describes changes.

## Placement examples and exceptions

- Domain folders: `api/_lib/goal/`, `api/_lib/inquiry/`, `api/_lib/consult/`, `api/_lib/growth/`, `api/_lib/selfeval/`, `src/pages/admin/knowledge/`.
- Feature folders shared by several domains: `api/_lib/ai/` (gemini, sdkAdapter, telemetry), `api/_lib/messaging/` (aligo, alimtalk).
- Shared top-level files: `handler.ts`, `http*.ts`, `supabaseAdmin.ts`, `serviceAccess.ts`, `programAccess.ts`, `phoneCode.ts`, `niceIdentity.ts`, `outbound.ts`, `adminAuth.ts`, `cronAuth.ts`, `site.ts`.
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
