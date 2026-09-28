import { useMemberType } from "@/hooks/useMemberType";
import BlockedMemberNotice from "./checkout/BlockedMemberNotice";
import MemberTypeRetryNotice from "./checkout/MemberTypeRetryNotice";
import StudentEnrollmentRequest from "./checkout/StudentEnrollmentRequest";
import PricingSelling from "./pricing/PricingSelling";

// /pricing("이용신청 > 서비스요금")도 회원 유형에 따라 갈린다(2026-08-12b
// 팀 리드 지시 — Figma 3921-8299 가 3921-7066 과 시각적으로 동일해 별도
// 화면을 만들지 않고 StudentEnrollmentRequest 를 그대로 재사용한다).
//   게스트(비로그인) → PricingSelling (이 페이지의 원래 본문 — 판매 UI +
//                      goCheckout, 순수 이동만 했다. 해당 파일 상단 주석 참고)
//   'student'        → StudentEnrollmentRequest (Checkout.jsx 의 /checkout
//                      진입과 완전히 같은 컴포넌트 — 화면을 두 벌 만들지 않는다)
//   'parent'         → PricingSelling(viewer="parent") — 요금표는 게스트와
//                      동일하게 열람하되, 안내 배너를 보여주고 결제 버튼은
//                      숨긴다(팀 리드 결정, 2026-09-28 — 이전엔 페이지 자체를
//                      차단 모달로 가렸으나 열람은 허용하는 쪽으로 바뀌었다).
//   조회 실패(error)  → MemberTypeRetryNotice (재시도 버튼 — 아래 error 분기
//                      주석 참고. NULL/mentor 차단과 원인이 다르므로 문구도 다르다)
//   그 외('mentor'/NULL) → BlockedMemberNotice (/checkout 의 그 외 분기와 동일 처리)
// 역할 판정(member_type 조회)은 useMemberType 훅 하나로 Checkout.jsx 와
// 공유한다 — 각자 손으로 쓰면 판정이 갈리는 병(팀 리드 지시)을 막는다.
export default function Pricing() {
  const { loading, userId, memberType, error, refetch } = useMemberType();

  if (loading) {
    // 이 페이지가 이미 쓰는 로딩 톤(PricingSelling.jsx 요금 정보 로딩 박스)과
    // 맞췄다 — 신규 문구가 아니다.
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm font-bold text-ink-sub">
          회원 정보를 확인하는 중입니다.
        </div>
      </main>
    );
  }

  // 게스트 — 기존 동작 그대로(사용자 확정: /pricing 은 원래 공개 판매
  // 페이지다). useMemberType 은 로딩이 끝나면 게스트를 userId=null 로
  // 돌려준다.
  if (!userId) return <PricingSelling />;

  // 조회 자체가 실패했으면 회원 유형을 알 수 없다 — "차단"이 아니라 "일시
  // 오류"로 다뤄 재시도를 준다. memberType===null(가입 미완료)과 원인이
  // 다르므로 아래 BlockedMemberNotice 로 묶지 않는다(그 문구는 "가입을
  // 완성해 달라"인데, 조회 실패는 사용자가 고칠 방법이 없는 상태다).
  if (error) return <MemberTypeRetryNotice onRetry={refetch} />;

  if (memberType === "student") return <StudentEnrollmentRequest />;
  if (memberType === "parent") return <PricingSelling viewer="parent" />;

  return <BlockedMemberNotice memberType={memberType} />;
}
