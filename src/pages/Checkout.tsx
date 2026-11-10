import { useMemberType } from "@/hooks/useMemberType";
import BlockedMemberNotice from "./checkout/BlockedMemberNotice";
import MemberTypeRetryNotice from "./checkout/MemberTypeRetryNotice";
import ParentCheckout from "./checkout/ParentCheckout";
import StudentEnrollmentRequest from "./checkout/StudentEnrollmentRequest";

// 리뷰 BLOCK 수정(2026-08-12) — /checkout(App.jsx:109, ProtectedRoute 안쪽)이
// 이 파일을 그대로 렌더한다. 예전엔 이 파일 자체가 "장바구니 담아 바로 결제"
// UI(카트·쿠폰·토스 결제창)를 갖고 있었는데, handlePay()가 삭제된
// api/create-order.js를 fetch해 결제 진입이 100% 실패였다(BLOCK 원문).
// 제품 규칙이 이미 "학생이 결제를 요청하고 학부모가 마이페이지에서 수락+결제"
// 두 화면(StudentEnrollmentRequest.jsx / ParentCheckout.jsx, 둘 다 이미 완성돼
// 있었다)로 바뀌었는데, 그 두 화면은 App.jsx에 라우트가 없어 도달 불가였다.
//
// App.jsx는 이 작업 범위 밖 소유 파일이라 라우트를 추가할 수 없다(BLOCK 지시:
// "라우트 전환 전까지는 ... Checkout.jsx handlePay를 신규 api/request-enrollment
// 흐름으로 교체"). 라우팅을 새로 만들지 않고도 새 화면에 도달시키는 방법은
// 이미 살아있는 /checkout 진입점(이 컴포넌트) 자체를 역할별 디스패처로 바꾸는
// 것뿐이다 — 그래서 옛 단일 카트 결제 UI는 전부 걷어내고, 로그인한 회원의
// member_type만 확인해 학생이면 요청 화면을, 학부모면 수락+결제 화면을
// 그대로 위임한다. 두 화면 모두 이미 만들어진 정본 구현이라 로직을 다시
// 베끼지 않고 import만 한다(중복 구현 방지).
//
// member_type 판정은 useMemberType 훅 하나로 Pricing.jsx 와 공유한다
// (2026-08-12b 팀 리드 지시 — 각자 손으로 조회를 쓰면 학생/학부모 판정이
// 화면마다 갈리는 병이 난다). 이전엔 여기서 "학생이 아니면 전부 ParentCheckout"
// 으로 뭉뚱그려 멘토·가입 미완료 회원까지 ParentCheckout의 "학생이 요청한
// 결제만 진행할 수 있어요" 안내를 봤다 — 결제 대상이 아닌 회원에게 결제
// 흐름 안의 문구를 보여준 오분류였다. 이제 그 케이스는 Pricing.jsx 와 같은
// BlockedMemberNotice 로 교정한다:
//   'student' → StudentEnrollmentRequest
//   'parent'  → ParentCheckout (?order= 없이 들어오면 ParentCheckout 자체의
//               ApprovalOnlyGate 가 마이페이지로 돌려보낸다 — 여기서 다시
//               다루지 않는다)
//   error(조회 실패) → MemberTypeRetryNotice(재시도) — "차단"이 아니라
//               "일시 오류"라 Pricing.jsx 와 같은 이유로 따로 분기한다.
//   그 외('mentor'/NULL) → BlockedMemberNotice
//
// ※ App.jsx 소유자와 조정되면, /checkout을 없애고 각 화면을 전용 라우트로
//   분리하는 편이 장기적으로 더 명확하다 — 이 디스패처는 그 전환 전까지의
//   임시 배선이다(BLOCK 원문 "a·c 간 조정 필요" 참고).
export default function Checkout() {
  const { loading, userId, memberType, kind, error, refetch } = useMemberType();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-[0.875rem] font-medium text-ink-sub">
          회원 정보를 확인하는 중입니다.
        </p>
      </main>
    );
  }

  // ProtectedRoute가 이미 비로그인은 /login으로 돌려보내므로 이 분기는
  // 세션이 막 만료된 극히 짧은 창에서만 지나간다 — 안전하게 학부모/기타
  // 취급(ParentCheckout의 ApprovalOnlyGate로 수렴)한다.
  if (!userId) return <ParentCheckout />;

  if (error) return <MemberTypeRetryNotice onRetry={refetch} />;

  if (kind === "student") return <StudentEnrollmentRequest />;
  if (kind === "parent") return <ParentCheckout />;

  return <BlockedMemberNotice memberType={memberType} />;
}
