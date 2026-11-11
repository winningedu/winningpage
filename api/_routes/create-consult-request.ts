// POST /api/create-consult-request  { name, phone, email, service, message, agree }
//
// 프리미엄 이용신청 페이지의 "상담 신청" 저장.
//
// service_role로만 접근하는 이유
//   sql/48_premium_consult.sql 은 anon/authenticated insert 정책을 열지
//   않았다 — Supabase Data API에 요청 제한이 없어 anon insert를 열면
//   스팸 유입을 DB 레이어에서 막을 수단이 없기 때문이다. 저장은 반드시
//   이 서버 함수를 거친다.
//
// 여기가 최종 방어선이다 — 클라이언트(PremiumApply.jsx) 검증은 UX용일
// 뿐 신뢰하지 않는다.

import { defineHandler } from "../_lib/handler.js";
import { assertNotQaRequester } from "../_lib/qaAccount.js";

// PremiumApply.jsx SERVICE_OPTIONS 와 글자 단위로 동일해야 한다.
// 목록 밖 값은 위조된 요청으로 보고 거절한다.
const SERVICE_OPTIONS = [
  "대입컨설팅 프로그램",
  "특목고입학 프로그램",
  "대학원입학 프로그램",
  "해외명문대 진학컨설팅",
  "국제학교 학습관리",
  "국제・해외고 국내대 입학컨설팅",
];

const NAME_MAX_LENGTH = 40;
const EMAIL_MAX_LENGTH = 100;
const MESSAGE_MAX_LENGTH = 1000;

// 정상 사용은 한 번 제출하고 끝난다. 같은 번호로 이 안에 재요청이
// 오면 중복 제출·도배로 본다.
const DUPLICATE_WINDOW_SECONDS = 60;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

// 하이픈 제거 후 숫자만 남긴 값이 9~13자리인지. 서비스 전화/국제번호까지
// 폭넓게 받되 명백히 짧거나 긴 값은 거른다.
function isValidPhoneDigits(digits: string) {
  return /^[0-9]{9,13}$/.test(digits);
}

// 형식 검증기를 새로 들이지 않고 '@' 앞뒤 존재·공백 없음만 보는
// 최소 검사다. 실제 유효성은 상담 연락 시 확인된다.
function isValidEmail(value: string) {
  return /^\S+@\S+$/.test(value);
}

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "error",
  unhandledMessage: "상담 신청 처리 중 오류가 발생했습니다.",
  logLabel: "create-consult-request",
  handler: async (req, res, ctx) => {
    // 접수된 상담은 실제 상담원이 연락한다. 토큰이 있고 QA 계정이면 접수하지 않는다.
    await assertNotQaRequester(ctx.supabaseAdmin, req);

    const body = req.body || {};

    const name = clean(body.name);
    if (!name || name.length > NAME_MAX_LENGTH) {
      return void res
        .status(400)
        .json({ error: "이름을 정확히 입력해 주세요." });
    }

    const phoneInput = clean(body.phone);
    if (!phoneInput || !/^[0-9-]+$/.test(phoneInput)) {
      return void res
        .status(400)
        .json({ error: "휴대폰 번호 형식이 올바르지 않습니다." });
    }
    const phone = phoneInput.replace(/-/g, "");
    if (!isValidPhoneDigits(phone)) {
      return void res
        .status(400)
        .json({ error: "휴대폰 번호 형식이 올바르지 않습니다." });
    }

    const email = clean(body.email);
    if (email && (email.length > EMAIL_MAX_LENGTH || !isValidEmail(email))) {
      return void res
        .status(400)
        .json({ error: "이메일 형식이 올바르지 않습니다." });
    }

    const service = clean(body.service);
    if (!SERVICE_OPTIONS.includes(service)) {
      return void res.status(400).json({ error: "상담 분야를 선택해 주세요." });
    }

    const message = clean(body.message);
    if (message.length > MESSAGE_MAX_LENGTH) {
      return void res
        .status(400)
        .json({ error: "문의 내용은 1000자 이내로 입력해 주세요." });
    }

    if (body.agree !== true) {
      return void res
        .status(400)
        .json({ error: "개인정보 수집·이용에 동의해 주세요." });
    }

    try {
      const supabase = ctx.supabaseAdmin;

      // serverless라 인스턴스별 메모리 카운터는 무의미하다 — DB 조회로
      // 최근 제출 여부를 직접 확인한다.
      const since = new Date(
        Date.now() - DUPLICATE_WINDOW_SECONDS * 1000,
      ).toISOString();
      const { count, error: dupError } = await supabase
        .from("premium_consult_requests")
        .select("id", { count: "exact", head: true })
        .eq("phone", phone)
        .gte("created_at", since);

      if (dupError) throw dupError;

      if ((count || 0) > 0) {
        return void res
          .status(429)
          .json({ error: "잠시 후 다시 시도해 주세요." });
      }

      // status는 기본값('new')에 맡긴다 — 명시적으로 넣지 않는다.
      const { error: insertError } = await supabase
        .from("premium_consult_requests")
        .insert({
          name,
          phone,
          email,
          service,
          message,
        });

      if (insertError) throw insertError;

      return void res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[create-consult-request] 오류:", error);
      return void res
        .status(500)
        .json({ error: "상담 신청 처리 중 오류가 발생했습니다." });
    }
  },
});
