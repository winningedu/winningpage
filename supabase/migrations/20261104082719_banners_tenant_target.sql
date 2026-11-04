-- 배너 관리(기능요구명세서 #153): 대형 배너 노출 기간과 두 배너의 노출 대상 지정.
-- tenant_id NULL = 공통(소속 제한 없음). products/coupons.tenant_id 와 같은 의미이며
-- 단일 기관만 지정한다. 공개 화면 판정은 클라이언트(fn_matched_tenant_ids)에서 하는 표시 전용이다.

ALTER TABLE "public"."banners"
    ADD COLUMN IF NOT EXISTS "start_date" date,
    ADD COLUMN IF NOT EXISTS "end_date" date;

ALTER TABLE "public"."banners"
    ADD CONSTRAINT "banners_date_check" CHECK (("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date"));

COMMENT ON COLUMN "public"."banners"."start_date" IS '노출 시작일(KST, 당일 포함). NULL 이면 시작 제한 없음. home_side_banners.start_date 와 같은 의미.';
COMMENT ON COLUMN "public"."banners"."end_date" IS '노출 종료일(KST, 당일 포함). NULL 이면 종료 제한 없음. home_side_banners.end_date 와 같은 의미.';

ALTER TABLE "public"."banners"
    ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "public"."tenants"("id");

ALTER TABLE "public"."home_side_banners"
    ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "public"."tenants"("id");

COMMENT ON COLUMN "public"."banners"."tenant_id" IS '노출 대상 기관. NULL 이면 공통(모두에게 노출).';
COMMENT ON COLUMN "public"."home_side_banners"."tenant_id" IS '노출 대상 기관. NULL 이면 공통(모두에게 노출).';

CREATE INDEX IF NOT EXISTS "banners_tenant_id_idx" ON "public"."banners" USING "btree" ("tenant_id");
CREATE INDEX IF NOT EXISTS "home_side_banners_tenant_id_idx" ON "public"."home_side_banners" USING "btree" ("tenant_id");
