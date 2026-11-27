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

import type { Context } from "hono";
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
import { type UserEnv, userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

// sql/76_goal_workbooks.sql goal_workbooks_subject_check와 정확히 같은 5종.
// export: src/components/goal/subjectTokens.ts WORKBOOK_SUBJECT_IDS와의 parity
// 테스트(subjectTokens.test.ts)가 이 배열을 그대로 가져다 비교한다.
export const SUBJECT_IDS = ["korean", "math", "english", "science", "etc"];

const TITLE_MAX_LENGTH = 100;
// 페이지 수 상한 — 실제 문제집 규모를 훨씬 웃도는 값으로 여유를 두되, 오입력(자릿수
// 실수)이 그대로 저장되는 것만 막는다.
const MAX_PAGES = 100000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// intake.js isNumericInput과 동일한 사유 — boolean/객체가 Number()를 통해 조용히
// 숫자로 접히는 경로를 막는다.
function isNumericInput(raw: unknown) {
  return typeof raw === "number" || typeof raw === "string";
}

function isValidPageCount(
  raw: unknown,
  { min, max }: { min: number; max: number },
) {
  if (!isNumericInput(raw)) return false;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max;
}

function fail(detail: string) {
  return { status: 400, body: { detail } };
}

// 본문을 JSON 으로 읽는다. 비었거나 깨졌으면 null 이고, 형식 검사는 각 핸들러가 한다.
async function readBody(c: Context) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function validateId(rawId: unknown) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function validateCreateBody(body: unknown) {
  if (!isPlainObject(body))
    return { error: fail("요청 본문이 올바르지 않습니다.") };

  const subject = clean(body.subject);
  if (!SUBJECT_IDS.includes(subject))
    return { error: fail("과목을 선택해 주세요.") };

  const title = clean(body.title);
  if (!title) return { error: fail("문제집 이름을 입력해 주세요.") };
  if (title.length > TITLE_MAX_LENGTH)
    return { error: fail("문제집 이름이 너무 깁니다.") };

  if (!isValidPageCount(body.totalPages, { min: 1, max: MAX_PAGES })) {
    return {
      error: fail(`전체 페이지는 1~${MAX_PAGES} 사이의 숫자여야 합니다.`),
    };
  }
  const totalPages = Number(body.totalPages);

  let currentPage = 0;
  if (
    body.currentPage !== undefined &&
    body.currentPage !== null &&
    body.currentPage !== ""
  ) {
    if (!isValidPageCount(body.currentPage, { min: 0, max: MAX_PAGES })) {
      return { error: fail("현재 페이지는 0 이상의 숫자여야 합니다.") };
    }
    currentPage = Number(body.currentPage);
  }
  // 전체 페이지를 넘는 현재 페이지는 거부한다(사용자 확정 2026-09-02) — 예전엔
  // 완독으로 클램프했지만, 클라이언트가 초과 입력을 그대로 받게 되는 구멍이라
  // 서버도 400으로 막아 두 겹으로 지킨다.
  if (currentPage > totalPages) {
    return { error: fail("현재 페이지는 전체 페이지를 넘을 수 없습니다.") };
  }

  return { value: { subject, title, totalPages, currentPage } };
}

/**
 * PUT 바디를 검증한다. subject는 수정 대상에서 뺐다 — 등록 후 과목을 바꾸면
 * EffortSubjectCard 카드 간 이동이 되는데, 그 동선이 시안에 없다(추정 회피).
 * 과목을 바꾸려면 삭제 후 재등록해야 한다.
 */
export function validateUpdateBody(body: unknown) {
  if (!isPlainObject(body))
    return { error: fail("요청 본문이 올바르지 않습니다.") };

  const id = validateId(body.id);
  if (!id) return { error: fail("문제집을 찾을 수 없습니다.") };

  const patch: { title?: string; currentPage?: number } = {};

  if (body.title !== undefined) {
    const title = clean(body.title);
    if (!title) return { error: fail("문제집 이름을 입력해 주세요.") };
    if (title.length > TITLE_MAX_LENGTH)
      return { error: fail("문제집 이름이 너무 깁니다.") };
    patch.title = title;
  }

  // 전체 페이지는 등록 시 한 번만 정한다(사용자 확정 2026-09-02) — 이후 수정을
  // 허용하면 진도율·완독 판정의 기준이 사후에 흔들린다. 보내오면 명시적으로 거부.
  if (body.totalPages !== undefined) {
    return { error: fail("전체 페이지는 등록 후 수정할 수 없습니다.") };
  }

  if (body.currentPage !== undefined) {
    if (!isValidPageCount(body.currentPage, { min: 0, max: MAX_PAGES })) {
      return { error: fail("현재 페이지는 0 이상의 숫자여야 합니다.") };
    }
    patch.currentPage = Number(body.currentPage);
  }

  if (Object.keys(patch).length === 0) {
    return { error: fail("변경할 값이 없습니다.") };
  }

  return { value: { id, patch } };
}

/**
 * "완독! 책장에 꽂기" 전용 PUT 바디({id, shelve:true})를 검증한다. title/totalPages/
 * currentPage와는 다른 액션이라 별도 검증 함수로 둔다 — 섞여 들어오면 shelve를
 * 우선시하고 나머지 필드는 무시한다(핸들러 분기 참고).
 */
function validateShelveBody(body: unknown) {
  if (!isPlainObject(body))
    return { error: fail("요청 본문이 올바르지 않습니다.") };

  const id = validateId(body.id);
  if (!id) return { error: fail("문제집을 찾을 수 없습니다.") };

  return { value: { id } };
}

const guard = user({
  unhandledMessage: "처리 중 오류가 발생했습니다.",
  logLabel: "goal/workbooks",
});

export const workbooks = userFactory
  .createApp()
  .on(["GET", "POST", "PUT", "DELETE"], "/", guard, async (c) => {
    try {
      const session = await openGoalSession(c);

      const { allowed } = session;

      if (c.req.method === "GET") {
        // 조회형 규약 — 미결제는 에러가 아니다(student.js와 동일).
        if (!allowed)
          return c.json({
            allowed: false,
            ...tenantReasonExtra(session.tenantReason),
          });

        const { supabaseAdmin, profileId } = narrowGoalSession(session);
        const rows = await fetchWorkbooks(supabaseAdmin, profileId);
        return goalFail(c, 200, {
          ok: true,
          workbooks: rows.map(buildWorkbookPayload),
        });
      }

      // 이하 전부 쓰기형이므로 미결제는 403이다(intake.js와 동일).
      if (!allowed)
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const body = await readBody(c);

      if (c.req.method === "POST") {
        const validated = validateCreateBody(body);
        if (validated.error)
          return goalFail(c, validated.error.status, validated.error.body);

        const { subject, title, totalPages, currentPage } = validated.value;
        const row = await insertWorkbook(supabaseAdmin, {
          profile_id: profileId,
          subject,
          title,
          total_pages: totalPages,
          current_page: currentPage,
          status: computeWorkbookStatus(currentPage, totalPages),
        });

        return goalFail(c, 200, {
          ok: true,
          workbook: buildWorkbookPayload(row),
        });
      }

      if (c.req.method === "PUT") {
        // "완독! 책장에 꽂기" — status='done'으로 자동 계산된 문제집을 학생이 직접
        // BookStack으로 옮기는 별도 액션이다(Figma 4026:6046). 시안/원본은 100% 달성 즉시
        // 자동으로 책장에 꽂지 않고 이 버튼을 눌러야 넘어간다 — title/totalPages/currentPage
        // 수정 PUT과는 다른 요청이라 body.shelve로 먼저 분기한다.
        if (isPlainObject(body) && body.shelve === true) {
          const validated = validateShelveBody(body);
          if (validated.error)
            return goalFail(c, validated.error.status, validated.error.body);

          const { id } = validated.value;
          const existing = await fetchWorkbookOwned(
            supabaseAdmin,
            id,
            profileId,
          );
          if (!existing)
            return goalFail(c, 404, { detail: "문제집을 찾을 수 없습니다." });

          if (!canShelveWorkbook(existing.status)) {
            return goalFail(c, 400, {
              detail: "아직 완독하지 않은 문제집은 책장에 꽂을 수 없습니다.",
            });
          }

          // 이미 꽂혀 있으면 그대로 되돌린다(중복 클릭 방어 — shelved_at을 불필요하게
          // 다시 밀지 않는다, 최신 완독이 위로 오는 BookStack 정렬이 흔들리지 않게).
          if (existing.shelved_at) {
            return goalFail(c, 200, {
              ok: true,
              workbook: buildWorkbookPayload(existing),
            });
          }

          const updated = await updateWorkbookOwned(
            supabaseAdmin,
            id,
            profileId,
            {
              shelved_at: new Date().toISOString(),
            },
          );
          if (!updated)
            return goalFail(c, 404, { detail: "문제집을 찾을 수 없습니다." });
          return goalFail(c, 200, {
            ok: true,
            workbook: buildWorkbookPayload(updated),
          });
        }

        const validated = validateUpdateBody(body);
        if (validated.error)
          return goalFail(c, validated.error.status, validated.error.body);

        const { id, patch } = validated.value;
        const existing = await fetchWorkbookOwned(supabaseAdmin, id, profileId);
        if (!existing)
          return goalFail(c, 404, { detail: "문제집을 찾을 수 없습니다." });

        // 바뀌지 않은 필드는 기존 값을 그대로 되먹여 항상 완전한 행을 쓴다 —
        // 부분 patch 조립보다 단순하고, current_page/total_pages 조합이 바뀔 때마다
        // status를 놓치지 않는다(sql/76 status 컬럼 코멘트와 동일 규약).
        const nextTotalPages = existing.total_pages;
        const nextCurrentPage = patch.currentPage ?? existing.current_page;
        if (nextCurrentPage > nextTotalPages) {
          return goalFail(c, 400, {
            detail: "현재 페이지는 전체 페이지를 넘을 수 없습니다.",
          });
        }

        const updated = await updateWorkbookOwned(
          supabaseAdmin,
          id,
          profileId,
          {
            title: patch.title ?? existing.title,
            total_pages: nextTotalPages,
            current_page: nextCurrentPage,
            status: computeWorkbookStatus(nextCurrentPage, nextTotalPages),
          },
        );

        if (!updated)
          return goalFail(c, 404, { detail: "문제집을 찾을 수 없습니다." });
        return goalFail(c, 200, {
          ok: true,
          workbook: buildWorkbookPayload(updated),
        });
      }

      // DELETE
      const id = validateId(body?.id);
      if (!id)
        return goalFail(c, 400, { detail: "문제집을 찾을 수 없습니다." });

      const deleted = await deleteWorkbookOwned(supabaseAdmin, id, profileId);
      if (!deleted)
        return goalFail(c, 404, { detail: "문제집을 찾을 수 없습니다." });

      return c.json({});
    } catch (error) {
      console.error("goal/workbooks error:", error);
      return goalFail(c, 500, { detail: "처리 중 오류가 발생했습니다." });
    }
  })
  .all("/", methodNotAllowed("GET", "POST", "PUT", "DELETE"));
