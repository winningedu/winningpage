// 알림톡 발송 + 로그 기록 — 모든 발송 지점이 거쳐야 하는 단일 통로.
//
// aligo.ts 의 sendTemplateMessage 는 "보내는 일"만 한다. 여기서 그 앞뒤를 감싼다:
//   1) 중복 발송 차단 (dedupe_key)
//   2) 발송
//   3) 성공·실패 모두 alimtalk_send_logs 에 기록
//
// 왜 발송 지점마다 직접 짜지 않는가
//   크론 3종(일간·주간·월간) + 가입 이벤트 1종이 각자 로그를 남기면, 실패
//   처리나 중복 방지 규칙이 네 군데로 흩어져 곧 어긋난다. 특히 중복 방지는
//   빠뜨려도 평소엔 티가 안 나고 크론이 두 번 뜨는 날에만 터진다.
//
// 실패해도 던지지 않는다
//   호출부는 대부분 크론이고, 한 사람 발송이 실패했다고 나머지 수백 명이
//   멈추면 안 된다. 실패는 결과 객체로 돌려주고 로그에 남긴다 — 호출부는
//   집계만 하면 된다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getChannel, isDryRun, sendTemplateMessage } from "./aligo.js";
import type { AlimtalkTemplateKey } from "./alimtalkTemplates.js";

export type AlimtalkSendOutcome =
  | { status: "sent"; logId: number | null }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: "duplicate" | "no_phone" };

export async function sendAndLog({
  supabaseAdmin,
  templateKey,
  phone,
  profileId,
  variables,
  dedupeKey,
  meta = {},
}: {
  supabaseAdmin: SupabaseClient;
  templateKey: AlimtalkTemplateKey;
  phone: string | null | undefined;
  profileId: string | null;
  variables: Record<string, string>;
  /**
   * 같은 알림이 두 번 나가지 않게 하는 열쇠. 예: `dailyReport:<profileId>:2026-08-22`.
   * null 이면 중복 검사를 하지 않는다(수동 재발송 등).
   */
  dedupeKey?: string | null;
  meta?: Record<string, unknown>;
}): Promise<AlimtalkSendOutcome> {
  const to = String(phone || "").replace(/[^0-9]/g, "");
  if (!to) {
    return { status: "skipped", reason: "no_phone" };
  }

  // 1) 중복 차단 — 유니크 인덱스가 최종 방어선이지만, 먼저 조회해서 불필요한
  //    벤더 호출(=과금)을 막는다. 경합으로 둘이 동시에 통과해도 아래 insert 가
  //    23505 로 튕기므로 로그는 하나만 남는다.
  if (dedupeKey) {
    const { data: existing } = await supabaseAdmin
      .from("alimtalk_send_logs")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (existing) {
      return { status: "skipped", reason: "duplicate" };
    }
  }

  // 2) 발송. 변수 누락(템플릿의 v() 가 던진다)이나 환경변수 누락도 여기서
  //    잡아 실패 로그로 남긴다 — 던져서 크론 전체를 죽이지 않는다.
  let result: Awaited<ReturnType<typeof sendTemplateMessage>> | null = null;
  let thrown: string | null = null;

  try {
    result = await sendTemplateMessage({ phone: to, templateKey, variables });
  } catch (error) {
    thrown = (error as Error).message;
  }

  const ok = Boolean(result?.ok);

  // 3) 기록. 로그 실패가 발송 결과를 뒤집지는 않는다(이미 나갔다).
  const { data: inserted, error: logError } = await supabaseAdmin
    .from("alimtalk_send_logs")
    .insert({
      template_key: templateKey,
      channel: result?.channel || (isDryRun() ? "dry-run" : getChannel()),
      profile_id: profileId,
      phone: to,
      subject: result?.subject || templateKey,
      // 발송 자체가 실패해 본문이 없으면 사유를 본문 자리에 남긴다 — 나중에
      // "왜 안 갔나"를 이 표 하나로 답할 수 있어야 한다.
      message: result?.message || `(발송 실패) ${thrown || "알 수 없는 오류"}`,
      status: ok ? "sent" : "failed",
      provider_code: result ? String(result.providerCode) : null,
      provider_message: result?.providerMessage || thrown || null,
      provider_msg_id: result?.messageId || null,
      dedupe_key: dedupeKey || null,
      meta,
    })
    .select("id")
    .maybeSingle();

  if (logError) {
    // 23505 = 위 조회를 통과한 뒤 다른 실행이 먼저 insert 한 경우다. 발송은
    // 이미 나갔으므로 성공으로 보고하되, 로그가 중복이라는 사실은 남긴다.
    console.error(
      `[alimtalk] 로그 기록 실패 template=${templateKey} code=${logError.code}: ${logError.message}`,
    );
  }

  if (!ok) {
    return {
      status: "failed",
      reason: thrown || result?.providerMessage || "발송 실패",
    };
  }

  return { status: "sent", logId: (inserted?.id as number) ?? null };
}
