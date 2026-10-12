// 알림톡 템플릿 레지스트리.
//
// 왜 필요한가
//   api/_lib/messaging/aligo.ts 는 인증번호 하나만 보낼 수 있었다, 템플릿 코드가
//   ALIGO_TEMPLATE_CODE 환경변수 **한 개**이고 본문도 buildAlimtalkMessage(code)
//   로 하드코딩돼 있었다. 승인된 템플릿이 4종 더 늘어나면서 그 구조로는 못 얹는다.
//
// 카카오 대조 규칙 — 이 파일에서 제일 중요한 것
//   카카오는 발송 본문을 **승인된 템플릿 원문과 글자 단위로 대조**한다. 고정
//   텍스트가 한 글자, 줄바꿈 하나, 공백 하나라도 다르면 발송이 거부된다.
//   그래서 아래 본문은 승인 문안을 그대로 옮긴 것이고, 변수 자리만 치환한다.
//   **템플릿을 알리고에서 수정하면 여기도 반드시 같이 고쳐야 한다.**
//
//   변수는 알리고에 키-값으로 넘기지 않는다 — 치환이 끝난 완성 문구를 보낸다
//   (기존 인증번호 발송과 같은 방식).
//
// 버튼(웹링크)
//   알리고는 button_1 에 JSON 문자열로 받는다. linkMo(모바일)·linkPc 둘 다
//   필요하고, 승인 시 등록한 주소와 **도메인이 일치해야** 한다.
//
//   ⚠️ 승인된 링크가 실제 앱 라우트와 다르다. 재심사에 며칠이 걸려서 앱 쪽에
//   리다이렉트를 만들어 맞췄다(src/routes/alimtalkLinkRoutes.tsx). 그러니 여기
//   주소는 "실제 라우트"가 아니라 **승인된 주소 그대로**여야 한다 — 실제
//   라우트로 바꾸면 도메인·경로 대조에서 걸린다.
//
//   ⚠️ www 유무도 승인 문안 그대로다(리포트 2종은 www 있음). 임의로
//   통일하지 말 것. 가입 축하 템플릿은 2026-08-25 재심사에서 버튼을 뺐다.

/** 승인 문안에 쓰인 사이트 주소. 승인 시점 문자열이라 임의로 바꾸지 않는다. */
export const SITE_WWW = "https://www.winningedu.com";

export type AlimtalkButton = {
  name: string;
  linkType: "WL";
  linkTypeName: "웹링크";
  linkMo: string;
  linkPc: string;
};

export type AlimtalkTemplate = {
  /** 템플릿 코드가 담긴 환경변수 이름. */
  codeEnv: string;
  /** 알리고 subject_1 — 알림톡 목록에 뜨는 제목. */
  subject: string;
  /** 승인 문안에 변수를 채워 완성 본문을 만든다. */
  build: (vars: Record<string, string>) => string;
  /**
   * 알림톡 실패(카카오 미사용자 등) 시 대체 발송할 SMS 문구.
   * 90바이트를 넘으면 LMS 로 올라가 단가가 3배 이상이라 짧게 둔다.
   * 리포트처럼 본문이 긴 건 "링크를 보라"로 축약한다.
   */
  smsFallback: (vars: Record<string, string>) => string;
  /** 웹링크 버튼(없으면 생략). */
  button?: (vars: Record<string, string>) => AlimtalkButton;
};

/** 변수 누락을 조용히 넘기지 않는다 — 빈 칸으로 발송되면 카카오 대조에서 걸린다. */
function v(vars: Record<string, string>, key: string): string {
  const value = vars[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`알림톡 변수 '${key}' 가 비어 있습니다.`);
  }
  return String(value);
}

const templates = {
  // -------------------------------------------------------------------------
  // 기존 — 휴대폰 인증번호. 본문은 aligo.ts 가 계속 소유한다(이 레지스트리로
  // 옮기면 인증 경로까지 한 번에 흔들린다). 여기엔 키만 남겨 목록을 한눈에 본다.
  // -------------------------------------------------------------------------

  /**
   * 회원가입 축하 — 2,000원 할인 쿠폰 안내.
   *
   * 수신자는 **학부모 가입자만**이다(2026-08-25 회의 확정). 결제를 학부모가
   * 하고 쿠폰도 학부모-학생 쌍 단위로 쓰이기 때문이다. 발송 지점은
   * api/signup-welcome.ts 하나뿐이며 학생 가입 폼에서는 부르지 않는다.
   *
   * ⚠️ 버튼이 없다. 원래 승인본에는 「쿠폰함 바로가기」 웹링크 버튼이 있었으나
   *   쿠폰함 화면을 만들지 않기로 하면서 **버튼을 뺀 문안으로 재심사**했다
   *   (2026-08-25). ALIGO_TPL_SIGNUP_COUPON 에는 그 재심사본 코드가 들어간다 —
   *   버튼을 되살리려면 알리고 템플릿부터 다시 손봐야 한다(본문·버튼이 승인본과
   *   어긋나면 카카오가 발송을 거부한다).
   *
   *   본문의 "쿠폰함에서 확인해 보세요"는 승인 문안 그대로다. 실제로 쿠폰이
   *   보이는 곳은 결제 화면의 쿠폰 선택(ParentCheckout)뿐이다.
   */
  signupCoupon: {
    codeEnv: "ALIGO_TPL_SIGNUP_COUPON",
    subject: "회원가입을 환영합니다",
    build: (vars) => `안녕하세요, ${v(vars, "고객명")}님.

위닝에듀 회원이 되신 것을 환영합니다.

감사한 마음을 담아 2,000원 할인 쿠폰을 발급해 드렸습니다. 지금 바로 쿠폰함에서 확인해 보세요!

쿠폰은 발급일로부터 6개월간 사용 가능하며, 유효기간이 지나면 자동으로 소멸됩니다.`,
    smsFallback: (vars) =>
      `[위닝에듀] ${v(vars, "고객명")}님, 가입 축하 2,000원 쿠폰이 발급되었습니다.`,
  },

  /** 일간 보고서 — 그날의 학습 현황. */
  dailyReport: {
    codeEnv: "ALIGO_TPL_DAILY_REPORT",
    subject: "일간 학습 보고서",
    build: (vars) => `안녕하세요, 위닝에듀입니다.

${v(vars, "학생명")} 학생의 ${v(vars, "월")}월 ${v(vars, "일")}일 학습 현황을 알려드립니다.

■ 목표 대비 오늘
이상적 학습 시간: ${v(vars, "이상목표시간")}
최소 학습 시간: ${v(vars, "최소목표시간")}
실제 학습 시간: ${v(vars, "실제학습시간")}
이상 목표 달성률 ${v(vars, "이상달성률")}%
최소 목표 달성률 ${v(vars, "최소달성률")}%

■ 오늘 완료
${v(vars, "오늘완료내용")}

■ 계획 달성
${v(vars, "전체계획수")}개 중 ${v(vars, "달성계획수")}개 달성

■ 오늘의 컨디션
${v(vars, "오늘컨디션")}

■ 학생 한마디
“${v(vars, "학생한마디")}”`,
    smsFallback: (vars) =>
      `[위닝에듀] ${v(vars, "학생명")} 학생의 ${v(vars, "월")}/${v(vars, "일")} 학습 현황을 알려드립니다.`,
  },

  /** 주간 리포트 — 발행 안내 + 리포트 링크. */
  weeklyReport: {
    codeEnv: "ALIGO_TPL_WEEKLY_REPORT",
    subject: "주간 학습 리포트",
    build: (vars) => `안녕하세요, 위닝에듀입니다.

${v(vars, "학생명")} 학생의 ${v(vars, "N월")}월 ${v(vars, "N주차")}주차 주간 학습 리포트가 발행되었습니다.

아래 버튼을 눌러 이번 주 학습 시간과 목표 달성 현황, 계획 실천 결과를 리포트에서 확인해 보세요.`,
    smsFallback: (vars) =>
      `[위닝에듀] ${v(vars, "학생명")} 학생의 주간 학습 리포트가 발행되었습니다.`,
    button: (vars) => ({
      name: "주간 리포트 확인하기",
      linkType: "WL",
      linkTypeName: "웹링크",
      // reportId 자리에는 그 주 월요일 YMD 를 넣는다 — 리포트는 저장되지 않고
      // 기간 키로 계산되기 때문이다(alimtalkLinkRoutes.tsx 주석 참고).
      linkMo: `${SITE_WWW}/services/goal/reports/weekly/${v(vars, "reportId")}`,
      linkPc: `${SITE_WWW}/services/goal/reports/weekly/${v(vars, "reportId")}`,
    }),
  },

  /** 월간 리포트 — 발행 안내 + 리포트 링크. */
  monthlyReport: {
    codeEnv: "ALIGO_TPL_MONTHLY_REPORT",
    subject: "월간 학습 리포트",
    build: (vars) => `안녕하세요, 위닝에듀입니다.

${v(vars, "학생명")} 학생의 ${v(vars, "N월")}월 월간 학습 리포트가 발행되었습니다.

아래 버튼을 눌러 이번 달 학습 시간과 목표 달성 현황, 계획 실천 결과를 리포트에서 확인해 보세요.`,
    smsFallback: (vars) =>
      `[위닝에듀] ${v(vars, "학생명")} 학생의 월간 학습 리포트가 발행되었습니다.`,
    button: (vars) => ({
      name: "월간 리포트 확인하기",
      linkType: "WL",
      linkTypeName: "웹링크",
      // 월간 키는 'YYYY-MM'.
      linkMo: `${SITE_WWW}/services/goal/reports/monthly/${v(vars, "reportId")}`,
      linkPc: `${SITE_WWW}/services/goal/reports/monthly/${v(vars, "reportId")}`,
    }),
  },
  /**
   * 성장설계 리포트 완료 안내(No.111). 수신자는 연결된 학부모.
   * 문안은 시안 651:4775 의 고정 문장을 옮겼다. 시안의 구성, 방향 일관성,
   * 먼저 할 일 줄은 변수 계약(학생이름, 발행일, 링크)에 없어 넣지 않았다.
   *
   * 카카오 템플릿 등록과 승인 전에는 발송이 실패 로그로 남는다.
   * ALIGO_TPL_GROWTH_REPORT_DONE 에 승인 코드가 들어가야 하고, 본문과 버튼은
   * 승인본과 글자 단위로 같아야 한다.
   */
  growthReportDone: {
    codeEnv: "ALIGO_TPL_GROWTH_REPORT_DONE",
    subject: "성장설계 리포트가 도착했어요",
    build: (vars) => `성장설계 리포트가 도착했어요

${v(vars, "학생이름")} 학생
지금까지의 활동을 분석해 남은 기간을 설계했어요.

발행일 ${v(vars, "발행일")}

성적 진단 항목은 학부모 화면에 보이지 않아요.`,
    smsFallback: (vars) =>
      `[위닝에듀] ${v(vars, "학생이름")} 학생의 성장설계 리포트가 도착했습니다.`,
    button: (vars) => ({
      name: "성장설계 리포트 보기",
      linkType: "WL",
      linkTypeName: "웹링크",
      linkMo: v(vars, "링크"),
      linkPc: v(vars, "링크"),
    }),
  },
} satisfies Record<string, AlimtalkTemplate>;

export type AlimtalkTemplateKey = keyof typeof templates;

// satisfies 만 쓰면 각 항목이 리터럴 타입으로 좁혀져 button 이 없는 템플릿
// (dailyReport)에서 `template.button` 접근이 컴파일 에러가 난다. 키 추론은
// 위 satisfies 로 살리고, 소비 시점 타입은 button 이 optional 인 공통
// AlimtalkTemplate 으로 넓혀서 내보낸다.
export const ALIMTALK_TEMPLATES: Record<AlimtalkTemplateKey, AlimtalkTemplate> =
  templates;
