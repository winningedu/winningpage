// ---------------------------------------------------------------------------
// 개인정보 반출 게이트의 검증·적재 경로 (QA 268·270·228·223·271·269).
//
// 요구: 다운로드·마스킹 해제 앞에 **관리자 비밀번호 재확인 + 사유 필수 기재**를
// 세우고 그 사실을 남긴다. 화면(SensitiveActionGate)은 모달만 그리고, 실제
// 판정과 적재는 여기 두 함수가 진다 — 브라우저 없이 검증할 수 있어야 하는
// 부분이라 UI 에서 떼어냈다.
//
// ⚠️ 비밀번호 확인은 세션의 **auth 이메일**로 한다. profiles.email 은 미러라
//    비밀번호·이메일 변경 직후 원본과 어긋날 수 있고, 그걸 인증에 썼다가
//    깨진 전례가 있다.
// ---------------------------------------------------------------------------

import type { AccessLogWriteInput } from "../../shared/access-log/contract.js";
import { ApiError, api } from "./http/client";
import { supabase } from "./supabase";

export type AdminAccessAction = "download" | "unmask";

/**
 * 이 파일이 실제로 부르는 부분만 추린 클라이언트 모양.
 *
 * 왜 이렇게 좁히나 — 검증·적재 규칙(빈 사유 거부, 세션 이메일 사용, 적재 실패 시
 * 중단)은 브라우저 없이 확인할 수 있어야 하는데, 이 저장소에는 모듈 모킹
 * (vi.mock) 을 쓰는 테스트가 하나도 없다. 관례를 깨는 대신 주입 구멍을 열어
 * 테스트가 가짜 클라이언트를 넘기게 한다. 실사용 호출부는 인자를 생략한다.
 */
export type AdminAccessLogClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id?: string; email?: string } | null };
      error: unknown;
    }>;
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<{ error: unknown }>;
  };
};

const defaultClient = () => supabase as unknown as AdminAccessLogClient;

export type AdminAccessLogEntry = {
  action: AdminAccessAction;
  /** ADMIN_SECTION_KEYS 와 같은 메뉴 키. */
  resourceKey: string;
  reason: string;
  /** 다운로드에 실제로 포함된 행 수. unmask 에서는 넘기지 않는다. */
  rowCount?: number | undefined;
  /** 마스킹 해제 대상 회원 id. download 에서는 넘기지 않는다. */
  targetId?: string | undefined;
};

export type GateResult = { ok: true } | { ok: false; message: string };

/**
 * 로그인 비밀번호 재확인.
 *
 * signInWithPassword 는 성공하면 **새 세션을 발급한다** — 화면은 그대로지만
 * 기존 access/refresh 토큰은 교체된다. 재인증 전용 API(reauthenticate)는 메일로
 * nonce 를 보내는 물건이라 이 용도에 맞지 않아 이 방식을 택했다.
 */
export async function verifyAdminPassword(
  password: string,
  client: AdminAccessLogClient = defaultClient(),
): Promise<GateResult> {
  if (!password) return { ok: false, message: "비밀번호를 입력하세요." };

  const { data, error: userError } = await client.auth.getUser();
  const email = data?.user?.email;

  if (userError || !email) {
    return {
      ok: false,
      message: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.",
    };
  }

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { ok: false, message: "비밀번호가 일치하지 않습니다." };

  return { ok: true };
}

/**
 * 원장 적재. 실패하면 호출부는 **실제 동작을 진행하지 않는다**(fail-closed) —
 * 남기지 못한 반출은 요구를 만족하지 못하므로 여는 쪽이 아니라 막는 쪽으로
 * 기운다.
 */
export async function writeAdminAccessLog(
  entry: AdminAccessLogEntry,
): Promise<GateResult> {
  const reason = entry.reason.trim();
  if (!reason) return { ok: false, message: "사유를 입력하세요." };

  try {
    // 본인 id 와 이메일은 서버가 토큰에서 채운다. 보내지 않는다.
    const body: AccessLogWriteInput = {
      action: entry.action,
      resourceKey: entry.resourceKey,
      reason,
      ...(entry.rowCount !== undefined ? { rowCount: entry.rowCount } : {}),
      ...(entry.targetId !== undefined ? { targetId: entry.targetId } : {}),
    };
    await api.post("admin/access-logs", { json: body });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return {
        ok: false,
        message: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.",
      };
    }
    console.error("개인정보 접근 로그 적재 실패", error);
    return {
      ok: false,
      message: "접근 기록을 남기지 못해 중단했습니다. 잠시 후 다시 시도하세요.",
    };
  }

  return { ok: true };
}
