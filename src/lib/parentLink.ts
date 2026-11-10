// 학부모-자녀 연결 API. mockApi.js의 findChildByLinkCode/connectChild를 대체한다.
//
// 두 단계로 나뉘는 이유
//   미리보기(lookupChild)는 서버 전용 조회 이력 테이블에 한도를 걸어야 해서 Vercel
//   함수(api/lookup-child.js)로 나가고, 실제 연결 요청(requestParentLink)은 DB만
//   만지므로 RPC로 바로 간다.
//
// 연결은 코드 입력 즉시 확정된다
//   request_parent_link는 status='approved'인 행을 바로 만든다(2026-08-18
//   결정 — 별도 학생 승인 단계 없음). 사후 정정은 revoke만 가능하다.
//
// ⚠️ lookupChild는 로그인이 필요하다
//   조회 결과에 미성년자의 이름과 학교가 들어가서 익명 호출을 막아뒀다
//   (api/lookup-child.js 주석). 그래서 학부모 가입 직후 세션을 유지해야 한다 —
//   가입 후 signOut 하면 이 화면에서 not_authenticated로 떨어진다.

import { apiFetch, getAuthHeader } from "./apiFetch";
import { QA_ACCOUNT_MESSAGE } from "./qaAccount";
import { supabase } from "./supabase";

// 서버가 발급하는 코드 알파벳. 헷갈리는 0·1·I·L·O를 뺀 31종이다
// (sql/40_auth_signup.sql [4] generate_link_code_string).
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 6;

/** 입력값을 코드 형태로 다듬는다. 대문자 영숫자만 남기고 6자로 자른다. */
export function normalizeLinkCode(raw: unknown) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

/**
 * 코드에 쓰이지 않는 글자가 섞였는지 본다.
 *
 * 그냥 두면 "일치하는 코드가 없다"고만 나와서, 0과 O를 잘못 읽은 사용자가
 * 무엇을 고쳐야 할지 알 수 없다. 조회를 보내기 전에 짚어준다.
 */
export function findImpossibleChars(code: unknown) {
  return [
    ...new Set(
      [...normalizeLinkCode(code)].filter((ch) => !CODE_ALPHABET.includes(ch)),
    ),
  ];
}

const MESSAGES: Record<string, string> = {
  not_authenticated: "로그인이 필요합니다. 다시 로그인해 주세요.",
  not_a_parent: "학부모 회원만 이용할 수 있습니다.",
  invalid_code_format: "연결코드 6자리를 정확히 입력해 주세요.",
  link_code_not_found: "일치하는 연결코드를 찾을 수 없습니다",
  cannot_link_self: "본인의 연결코드는 사용할 수 없습니다.",
  student_already_linked: "이미 다른 보호자와 연결된 학생이에요.",
  link_already_requested:
    "이미 연결을 요청했어요. 자녀의 승인을 기다려 주세요.",
  too_many_lookups: "조회 횟수가 많습니다. 잠시 후 다시 시도해 주세요.",
  too_many_failed_lookups: "조회 실패가 많습니다. 잠시 후 다시 시도해 주세요.",
  network: "연결 상태를 확인한 뒤 다시 시도해 주세요.",
  unknown: "잠시 후 다시 시도해 주세요.",
};

type ParentLinkFail = { ok: false; reason: string; message: string };

/**
 * complete_signup_profile RPC(jsonb 반환)의 성공 payload 모양.
 * 생성 타입(database.types.ts)은 RPC 반환을 Json으로만 표현해 .ok/.link_code
 * 접근이 막힌다 — StudentForm/Under14Form/ParentForm/ProfileTab(reissue_link_code도
 * 같은 모양)이 호출 직후 이 타입으로 한 번 캐스트해 공유한다.
 */
export type SignupProfileRpcResult = {
  ok: boolean;
  link_code?: string | null;
};

/**
 * request_parent_link RPC(jsonb 반환)의 성공 payload 모양. 위와 같은 이유로
 * LinkChildModal.tsx도 이 타입을 공유한다.
 */
export type RequestParentLinkRpcResult = {
  ok?: boolean;
  link_id?: string | null;
  status?: string;
  student_name?: string;
};

export type LookupChildResult =
  | {
      ok: true;
      child: {
        name: string;
        school: string;
        schoolType: string;
        // 서버에 학년 컬럼이 아직 없어 항상 null이다(api/lookup-child.js 주석) — 컬럼이 생겼을 때
        // 실제 값 형태(string 라벨? number?)가 아직 정해지지 않아 any로 둔다.
        grade: any;
      };
      alreadyLinked: boolean;
    }
  | ParentLinkFail;

export type RequestParentLinkResult =
  | { ok: true; linkId: string | null; status: string; studentName: string }
  | ParentLinkFail;

function fail(reason: string, detail?: string): ParentLinkFail {
  return {
    ok: false,
    reason,
    // MESSAGES.unknown 키는 항상 정의돼 있는 최종 폴백.
    message: detail || MESSAGES[reason] || MESSAGES.unknown!,
  };
}

/**
 * 연결코드로 자녀를 미리 조회한다. 연결을 만들지는 않는다.
 */
export async function lookupChild(code: string): Promise<LookupChildResult> {
  const normalized = normalizeLinkCode(code);
  const authHeader = await getAuthHeader();

  // 토큰이 없으면 서버가 401을 줄 게 뻔하다. 한도만 축내지 않도록 미리 끊는다.
  if (!authHeader) return fail("not_authenticated");

  let response: Response;
  let payload: {
    ok?: boolean;
    reason?: string;
    detail?: string;
    child?: {
      name?: string;
      school?: string;
      school_type?: string;
      grade?: any;
    };
    already_linked?: boolean;
  };

  try {
    response = await apiFetch("/api/lookup-child", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({ code: normalized }),
    });
    payload = await response.json();
  } catch {
    return fail("network");
  }

  if (!response.ok || !payload?.ok) {
    return fail(payload?.reason || "unknown", payload?.detail);
  }

  return {
    ok: true,
    child: {
      name: payload.child?.name || "",
      school: payload.child?.school || "",
      schoolType: payload.child?.school_type || "",
      // 서버에 학년 컬럼이 아직 없어 항상 null이다(api/lookup-child.js 주석).
      grade: payload.child?.grade ?? null,
    },
    alreadyLinked: Boolean(payload.already_linked),
  };
}

/**
 * 연결코드로 자녀와 연결한다. 코드 입력 즉시 확정된다.
 */
export async function requestParentLink(
  code: string,
): Promise<RequestParentLinkResult> {
  const normalized = normalizeLinkCode(code);

  const { data, error } = await supabase.rpc("request_parent_link", {
    p_code: normalized,
  });

  if (error) {
    // RPC는 raise exception의 메시지를 그대로 올려보낸다. 우리가 정의한
    // 사유 코드면 그대로 쓰고, 아니면 원문을 감춘다(내부 오류가 새면 안 된다).
    const raw = String(error.message || "").trim();
    // QA 계정 보호(WC103)의 안내 문구는 그대로 보여 준다.
    if (raw === QA_ACCOUNT_MESSAGE) return fail("qa_restricted", raw);
    return fail(raw in MESSAGES ? raw : "unknown");
  }

  // 생성 타입은 RPC 반환을 Json으로만 표현한다 — 실제 payload 모양은
  // RequestParentLinkRpcResult(위 정의, supabase/migrations/20260821000000_baseline.sql
  // request_parent_link의 jsonb_build_object 참고).
  const result = data as unknown as RequestParentLinkRpcResult;

  return {
    ok: true,
    linkId: result?.link_id || null,
    status: result?.status || "approved",
    studentName: result?.student_name || "",
  };
}

/**
 * 학생이 결제 요청(수강신청)을 보낼 수 있는지 판정한다 — "승인된" 학부모
 * 연결이 있어야 한다(status='pending'인 요청 중 상태는 자격이 아니다).
 * StudentEnrollmentRequest.jsx(결제요청 실패 모달)의 판정 근거.
 *
 * 학생:학부모 = 1:1(제품 규칙 확정)이라 여러 건이 있어도 첫 건만 본다.
 * parent_id 를 함께 반환하는 이유 — 결제 요청 제출(fn_request_enrollment)이
 * p_parent_profile_id 인자를 요구하는데, 학생 화면은 그 값을 달리 알 방법이
 * 없다(로그인 세션엔 자기 자신의 id 뿐이다).
 *
 * RLS(parent_child_links party read, sql/40)가 이미 "본인이 당사자인 행"만
 * 열어 주므로 student_id 를 서버가 아니라 클라이언트가 넘겨도 위조 이득이
 * 없다 — 남의 student_id 를 넣어도 RLS 가 0행을 돌려준다.
 *
 * 조회 실패 시 null(= "연결 없음"으로 안전 처리) — 위조된 연결로 요청을
 * 통과시키는 것보다, 진짜 연결이 있는 사용자가 한 번 더 시도하게 만드는
 * 쪽이 안전하다(lookupChild/requestParentLink의 fail() 패턴과 달리 여기는
 * 화면이 즉시 재시도 가능한 실패 모달을 이미 갖고 있어 별도 사유 코드가
 * 필요 없다).
 */
export async function getApprovedParentLink(
  studentId: string | null | undefined,
): Promise<{ id: string; parent_id: string } | null> {
  if (!studentId) return null;

  const { data, error } = await supabase
    .from("parent_child_links")
    .select("id, parent_id")
    .eq("student_id", studentId)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("학부모 연결 조회 실패:", error.message);
    return null;
  }

  return data || null;
}
