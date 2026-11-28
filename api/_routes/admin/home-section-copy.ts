// /api/admin/home-section-copy 아래 홈 섹션 제목 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/home-section-copy", homeSectionCopy) 로 붙인다.
// 요청 검증과 응답 모양은 shared/home-section-copy/contract.ts 를 따른다.
// 홈 섹션 제목(라벨, 큰제목, 중제목) 한 행을 읽고 쓴다. 권한은 섹션마다 다른 메뉴 키를 키 함수로 판정한다(GET view, PUT edit).

import type { Context } from "hono";
import type { AdminMenuKey } from "../../../shared/admin-permission/menu.js";
import {
  type SectionCopy,
  type SectionKey,
  sectionCopyBody,
} from "../../../shared/home-section-copy/contract.js";
import { RouteParamError } from "../../_lib/handler.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, notFound } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

// 섹션 키에서 메뉴 키. 라벨(eyebrow)은 랜딩에서 services, mentor 만 그린다.
const SECTIONS = {
  services: { menuKey: "programCategories", hasEyebrow: true },
  mentor: { menuKey: "mentorStrategies", hasEyebrow: true },
  acceptance: { menuKey: "universityAcceptances", hasEyebrow: false },
} as const satisfies Record<
  SectionKey,
  { menuKey: AdminMenuKey; hasEyebrow: boolean }
>;

function sectionOf(c: Context): SectionKey {
  const raw = c.req.param("sectionKey");
  if (typeof raw === "string" && Object.hasOwn(SECTIONS, raw)) {
    return raw as SectionKey;
  }
  // 권한 키 함수 안에서 던져 모르는 키가 403 이 아니라 400 이 되게 한다.
  throw new RouteParamError("sectionKey", "알 수 없는 섹션입니다.");
}

const guard = admin({
  // 키 함수는 요청 값에서 키를 만들어 string 을 돌려준다(모르는 키는 권한 판정에서 403).
  permission: { key: (c) => SECTIONS[sectionOf(c)].menuKey },
  unhandledMessage: "섹션 제목을 처리하지 못했습니다.",
  logLabel: "[admin/home-section-copy]",
});

export const homeSectionCopy = adminFactory
  .createApp()
  .get("/:sectionKey", guard, async (c) => {
    const { data, error } = await c.var.supabaseAdmin
      .from("home_section_copy")
      .select("section_key, eyebrow, title_main, title_sub")
      .eq("section_key", sectionOf(c))
      .maybeSingle();
    if (error) throw new Error("home_section_copy read failed");
    if (!data) throw notFound("섹션 제목");
    return c.json(data satisfies SectionCopy);
  })
  // PUT: 섹션 키 기준 upsert. 본문 오류는 400 VALIDATION_FAILED 이고 errors[0].message 가 "입력값을 확인해 주세요." 다.
  .put("/:sectionKey", guard, validate("json", sectionCopyBody), async (c) => {
    const sectionKey = sectionOf(c);
    const body = c.req.valid("json");
    const row = {
      section_key: sectionKey,
      eyebrow: SECTIONS[sectionKey].hasEyebrow ? body.eyebrow : null,
      title_main: body.title_main,
      title_sub: body.title_sub,
    } satisfies SectionCopy;
    const { error } = await c.var.supabaseAdmin
      .from("home_section_copy")
      .upsert(row, { onConflict: "section_key" });
    if (error) throw new Error("home_section_copy upsert failed");
    return c.json(row satisfies SectionCopy);
  })
  .all("/:sectionKey", methodNotAllowed("GET", "PUT"));
