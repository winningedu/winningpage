// GET·POST·PUT·DELETE /api/goal/workbooks
// Authorization: Bearer <access_token>
//
// 목표관리 "나의 노력" 화면(과목별 문제집 진도)의 CRUD. student.js(조회형)와
// intake.js(쓰기형) 두 파일의 게이트 관례를 한 파일 안에서 메서드별로 나눠 쓴다 —
// GET은 미결제를 200 {allowed:false}로, 그 외는 403으로 돌려준다(api/_lib/goal/repo.ts
// openGoalSession 주석 §9-1과 동일 규약). 계산 로직은 없다 — 소유자 판정과
// status(reading/done) 재계산만 이 파일이 맡고 나머지는 api/_lib/goal/repo.ts에 위임한다.
//
// 응답 필드는 카멜 케이스(api/_lib/goal/repo.ts buildWorkbookPayload). subject는 한글 라벨이
// 아니라 id(korean/math/english/science/etc)다 — 표시 문자열 변환은
// src/components/goal/subjectTokens.js가 프론트에서 담당한다.

import type { z } from "zod";
import {
  workbookCreateBody,
  workbookDeleteBody,
  type workbookDeleteResponse,
  workbookPutBody,
  type workbookResponse,
  type workbooksListResponse,
} from "../../../shared/goal/workbooks.js";
import { goalFail } from "../../_lib/goal/problem.js";
import {
  buildWorkbookPayload,
  canShelveWorkbook,
  computeWorkbookStatus,
  deleteWorkbookOwned,
  fetchWorkbookOwned,
  fetchWorkbooks,
  insertWorkbook,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  updateWorkbookOwned,
} from "../../_lib/goal/repo.js";
import { userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

const NOT_FOUND = { detail: "문제집을 찾을 수 없습니다." };
const UNHANDLED = { detail: "처리 중 오류가 발생했습니다." };

const guard = user({
  unhandledMessage: "처리 중 오류가 발생했습니다.",
  logLabel: "goal/workbooks",
});

export const workbooks = userFactory
  .createApp()
  .get("/", guard, async (c) => {
    try {
      const session = await openGoalSession(c);

      // 조회형 규약: 미결제는 에러가 아니다(student.js와 동일).
      if (!session.allowed) {
        return c.json({
          allowed: false,
          ...tenantReasonExtra(session.tenantReason),
        } satisfies z.input<typeof workbooksListResponse>);
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const rows = await fetchWorkbooks(supabaseAdmin, profileId);
      return c.json({
        workbooks: rows.map(buildWorkbookPayload),
      } as z.input<typeof workbooksListResponse>);
    } catch (error) {
      console.error("goal/workbooks error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .post("/", guard, validate("json", workbookCreateBody), async (c) => {
    try {
      const session = await openGoalSession(c);

      // 쓰기형이므로 미결제는 403이다(intake.js와 동일).
      if (!session.allowed) {
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const {
        subject,
        title,
        totalPages,
        currentPage = 0,
      } = c.req.valid("json");
      const current = currentPage ?? 0;
      // 전체 페이지를 넘는 현재 페이지는 거부한다(사용자 확정 2026-09-02).
      if (current > totalPages) {
        return goalFail(c, 400, {
          detail: "현재 페이지는 전체 페이지를 넘을 수 없습니다.",
        });
      }

      const row = await insertWorkbook(supabaseAdmin, {
        profile_id: profileId,
        subject,
        title,
        total_pages: totalPages,
        current_page: current,
        status: computeWorkbookStatus(current, totalPages),
      });

      return c.json({
        workbook: buildWorkbookPayload(row),
      } as z.input<typeof workbookResponse>);
    } catch (error) {
      console.error("goal/workbooks error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .put("/", guard, validate("json", workbookPutBody), async (c) => {
    try {
      const session = await openGoalSession(c);

      if (!session.allowed) {
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const body = c.req.valid("json");

      // "완독! 책장에 꽂기": status='done'으로 자동 계산된 문제집을 학생이 직접
      // BookStack으로 옮기는 별도 액션이다(Figma 4026:6046). 수정 PUT과 다른 요청이라 먼저 분기한다.
      if ("shelve" in body) {
        const existing = await fetchWorkbookOwned(
          supabaseAdmin,
          body.id,
          profileId,
        );
        if (!existing) return goalFail(c, 404, NOT_FOUND);

        if (!canShelveWorkbook(existing.status)) {
          return goalFail(c, 400, {
            detail: "아직 완독하지 않은 문제집은 책장에 꽂을 수 없습니다.",
          });
        }

        // 이미 꽂혀 있으면 그대로 되돌린다(중복 클릭 방어, 최신 완독이 위로 오는 정렬이 흔들리지 않게).
        if (existing.shelved_at) {
          return c.json({
            workbook: buildWorkbookPayload(existing),
          } as z.input<typeof workbookResponse>);
        }

        const updated = await updateWorkbookOwned(
          supabaseAdmin,
          body.id,
          profileId,
          { shelved_at: new Date().toISOString() },
        );
        if (!updated) return goalFail(c, 404, NOT_FOUND);
        return c.json({
          workbook: buildWorkbookPayload(updated),
        } as z.input<typeof workbookResponse>);
      }

      // 전체 페이지는 등록 시 한 번만 정한다(사용자 확정 2026-09-02). 이후 수정을
      // 허용하면 진도율과 완독 판정의 기준이 사후에 흔들린다. 보내오면 명시적으로 거부한다.
      if (body.totalPages !== undefined) {
        return goalFail(c, 400, {
          detail: "전체 페이지는 등록 후 수정할 수 없습니다.",
        });
      }
      if (body.title === undefined && body.currentPage === undefined) {
        return goalFail(c, 400, { detail: "변경할 값이 없습니다." });
      }

      const existing = await fetchWorkbookOwned(
        supabaseAdmin,
        body.id,
        profileId,
      );
      if (!existing) return goalFail(c, 404, NOT_FOUND);

      // 바뀌지 않은 필드는 기존 값을 그대로 되먹여 항상 완전한 행을 쓴다.
      // current_page/total_pages 조합이 바뀔 때마다 status를 놓치지 않는다(sql/76 규약).
      const nextTotalPages = existing.total_pages;
      const nextCurrentPage = body.currentPage ?? existing.current_page;
      if (nextCurrentPage > nextTotalPages) {
        return goalFail(c, 400, {
          detail: "현재 페이지는 전체 페이지를 넘을 수 없습니다.",
        });
      }

      const updated = await updateWorkbookOwned(
        supabaseAdmin,
        body.id,
        profileId,
        {
          title: body.title ?? existing.title,
          total_pages: nextTotalPages,
          current_page: nextCurrentPage,
          status: computeWorkbookStatus(nextCurrentPage, nextTotalPages),
        },
      );
      if (!updated) return goalFail(c, 404, NOT_FOUND);
      return c.json({
        workbook: buildWorkbookPayload(updated),
      } as z.input<typeof workbookResponse>);
    } catch (error) {
      console.error("goal/workbooks error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .delete("/", guard, validate("json", workbookDeleteBody), async (c) => {
    try {
      const session = await openGoalSession(c);

      if (!session.allowed) {
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const deleted = await deleteWorkbookOwned(
        supabaseAdmin,
        c.req.valid("json").id,
        profileId,
      );
      if (!deleted) return goalFail(c, 404, NOT_FOUND);

      return c.json({} satisfies z.input<typeof workbookDeleteResponse>);
    } catch (error) {
      console.error("goal/workbooks error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .all("/", methodNotAllowed("GET", "POST", "PUT", "DELETE"));
