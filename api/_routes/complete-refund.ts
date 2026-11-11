// Vercel 서버리스 함수: 환불 완료 처리(어드민 전용)
//
// 왜 필요한가
//   기존에는 어드민이 fn_complete_refund RPC를 직접 불렀다(src/pages/Admin.tsx).
//   그 함수는 refund_requests.status='completed' 로 찍고 이용 권한을
//   회수할 뿐, **돈을 실제로 돌려주는 토스 API 호출이 어디에도 없었다** —
//   카드는 부분취소를 걸지 않고, 가상계좌·계좌이체는 계좌 정보 자체가 없어
//   환급할 방법이 없었다(qa-payment 환불 흐름 점검 보고, 2026-08-22).
//   이 라우트가 그 갭을 메운다: **토스 결제취소가 성공해야만** DB를
//   완료로 바꾼다 — 돈이 안 돌아갔는데 완료로 찍히는 사고를 구조적으로 막는다.
//
// 흐름
//   1) 어드민 판정(resolveAdmin — is_admin() JS 미러).
//   2) refund_requests + orders 를 service role 로 읽는다(어드민은 남의
//      주문도 봐야 하므로 RLS 우회가 필요하다).
//   3) 상태 선검사 — approval_status='approved', status in
//      (requested, processing) 가 아니면 토스를 부르기 전에 막는다(돈이
//      움직인 뒤 fn_complete_refund 가 거부하는 사고를 사전에 차단).
//   4) 토스 결제 조회(GET /v1/payments/{paymentKey})로 **이 환불 건 금액과
//      같은 취소가 이미 있는지** 확인한다 — 있으면(재클릭·네트워크 재시도)
//      새 취소 호출 없이 그 결과를 그대로 쓴다(멱등).
//   5) 없으면 POST 취소(Idempotency-Key = refund_requests.id 고정값, 토스
//      공식 15일 유효). 가상계좌 결제는 refundReceiveAccount(은행 코드·
//      계좌번호·예금주)를 함께 보낸다 — refund_requests.refund_bank 등
//      3필드가 정본이다(RefundRequestModal/RefundApprovalModal이 채운다).
//   6) 취소 응답 원본을 refund_requests.toss_cancel 에 저장한다(증빙,
//      fn_complete_refund 는 이 컬럼을 보지 않는다).
//   7) fn_complete_refund RPC 호출 — **어드민 본인의 세션 토큰으로** 부른다
//      (service role 아님). fn_complete_refund 내부의 is_admin() 은
//      auth.uid() 를 읽는데, service role 요청에는 auth.uid() 가 없어(항상
//      NULL) 이 함수가 무조건 42501 로 거부한다. 토스 취소는 이미 service
//      role 로 끝냈으니, 상태 전이 RPC만 어드민 본인 토큰으로 재호출해
//      DB 함수의 is_admin() 게이트를 그대로 살린다(기존 Admin.tsx가 브라우저
//      세션으로 부르던 것과 동일한 인증 경로).
//
// 실패 시 DB를 건드리지 않는다(토스 4xx/5xx를 그대로 반환) — 단, 이미 취소가
// 끝난 뒤 fn_complete_refund 만 실패하면(예: WC039 재견적 가드) 돈은 이미
// 돌아갔지만 DB는 아직 완료가 아니다. 이 경우 어드민이 같은 버튼을 다시
// 누르면 4)단계가 기취소를 찾아 토스 재호출 없이 7)단계만 재시도된다 —
// 그래서 별도 보정 절차 없이 재클릭이 곧 복구 경로다.
//
// 필요 환경변수: TOSS_SECRET_KEY(api/_routes/confirm-payment.ts와 동일), Supabase
// URL/서비스롤 키(api/_lib/supabaseAdmin.js), anon 키(VITE_SUPABASE_ANON_KEY —
// 7)단계에서 어드민 토큰을 실어 보내는 클라이언트 생성용).

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Json } from "../../src/types/database.types.js";
import { getBearerToken, resolveAdmin } from "../_lib/adminAuth.js";
import { createSupabaseAdmin, getEnv } from "../_lib/supabaseAdmin.js";

const TOSS_PAYMENT_QUERY_URL = "https://api.tosspayments.com/v1/payments";
const TOSS_CANCEL_PATH_SUFFIX = "cancel";

type TossCancelEntry = {
  cancelAmount?: number;
  cancelReason?: string;
  [key: string]: unknown;
};

type TossPaymentQueryResponse = {
  cancels?: TossCancelEntry[] | null;
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type RefundReceiveAccount = {
  bank: string;
  accountNumber: string;
  holderName: string;
};

export type TossCancelRequestBody = {
  cancelReason: string;
  cancelAmount: number;
  refundReceiveAccount?: RefundReceiveAccount;
};

function clean(value: unknown): string {
  return String(value || "").trim();
}

// 토스 결제취소 API의 refundReceiveAccount.accountNumber 제약(공식 문서:
// 숫자만, 최대 20자). RefundAccountFields.tsx가 프런트 입력 단계에서 이미
// 정규화하지만, 여기서도 방어적으로 한 번 더 거른다 — DB에 하이픈 섞인
// 레거시 값이 남아 있거나 프런트를 거치지 않고 RPC를 직접 호출한 경우까지
// 대비하는 이중 안전망이다.
const ACCOUNT_NUMBER_MAX_LENGTH = 20;

export function normalizeAccountNumber(value: unknown): string {
  return String(value || "")
    .replace(/[^0-9]/g, "")
    .slice(0, ACCOUNT_NUMBER_MAX_LENGTH);
}

/**
 * orders.raw 에 virtualAccount 키가 실제로 있는지 본다(toss 응답 원본).
 * 값이 아예 없거나(키 부재) jsonb null 이면 카드/간편결제/계좌이체로 본다.
 */
export function isVirtualAccountPayment(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw) return false;
  const value = raw.virtualAccount;
  return value !== null && value !== undefined;
}

/**
 * cancelReason 에 실어 보내는 refund_request 식별 태그. buildCancelRequestBody
 * 와 findMatchingCancel 이 같은 포맷을 공유해야 매칭이 성립한다.
 */
function refundRequestTag(refundRequestId: string | number): string {
  return `[rr:${refundRequestId}]`;
}

/**
 * 토스 결제 조회(GET) 응답의 cancels 배열에서 이 환불 건의 취소를 찾는다.
 *
 * 1순위: cancelReason 에 이 환불 건 태그(`[rr:<id>]`)가 붙은 항목 — 있으면
 * 금액과 무관하게 그것이 정본이다(같은 주문·같은 금액의 부분환불이 여러 건
 * 있어도 태그로 정확히 구분된다. 과거에는 금액만 봐서 남의 취소를 자기
 * 것으로 오판할 수 있었다 — 이제는 태그가 그 오판을 막는다).
 * 2순위(하위 호환): 태그가 아예 없는 레거시 취소(태그 도입 이전에 걸린
 * 것) 중 금액이 일치하는 항목. 단, **다른** refund_request 의 태그가 붙은
 * 항목은 이 폴백에서 제외한다 — 태그가 있는데 내 것이 아니면 명백히 남의
 * 취소이기 때문이다.
 */
export function findMatchingCancel(
  cancels: TossCancelEntry[] | null | undefined,
  amount: number,
  refundRequestId: string | number,
): TossCancelEntry | null {
  if (!Array.isArray(cancels)) return null;

  const myTag = refundRequestTag(refundRequestId);
  const tagged = cancels.find(
    (entry) =>
      typeof entry?.cancelReason === "string" &&
      entry.cancelReason.includes(myTag),
  );
  if (tagged) return tagged;

  const untaggedOrMine = cancels.filter((entry) => {
    const reason =
      typeof entry?.cancelReason === "string" ? entry.cancelReason : "";
    return !reason.includes("[rr:");
  });

  return (
    untaggedOrMine.find(
      (entry) => Number(entry?.cancelAmount) === Number(amount),
    ) ?? null
  );
}

// 토스 cancelReason 필드 길이 제약(공식 문서: 최대 200자).
const CANCEL_REASON_MAX_LENGTH = 200;

/**
 * 토스 결제취소 API 요청 바디를 구성한다. cancelReason 앞에 이 환불 건의
 * refund_request 식별 태그(`[rr:<id>]`)를 붙인다 — findMatchingCancel 이
 * 이 태그로 "같은 주문·같은 금액의 다른 부분환불"과 정확히 구분한다.
 * 태그가 항상 맨 앞이라 200자 제한으로 자르더라도 태그는 보존된다.
 * 가상계좌 결제가 아니면 refundReceiveAccount 를 아예 넣지 않는다(카드·
 * 계좌이체·간편결제는 이 필드를 받지 않는다). 가상계좌인데 은행/계좌번호/
 * 예금주 중 하나라도 비어 있으면 refundReceiveAccount 를 채우지 않는다 —
 * 호출부가 그 경우 토스를 부르기 전에 422 로 막아야 한다(값을 지어내지
 * 않는다).
 */
export function buildCancelRequestBody(params: {
  cancelReason: string;
  cancelAmount: number;
  isVirtualAccount: boolean;
  refundRequestId: string | number;
  refundBank?: string | null;
  refundAccount?: string | null;
  refundHolder?: string | null;
}): TossCancelRequestBody {
  const taggedReason =
    `${refundRequestTag(params.refundRequestId)} ${params.cancelReason}`.slice(
      0,
      CANCEL_REASON_MAX_LENGTH,
    );
  const body: TossCancelRequestBody = {
    cancelReason: taggedReason,
    cancelAmount: params.cancelAmount,
  };

  if (!params.isVirtualAccount) return body;

  const bank = clean(params.refundBank);
  const accountNumber = normalizeAccountNumber(params.refundAccount);
  const holderName = clean(params.refundHolder);
  if (!bank || !accountNumber || !holderName) return body;

  body.refundReceiveAccount = { bank, accountNumber, holderName };
  return body;
}

/**
 * 재클릭·네트워크 재시도가 같은 취소를 중복 실행하지 않도록 refund_request
 * id 하나로 고정한 Idempotency-Key. 토스 공식 문서 기준 키는 15일간
 * 유효하다 — 그 안의 재시도는 첫 요청과 동일하게 처리된다.
 */
export function buildIdempotencyKey(refundRequestId: string | number): string {
  return `refund-request-${refundRequestId}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const admin = await resolveAdmin(
    supabaseAdmin,
    req as { headers: Record<string, string> },
  );
  if (!admin.ok) {
    return res.status(admin.status).json({
      error: admin.detail,
      ...(admin.code && { code: admin.code, detail: admin.detail }),
    });
  }

  const refundRequestId = req.body?.refundRequestId;
  if (!refundRequestId) {
    return res.status(400).json({ error: "refundRequestId 가 필요합니다." });
  }

  const { data: refundRequest, error: refundError } = await supabaseAdmin
    .from("refund_requests")
    .select(
      "id, order_id, amount, reason, status, approval_status, refund_bank, refund_account, refund_holder",
    )
    .eq("id", refundRequestId)
    .maybeSingle();

  if (refundError || !refundRequest) {
    return res.status(404).json({ error: "환불 신청을 찾을 수 없습니다." });
  }

  // 이미 완료된 건의 재호출은 순수 성공 응답으로 흡수한다 — 토스도 다시
  // 부르지 않고 fn_complete_refund 도 다시 시도하지 않는다(재시도 안전).
  if (refundRequest.status === "completed") {
    return res.status(200).json({ ok: true, alreadyCompleted: true });
  }

  // fn_complete_refund 가 곧 다시 볼 조건이지만, 토스를 부르기 **전에** 미리
  // 걸러야 한다 — 안 그러면 "승인 안 된 신청인데 돈만 취소되고 DB는 완료로
  //못 바뀌는" 사고가 난다(위 파일 상단 주석 3)단계).
  if (refundRequest.approval_status !== "approved") {
    return res
      .status(409)
      .json({ error: "아직 승인되지 않은 환불 신청입니다.", code: "WC035" });
  }
  if (!["requested", "processing"].includes(refundRequest.status)) {
    return res.status(409).json({
      error: "지금 상태에서는 환불 완료 처리를 할 수 없습니다.",
      code: "WC036",
    });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, payment_key, raw")
    .eq("id", refundRequest.order_id)
    .maybeSingle();

  if (orderError || !order) {
    return res.status(404).json({ error: "주문을 찾을 수 없습니다." });
  }

  const paymentKey = clean(order.payment_key);
  if (!paymentKey) {
    return res.status(409).json({
      error: "결제 승인 키가 없어 토스 결제취소를 진행할 수 없습니다.",
    });
  }

  const secretKey = getEnv("TOSS_SECRET_KEY");
  if (!secretKey) {
    return res
      .status(500)
      .json({ error: "서버에 TOSS_SECRET_KEY 가 설정되지 않았습니다." });
  }
  const auth = Buffer.from(`${secretKey}:`).toString("base64");

  const raw = (order.raw || {}) as Record<string, unknown>;
  const isVirtualAccount = isVirtualAccountPayment(raw);
  const cancelAmount = Number(refundRequest.amount);

  // 4) 기취소 확인 — 이 환불 건 금액의 취소가 이미 있으면 토스 호출을 생략한다.
  const queryRes = await fetch(
    `${TOSS_PAYMENT_QUERY_URL}/${encodeURIComponent(paymentKey)}`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  const queried: TossPaymentQueryResponse = await queryRes.json();

  if (!queryRes.ok) {
    return res.status(502).json({
      error: queried?.message || "토스 결제 조회에 실패했습니다.",
      code: queried?.code,
    });
  }

  let cancelResult: TossCancelEntry | Record<string, unknown> | null =
    findMatchingCancel(queried.cancels, cancelAmount, refundRequest.id);

  if (!cancelResult) {
    // 5) 새 취소 요청.
    if (
      isVirtualAccount &&
      !(
        clean(refundRequest.refund_bank) &&
        clean(refundRequest.refund_account) &&
        clean(refundRequest.refund_holder)
      )
    ) {
      return res.status(422).json({
        error:
          "가상계좌 환불에는 환불계좌(은행/계좌번호/예금주) 정보가 필요합니다.",
      });
    }

    const cancelBody = buildCancelRequestBody({
      cancelReason: refundRequest.reason || "고객 요청",
      cancelAmount,
      isVirtualAccount,
      refundRequestId: refundRequest.id,
      refundBank: refundRequest.refund_bank,
      refundAccount: refundRequest.refund_account,
      refundHolder: refundRequest.refund_holder,
    });

    const cancelRes = await fetch(
      `${TOSS_PAYMENT_QUERY_URL}/${encodeURIComponent(paymentKey)}/${TOSS_CANCEL_PATH_SUFFIX}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          "Idempotency-Key": buildIdempotencyKey(refundRequest.id),
        },
        body: JSON.stringify(cancelBody),
      },
    );
    const cancelData: TossPaymentQueryResponse = await cancelRes.json();

    if (!cancelRes.ok) {
      // 돈이 안 움직였다 — DB를 건드리지 않고 토스 에러를 그대로 올린다.
      console.error("토스 결제취소 실패:", refundRequestId, cancelData);
      return res.status(cancelRes.status).json({
        error: cancelData?.message || "토스 결제취소에 실패했습니다.",
        code: cancelData?.code,
      });
    }

    cancelResult =
      findMatchingCancel(cancelData.cancels, cancelAmount, refundRequest.id) ||
      cancelData;
  }

  // 6) 증빙 저장 — 재클릭으로 기취소를 찾은 경우도 다시 저장해 둔다(첫 시도가
  // 여기 도달하기 전에 끊겼을 수 있다).
  const { error: cancelSaveError } = await supabaseAdmin
    .from("refund_requests")
    // cancelResult는 토스 취소 응답(TossCancelEntry, [key: string]: unknown)
    // 또는 그 파생 Record다 — 벤더 JSON 원본이라 실제 값은 항상 JSON-safe지만
    // 로컬 타입의 인덱스 시그니처가 unknown이라 Json과 구조적으로 안 맞는다.
    .update({ toss_cancel: cancelResult as Json })
    .eq("id", refundRequestId);
  if (cancelSaveError) {
    // 저장 실패는 완료 처리를 막지 않는다 — 증빙은 부가 정보이고, 정본은
    // 토스 콘솔에 이미 남아 있다. 로그만 남긴다.
    console.error(
      "refund_requests.toss_cancel 저장 실패(계속 진행):",
      refundRequestId,
      cancelSaveError,
    );
  }

  // 7) 상태 전이 — 어드민 본인 토큰으로 호출해 fn_complete_refund 내부의
  // is_admin()(auth.uid() 기반)을 satisfy 한다(위 파일 상단 주석 참고).
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
  const supabaseUrl = getEnv(
    "WINNING_SUPABASE_URL",
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
  );
  const adminToken = getBearerToken(req as { headers: Record<string, string> });
  const supabaseAsAdmin = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${adminToken}` } },
  });

  const { data: completeResult, error: completeError } =
    await supabaseAsAdmin.rpc("fn_complete_refund", {
      p_refund_request_id: refundRequestId,
      p_admin_memo: null,
    });

  if (completeError) {
    // 토스 취소는 이미 성공했다 — 재클릭하면 4)단계가 기취소를 찾아 이
    // 7)단계만 재시도된다(위 파일 상단 주석의 복구 경로).
    console.error(
      "토스 취소 성공, fn_complete_refund 실패:",
      refundRequestId,
      completeError,
    );
    return res.status(409).json({
      error: completeError.message,
      code: completeError.code,
    });
  }

  return res.status(200).json({ ok: true, refund: completeResult });
}
