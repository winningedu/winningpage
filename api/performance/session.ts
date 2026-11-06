// POST /api/performance/session
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { action:'create'|'resume', basicInfo? }
//   → 201 { session, quotaRemaining }
//   → 403 { error:{code:'NO_ENTITLEMENT', ...} }
//   → 409 { error:{code:'UNCHARGED_SESSION_EXISTS', ...}, sessionId }  (§9.3)
//
// ── 이 파일이 다루는 것 (STEP1 폼 제출 = 세션 생성)
//    §5.5 BasicInfoForm 제출 한 번이 곧 세션 생성 한 번이다. `basicInfo`가 실려 오면
//    5필수 필드(학년·학기·교과군·과목·희망 진로)를 전부 검증하고 한 트랜잭션처럼
//    (단일 insert) 채워 넣는다 — 부분 필드로 세션을 만들지 않는다.
//
// ── school_type 신뢰 경계 (Q61-ⓔ)
//    요청 바디에서 school_type을 **읽지 않는다.** 클라이언트가 그 키를 보내더라도
//    이 핸들러는 애초에 `basicInfo` 중 정해진 6개 키만 꺼내 쓰므로 무시된다.
//    서버가 `profiles.school_type`을 조회해 세션 시점 스냅샷으로만 채운다.
//
// ── 미차감 세션 동시 1개 제한 (§9.3, §8.6 이 엔드포인트 자체의 문서화된 실패 코드)
//    `performance_credit_ledger`에 행이 없는(=아직 회차를 소비하지 않은) 세션은
//    프로필당 최대 1개다. `action:'create'`가 그 상태에서 또 만들려 하면
//    `409 UNCHARGED_SESSION_EXISTS{sessionId}`로 막는다. 이 판정은 §8.6 엔드포인트
//    표가 **이 엔드포인트 자신의 실패 코드**로 이미 명시했으므로 P6(이 파일) 범위다 —
//    반면 `consume_performance_credit` RPC를 통한 실제 차감 배선(주제 추천 성공 시)은
//    P8/P15 몫이고 이 파일은 건드리지 않는다. 여기서 하는 일은 차감이 아니라
//    "차감 전 세션이 이미 있는가"를 확인하는 존재 조회뿐이다.
//
//    `action:'resume'`는 그 유일한 미차감 세션을 이어받는다 — 별도 sessionId를
//    받지 않는다(프로필당 최대 1개이므로 서버가 스스로 찾을 수 있다). `basicInfo`가
//    함께 오면 그 세션의 STEP1 값을 갱신한다(폼을 다시 제출한 경우). 미차감 세션이
//    아예 없는데 resume을 부르면 `404 NO_UNCHARGED_SESSION`을 돌려준다 — §8.6이
//    이 경우의 코드를 명시하지 않아 다른 엔드포인트의 404 관례를 그대로 따른 판단이다.
//
// ── current_step / completed_steps
//    STEP1 제출 성공 = STEP1 완료이므로 `completed_steps`에 1을 더하고
//    `current_step`을 2로 올린다(§8.3 컬럼 정의, 5단계 상한은 스키마 체크 제약이 보장).
//    `basicInfo` 없이 만드는 빈 draft(§8.6 `basicInfo?`가 선택인 이유 — 다른 진입
//    경로가 먼저 빈 세션을 잡아둘 수 있다는 계약)는 1/빈 배열 그대로 둔다. resume에서
//    기존 진행이 이미 2보다 앞서 있으면 되돌리지 않는다(뒤로 가지 않는다).
//
// ── 회차는 차감하지 않는다 (§9.3 "세션 생성 | 없음")
//    quotaRemaining은 안내용 스냅샷으로만 응답에 싣는다.

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { TOPIC_MAX_ROUNDS } from "../_lib/performance/topic-rounds.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";
import type { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";
import { tenantReasonExtra } from "../_lib/tenantUsage.js";

const SERVICE_KEY = "suhaeng";

// 미차감 후보로 볼 상태. completed/archived는 이미 끝났거나 사용자가 치운 세션이라
// "진행 중 미차감"의 대상이 아니다(bootstrap.js RESUMABLE_STATUSES와 같은 축).
const UNCHARGED_CANDIDATE_STATUSES = ["draft", "in_progress"];

const REQUIRED_BASIC_INFO_FIELDS = [
  "gradeLabel",
  "semester",
  "subjectGroup",
  "subject",
  "careerGoal",
] as const;

const SESSION_COLUMNS = [
  "id",
  "status",
  "current_step",
  "completed_steps",
  "grade_label",
  "semester",
  "school_type",
  "subject_group",
  "subject",
  "career_goal",
  "previous_topic",
  "created_at",
  "updated_at",
].join(",");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET 전용 — POST(SESSION_COLUMNS)엔 없는 `guide_input_mode`/`selected_topic_id`를
// 더 싣는다. 재개 분기 판정표(§5.4)가 이 두 컬럼으로 ⓐ/ⓑ/ⓒ를 가른다.
const GET_SESSION_COLUMNS = [
  "id",
  "status",
  "current_step",
  "completed_steps",
  "grade_label",
  "semester",
  "school_type",
  "subject_group",
  "subject",
  "career_goal",
  "previous_topic",
  "guide_input_mode",
  "selected_topic_id",
  "created_at",
  "updated_at",
].join(",");

// `recommend-topics.js`와 같은 정본(`../_lib/performance/topic-rounds.js`)을 그대로
// 읽는다 — 예전에 이 파일이 `MAX_ROUNDS = 3`을 따로 들고 있다가 정본(2)과 갈라져
// 재개 응답의 "남은 추가 추천" 표시가 틀리던 사고가 있었다. GET은 새 라운드를 만들지
// 않지만 응답의 `maxRounds`를 클라이언트의 버튼 비활성 판정 재료로 그대로 싣는다.
const MAX_ROUNDS = TOPIC_MAX_ROUNDS;

type SessionRow = {
  id: string;
  status: string;
  current_step: number | null;
  completed_steps: unknown;
  grade_label: string | null;
  semester: string | null;
  school_type: string | null;
  subject_group: string | null;
  subject: string | null;
  career_goal: string | null;
  previous_topic: string | null;
  guide_input_mode?: string | null;
  selected_topic_id?: string | null;
  created_at: string;
  updated_at: string;
};

type TopicRow = {
  id: string;
  round: number;
  idx: number;
  title: string;
  subtitle: string | null;
  tags: unknown;
  detail: unknown;
  selected: boolean;
};

type BasicInfoColumns = {
  grade_label: string;
  semester: string;
  subject_group: string;
  subject: string;
  career_goal: string;
  previous_topic: string | null;
};

type NormalizeBasicInfoResult =
  | { ok: true; columns: BasicInfoColumns }
  | { ok: false; code: "INVALID_BASIC_INFO" }
  | { ok: false; code: "MISSING_FIELD"; field: string };

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, extra);
}

/** `recommend-topics.js`의 `toClientTopic`과 같은 모양(§8.3 `performance_topics` 계약). */
function toClientTopic(row: TopicRow) {
  return {
    id: row.id,
    round: row.round,
    idx: row.idx,
    title: row.title,
    subtitle: row.subtitle,
    tags: Array.isArray(row.tags) ? row.tags : [],
    detail: Array.isArray(row.detail) ? row.detail : [],
    selected: row.selected === true,
  };
}

function toClientSession(row: SessionRow) {
  return {
    id: row.id,
    status: row.status,
    currentStep: row.current_step,
    completedSteps: Array.isArray(row.completed_steps)
      ? row.completed_steps
      : [],
    gradeLabel: row.grade_label,
    semester: row.semester,
    schoolType: row.school_type,
    subjectGroup: row.subject_group,
    subject: row.subject,
    careerGoal: row.career_goal,
    previousTopic: row.previous_topic,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `basicInfo`를 검증하고 DB 컬럼명으로 정규화한다. **`school_type`은 여기서 절대
 * 읽지 않는다** — 이 함수가 꺼내는 키는 아래 6개가 전부이며, 그 외 클라이언트가
 * 무엇을 보내든 무시된다(신뢰 경계, Q61-ⓔ).
 */
function normalizeBasicInfo(raw: unknown): NormalizeBasicInfoResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "INVALID_BASIC_INFO" };
  }

  const source = raw as Record<string, unknown>;
  const clean: Record<string, string> = {};
  for (const key of [
    "gradeLabel",
    "semester",
    "subjectGroup",
    "subject",
    "careerGoal",
    "previousTopic",
  ]) {
    const value = source[key];
    clean[key] = typeof value === "string" ? value.trim() : "";
  }

  for (const field of REQUIRED_BASIC_INFO_FIELDS) {
    if (!clean[field]) {
      return { ok: false, code: "MISSING_FIELD", field };
    }
  }

  return {
    ok: true,
    columns: {
      // REQUIRED_BASIC_INFO_FIELDS 검증(위 루프)을 통과했으므로 5개 필드 모두 존재한다.
      grade_label: clean.gradeLabel!,
      semester: clean.semester!,
      subject_group: clean.subjectGroup!,
      subject: clean.subject!,
      career_goal: clean.careerGoal!,
      // 프롬프트 기본값 '없음'은 애플리케이션(추천 프롬프트) 레이어의 몫이다(§8.3) —
      // 여기서는 미입력을 있는 그대로 null로 저장한다.
      previous_topic: clean.previousTopic || null,
    },
  };
}

/**
 * 이 프로필의 미차감 세션(있다면 정확히 1개)을 찾는다. PostgREST에 anti-join이
 * 없어 후보 세션을 먼저 뽑고 원장에 있는 session_id를 빼는 두 단계로 판정한다
 * (bootstrap.js `latestDraftRow`와 동일한 패턴).
 */
async function findUnchargedSession(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
): Promise<SessionRow | null> {
  const { data: sessionRows, error: sessionError } = await supabaseAdmin
    .from("performance_sessions")
    .select(SESSION_COLUMNS)
    .eq("profile_id", userId)
    .in("status", UNCHARGED_CANDIDATE_STATUSES)
    .order("updated_at", { ascending: false });

  if (sessionError) throw new Error(`세션 조회 실패: ${sessionError.message}`);

  // `SESSION_COLUMNS`가 런타임 조립 문자열(`string`)이라 supabase-js가 리터럴
  // 파싱 기반 열 추론을 못 하고 `GenericStringError`로 떨어진다 — 실제 select
  // 목록과 SessionRow 필드는 위 상수와 정확히 대응하므로 안전한 캐스트다.
  const rows = (sessionRows || []) as unknown as SessionRow[];
  if (!rows.length) return null;

  const ids = rows.map((row) => row.id);
  const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
    .from("performance_credit_ledger")
    .select("session_id")
    .eq("profile_id", userId)
    .in("session_id", ids);

  if (ledgerError)
    throw new Error(`회차 원장 조회 실패: ${ledgerError.message}`);

  const chargedIds = new Set((ledgerRows || []).map((row) => row.session_id));
  return rows.find((row) => !chargedIds.has(row.id)) || null;
}

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET 또는 POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "세션 처리에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/session",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);
    // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
    const serviceConfig = SERVICE_CONFIGS[SERVICE_KEY]!;

    // ── 이용권 재판정. §8.6 공통 규약 — 클라이언트 가드 통과 여부를 신뢰하지 않는다.
    const { allowed: hasAccess, reason: accessReason } =
      await hasPaidServiceAccess(supabaseAdmin, userId, serviceConfig);
    if (!hasAccess) {
      return fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
        tenantReasonExtra(accessReason),
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // GET — 재개 분기 판정표(§5.4 `3754:5028`, 2370행) 재료 조회. §8.6 표에는 없는
    // 추가분이다(형제 라우트 `submission.js` GET과 같은 판단 — 세션 리소스를 다루는
    // 파일에 같이 둔다, 새 엔드포인트를 만들지 않는다).
    //   `?sessionId=…` → 200 { session, topics, round, maxRounds }
    //   `topics`는 **최신 라운드 3건뿐**이다(`recommend-topics.js` 저장 단위와 동일) —
    //   재개 화면은 "지금 보여줄 카드"만 필요하고, 지난 라운드까지 합치면 §5.10의
    //   "재추천은 교체다" 판단과 화면이 어긋난다.
    //   ⓐ/ⓑ/ⓒ 분기는 클라이언트가 `session.selectedTopicId`·`topics.length`로 가른다
    //   (이 파일은 판정하지 않고 재료만 준다 — §8.3 "판정은 서버 소유"는 스키마 판정류
    //   얘기이고, 여기 분기는 순수 존재 여부라 클라이언트에서 갈라도 위조 여지가 없다).
    // ─────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const sessionId =
        typeof req.query?.sessionId === "string"
          ? req.query.sessionId.trim()
          : "";
      if (!UUID_RE.test(sessionId)) {
        return fail(
          res,
          400,
          "INVALID_SESSION_ID",
          "sessionId가 올바르지 않습니다.",
        );
      }

      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from("performance_sessions")
        .select(GET_SESSION_COLUMNS)
        .eq("id", sessionId)
        .eq("profile_id", userId)
        .maybeSingle();

      if (sessionError)
        throw new Error(`세션 조회 실패: ${sessionError.message}`);
      if (!sessionData) {
        return fail(res, 403, "NOT_SESSION_OWNER", "세션을 찾을 수 없습니다.");
      }

      const sessionRow = sessionData as unknown as SessionRow;

      const { data: topicRows, error: topicsError } = await supabaseAdmin
        .from("performance_topics")
        .select("id,round,idx,title,subtitle,tags,detail,selected")
        .eq("session_id", sessionRow.id)
        .order("round", { ascending: true })
        .order("idx", { ascending: true });

      if (topicsError)
        throw new Error(`주제 조회 실패: ${topicsError.message}`);

      const allTopics: TopicRow[] = topicRows || [];
      const lastRound = allTopics.reduce(
        (max, row) => Math.max(max, Number(row.round) || 0),
        0,
      );
      const latestRoundTopics = allTopics
        .filter((row) => Number(row.round) === lastRound)
        .map(toClientTopic);

      // 확정 주제 제목 — 최신 라운드에 있으면 그대로 쓰고, 옛 라운드의 주제를 확정한
      // 경우(재추천 뒤 이전 라운드 주제를 골랐을 리는 없지만 방어적으로)에만 추가 조회한다.
      let selectedTopicTitle: string | null = null;
      if (sessionRow.selected_topic_id) {
        const inLatest = latestRoundTopics.find(
          (topic) => topic.id === sessionRow.selected_topic_id,
        );
        if (inLatest) {
          selectedTopicTitle = inLatest.title;
        } else {
          const { data: topicRow, error: topicRowError } = await supabaseAdmin
            .from("performance_topics")
            .select("title")
            .eq("id", sessionRow.selected_topic_id)
            .maybeSingle();
          if (topicRowError)
            throw new Error(`확정 주제 조회 실패: ${topicRowError.message}`);
          selectedTopicTitle = topicRow?.title || null;
        }
      }

      res.status(200).json({
        session: {
          ...toClientSession(sessionRow),
          guideInputMode: sessionRow.guide_input_mode,
          selectedTopicId: sessionRow.selected_topic_id || null,
          selectedTopicTitle,
        },
        topics: latestRoundTopics,
        round: lastRound,
        maxRounds: MAX_ROUNDS,
      });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = body.action;
    if (action !== "create" && action !== "resume") {
      return fail(
        res,
        400,
        "INVALID_ACTION",
        "action은 'create' 또는 'resume'이어야 합니다.",
      );
    }

    let basicInfo: BasicInfoColumns | null = null;
    if (body.basicInfo !== undefined && body.basicInfo !== null) {
      const result = normalizeBasicInfo(body.basicInfo);
      if (result.ok === false) {
        if (result.code === "MISSING_FIELD") {
          return fail(
            res,
            400,
            "MISSING_FIELD",
            `${result.field}은(는) 필수입니다.`,
            {
              field: result.field,
            },
          );
        }
        return fail(
          res,
          400,
          "INVALID_BASIC_INFO",
          "basicInfo 형식이 올바르지 않습니다.",
        );
      }
      basicInfo = result.columns;
    }

    // ── 회차 스냅샷. 세션 생성/재개는 차감하지 않으므로(§9.3) 안내용으로만 싣는다.
    let quota = await readQuotaSnapshot(supabaseAdmin, userId, null);
    try {
      quota = await readQuotaSnapshot(
        supabaseAdmin,
        userId,
        await findProgramAccessRow(supabaseAdmin, userId, serviceConfig),
      );
    } catch (quotaError) {
      console.error("performance/session quota lookup 실패(무시):", quotaError);
    }

    const unchargedSession = await findUnchargedSession(supabaseAdmin, userId);

    if (action === "create") {
      // §9.3 「미차감 세션 동시 1개 제한」 — §8.6이 이 엔드포인트 자신의 실패 코드로
      // 문서화했으므로 여기서 막는다(차감 로직 자체는 건드리지 않는다, 파일 상단 주석).
      if (unchargedSession) {
        return fail(
          res,
          409,
          "UNCHARGED_SESSION_EXISTS",
          "이미 진행 중인 미차감 세션이 있습니다. 이어서 진행하거나 폐기한 뒤 다시 시작해 주세요.",
          { sessionId: unchargedSession.id },
        );
      }

      // school_type — 요청 바디를 절대 읽지 않는다. profiles 스냅샷만 신뢰한다(Q61-ⓔ).
      const { data: profileRow, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("school_type")
        .eq("id", userId)
        .maybeSingle();

      if (profileError)
        throw new Error(`프로필 조회 실패: ${profileError.message}`);

      const insertRow: Record<string, unknown> = {
        profile_id: userId,
        school_type: profileRow?.school_type || null,
        status: basicInfo ? "in_progress" : "draft",
        current_step: basicInfo ? 2 : 1,
        completed_steps: basicInfo ? [1] : [],
      };
      if (basicInfo) Object.assign(insertRow, basicInfo);

      const { data: created, error: insertError } = await supabaseAdmin
        .from("performance_sessions")
        .insert(insertRow)
        .select(SESSION_COLUMNS)
        .single();

      if (insertError)
        throw new Error(`세션 생성 실패: ${insertError.message}`);

      res.status(201).json({
        session: toClientSession(created as unknown as SessionRow),
        quotaRemaining: quota.quotaRemaining,
      });
      return;
    }

    // action === 'resume' — 프로필당 하나뿐인 미차감 세션을 이어받는다(sessionId를
    // 요청에서 받지 않는다, 파일 상단 주석).
    if (!unchargedSession) {
      return fail(
        res,
        404,
        "NO_UNCHARGED_SESSION",
        "이어받을 미차감 세션이 없습니다.",
      );
    }

    let resultRow: SessionRow = unchargedSession;

    if (basicInfo) {
      const completed = new Set(
        Array.isArray(unchargedSession.completed_steps)
          ? unchargedSession.completed_steps
          : [],
      );
      completed.add(1);

      const patch = {
        ...basicInfo,
        status:
          unchargedSession.status === "draft"
            ? "in_progress"
            : unchargedSession.status,
        // 이미 더 앞서 있는 세션을 되돌리지 않는다 — STEP1을 다시 제출해도 최소 2까지만 올린다.
        current_step: Math.max(unchargedSession.current_step || 1, 2),
        completed_steps: Array.from(completed).sort((a, b) => a - b),
      };

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("performance_sessions")
        .update(patch)
        .eq("id", unchargedSession.id)
        .select(SESSION_COLUMNS)
        .single();

      if (updateError)
        throw new Error(`세션 갱신 실패: ${updateError.message}`);
      resultRow = updated as unknown as SessionRow;
    }

    res.status(201).json({
      session: toClientSession(resultRow),
      quotaRemaining: quota.quotaRemaining,
    });
  },
});

// 실행 시간: 모델을 부르지 않으므로 형제 라우트의 `maxDuration: 60`이 필요 없다.
export const config = { runtime: "nodejs" };
