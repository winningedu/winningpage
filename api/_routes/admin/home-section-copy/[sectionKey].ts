// GET, PUT /api/admin/home-section-copy/:sectionKey  (services | mentor | acceptance)
//
// 홈 섹션 제목(라벨, 큰제목, 중제목) 한 행을 읽고 쓴다. 예전에는 브라우저가 home_section_copy 를 직접
// 읽고 upsert 했다. 권한은 섹션마다 다른 어드민 메뉴 키(permission 옵션)로 판정한다.

import { z } from "zod";
import { defineHandler, RouteParamError } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// 섹션 키 -> 어드민 메뉴 키. 라벨(eyebrow)은 랜딩에서 services, mentor 만 그린다.
const SECTIONS = {
  services: { menuKey: "programCategories", hasEyebrow: true },
  mentor: { menuKey: "mentorStrategies", hasEyebrow: true },
  acceptance: { menuKey: "universityAcceptances", hasEyebrow: false },
} as const;

type SectionKey = keyof typeof SECTIONS;

function sectionOf(raw: unknown): SectionKey {
  if (typeof raw === "string" && Object.hasOwn(SECTIONS, raw)) {
    return raw as SectionKey;
  }
  // 권한 키 함수보다 먼저 던져 모르는 키가 403 이 아니라 400 이 되게 한다.
  throw new RouteParamError("sectionKey", "알 수 없는 섹션입니다.");
}

const putBody = z.object({
  eyebrow: z.string().nullable(),
  title_main: z.string().trim().min(1),
  title_sub: z.string().nullable(),
});

export default defineHandler({
  methods: ["GET", "PUT"],
  auth: "admin",
  errorShape: "problem",
  permission: {
    key: (req) => SECTIONS[sectionOf(req.query.sectionKey)].menuKey,
  },
  unhandledMessage: "섹션 제목을 처리하지 못했습니다.",
  logLabel: "[admin/home-section-copy]",
  handler: async (req, res, ctx) => {
    const sectionKey = sectionOf(req.query.sectionKey);

    if (req.method === "GET") {
      const { data, error } = await ctx.supabaseAdmin
        .from("home_section_copy")
        .select("section_key, eyebrow, title_main, title_sub")
        .eq("section_key", sectionKey)
        .maybeSingle();
      if (error) throw new Error("home_section_copy read failed");
      if (!data) {
        sendError(
          res,
          "problem",
          404,
          "섹션 제목이 아직 없습니다.",
          "NOT_FOUND",
        );
        return;
      }
      res.status(200).json(data);
      return;
    }

    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) {
      throw new RouteParamError("body", "입력값을 확인해 주세요.");
    }
    const row = {
      section_key: sectionKey,
      eyebrow: SECTIONS[sectionKey].hasEyebrow ? parsed.data.eyebrow : null,
      title_main: parsed.data.title_main,
      title_sub: parsed.data.title_sub,
    };
    const { error } = await ctx.supabaseAdmin
      .from("home_section_copy")
      .upsert(row, { onConflict: "section_key" });
    if (error) throw new Error("home_section_copy upsert failed");
    res.status(200).json(row);
  },
});
