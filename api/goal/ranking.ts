// GET /api/goal/ranking
// Authorization: Bearer <access_token>
//
// 대시보드 우측 레일 "오늘의 학습 순위" 카드(4012:22399)의 실데이터 소스.
// 전체 활성(goal_students.status='active') 학생을 대상으로, 오늘(KST) 제출된
// goal_daily_records.study_hours 로 순위를 매긴다.
//
// ── "오늘"의 기준이 record_date 가 아니라 submitted_on 인 이유 ──────────────
// goal_daily_records.record_date 는 실제 달력이 아니라 가상 날짜다
// (actual_start_date + record_index, sql/55_goal_management.sql:340-341 주석 —
// "실제 달력과 어긋나는 것이 정상이다"). 랭킹은 "오늘 실제로 제출한 사람들"을
// 비교하는 화면이라 실제 제출일 감사 컬럼인 submitted_on(같은 파일:344-345,
// "실제 제출일(KST)")으로 필터한다. record_date로 필터하면 과거에 밀린 가상
// 일차를 오늘 몰아 제출한 학생과 실제로 오늘 공부한 학생이 뒤섞인다.
//
// ── SUM인 이유(단일 행이 아니라) ────────────────────────────────────────────
// record_date(가상 날짜) 유니크 제약만 있고 submitted_on 유니크 제약은 없다
// (같은 파일:378-383) — 밀린 가상 일차를 하루에 몰아 제출하면 같은 실제 날짜에
// 여러 행이 생긴다. "그날 제출된 기록의 순공 시간"을 그 실제 날짜에 제출한
// 모든 기록의 합으로 해석한다 — 부분합만 보면 몰아 제출한 학생이 부당하게
// 낮은 시간으로 집계된다.
//
// ── 마스킹은 서버 전용 ──────────────────────────────────────────────────────
// profiles.name 원본은 이 응답 밖으로 나가지 않는다(본인 제외) — top 배열은
// 항상 maskName()을 거친 문자열만 담는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kstYMD } from "../../src/lib/goal/calc/index.js";
import { num, openGoalSession } from "../_lib/goal/repo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const TABLE_RANKING_STUDENTS = "goal_students";
const TABLE_RANKING_RECORDS = "goal_daily_records";
const TABLE_PROFILES = "profiles";

// api/_lib/goal/repo.ts가 아직 .js(JSDoc 전용)라 세부 행 타입을 내보내지 않는다, 이 파일
// 로컬에서만 쓰는 최소 shape. Stage3(api/_lib/goal/repo.ts 자체 전환)에서 정본을 옮긴다.
type RankedRow = { profileId: string; name: string; hours: number };
type RankedRowWithRank = RankedRow & { rank: number };

/**
 * "홍O동" 마스킹. 성(첫 글자)과 끝 글자는 유지, 가운데는 전부 O.
 *   길이 3: 홍길동 → 홍O동
 *   길이 4+: 남궁민수 → 남OO수 (가운데 전부 O)
 *   길이 2: 홍길 → 홍O (팀장 지시 원문 그대로 — 3+ 규칙과 달리 끝 글자를 O로)
 *   길이 0/1: 마스킹할 가운데가 없어 원본을 그대로 둔다(팀장 지시에 명시 없음 — 판단).
 */
export function maskName(name: string | null | undefined) {
  const value = String(name || "").trim();
  if (value.length <= 1) return value;
  if (value.length === 2) return `${value[0]}O`;
  const middle = "O".repeat(value.length - 2);
  return `${value[0]}${middle}${value[value.length - 1]}`;
}

/**
 * study_hours desc 정렬된 배열에 competition ranking(동률 동순위, 다음 순위는
 * 인원수만큼 건너뜀 — 1,2,2,4)을 매긴다.
 */
export function assignRanks(sortedRows: RankedRow[]): RankedRowWithRank[] {
  let rank = 0;
  let prevHours: number | null = null;
  return sortedRows.map((row, index) => {
    if (prevHours === null || row.hours !== prevHours) {
      rank = index + 1;
    }
    prevHours = row.hours;
    return { ...row, rank };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return sendError(res, "detail", 405, "Method not allowed");
  }

  try {
    const session = await openGoalSession(req);
    if (session.error) {
      return sendError(
        res,
        "detail",
        session.error.status,
        session.error.body.detail as string,
      );
    }

    const { profileId, allowed } = session;
    // openGoalSession(api/_lib/goal/repo.ts, Stage3 대상)의 JSDoc은 supabaseAdmin을 약한
    // `object`로만 선언한다, 이 파일은 api/_lib/goal/repo.ts 헬퍼를 거치지 않고 supabase
    // 클라이언트를 직접 호출하는 유일한 goal/* 라우트라 실제 클라이언트 타입으로
    // 되돌린다(createSupabaseAdmin()의 실제 반환 타입, api/_lib/goal/repo.ts는 수정하지 않는다).
    const supabaseAdmin = session.supabaseAdmin as SupabaseClient;

    // 조회형 규약, 미결제는 에러가 아니다(api/_lib/goal/repo.ts openGoalSession 주석과 동일).
    if (!allowed) {
      return res.status(200).json({ allowed: false });
    }

    const today = kstYMD();

    const [
      { data: activeRows, error: activeError },
      { data: recordRows, error: recordError },
    ] = await Promise.all([
      supabaseAdmin
        .from(TABLE_RANKING_STUDENTS)
        .select("profile_id")
        .eq("status", "active"),
      supabaseAdmin
        .from(TABLE_RANKING_RECORDS)
        .select("profile_id, study_hours")
        .eq("submitted_on", today),
    ]);

    if (activeError) throw activeError;
    if (recordError) throw recordError;

    const activeIds = new Set((activeRows || []).map((row) => row.profile_id));

    // profile_id → 오늘 제출된 모든 기록의 study_hours 합.
    const hoursByProfile = new Map();
    for (const row of recordRows || []) {
      if (!activeIds.has(row.profile_id)) continue;
      const hours = num(row.study_hours) ?? 0;
      hoursByProfile.set(
        row.profile_id,
        (hoursByProfile.get(row.profile_id) || 0) + hours,
      );
    }

    const profileIds = [...hoursByProfile.keys()];

    let nameById = new Map();
    if (profileIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabaseAdmin
        .from(TABLE_PROFILES)
        .select("id, name")
        .in("id", profileIds);

      if (profileError) throw profileError;
      nameById = new Map(
        (profileRows || []).map((row) => [row.id, row.name || ""]),
      );
    }

    const sorted = profileIds
      .map((id) => ({
        profileId: id,
        name: nameById.get(id) || "",
        hours: hoursByProfile.get(id),
      }))
      .sort((a, b) => b.hours - a.hours);

    const ranked = assignRanks(sorted);

    const top = ranked.slice(0, 5).map((row) => ({
      rank: row.rank,
      name: maskName(row.name),
      hours: row.hours,
    }));

    const meRow = ranked.find((row) => row.profileId === profileId) || null;
    const me = meRow
      ? { rank: meRow.rank, name: meRow.name, hours: meRow.hours }
      : null;

    return res.status(200).json({ ok: true, date: today, top, me });
  } catch (error) {
    console.error("goal/ranking error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
