import { useCallback } from "react";
import { useNavigate } from "react-router";
import SelfAssignPrompt from "@/components/enrollment/SelfAssignPrompt";
import { useMyEnrollment } from "@/components/enrollment/useMyEnrollment";
import KakaoConsultButton from "@/components/mypage/KakaoConsultButton";
import MyPageTabs from "@/components/mypage/MyPageTabs";
import MyServicesTab from "@/components/mypage/MyServicesTab";
import PaymentsTab from "@/components/mypage/PaymentsTab";
import ProfileTab from "@/components/mypage/ProfileTab";
import ChildrenTab from "@/components/mypage/parent/ChildrenTab";
import ParentPaymentsTab from "@/components/mypage/parent/ParentPaymentsTab";
import { useMyPageOrders } from "./mypage/useMyPageOrders";
import { useMyPageProfile } from "./mypage/useMyPageProfile";
import { useMyPageTab } from "./mypage/useMyPageTab";
import { usePendingOrderCount } from "./mypage/usePendingOrderCount";

function cleanText(value: unknown) {
  return String(value || "").trim();
}

// 탭 구성 — 회원유형으로 갈린다.
//
// 학생(Figma 3656:374 외): 나의 서비스 / 수강/결제 내역 / 내 정보 수정
// 학부모(Figma 3636:104): 자녀 등록 및 수정 / 수강/결제 내역 / 내 정보 수정
//
// ⚠ 학부모 시안은 리비전마다 탭 수가 다르다 — 2탭(3360:10499), 3탭에 '결제
// 내역'(3610:2365), 3탭에 '수강/결제 내역'(3636:104), 4탭에 '상담 및 문의'
// 추가(3616:2892). 2026-08-13 사용자 확정으로 3636:104(3탭)을 정본으로 삼는다.
// '상담 및 문의'는 내용 디자인도 백엔드도 없어 넣지 않았다.
const STUDENT_TABS = [
  { key: "services", label: "나의 서비스" },
  { key: "payments", label: "신청 내역" },
  { key: "profile", label: "내 정보 수정" },
];

const PARENT_TABS = [
  { key: "children", label: "자녀 등록 및 수정" },
  { key: "payments", label: "결제 내역" },
  { key: "profile", label: "내 정보 수정" },
];

export default function MyPage() {
  const navigate = useNavigate();

  const { user, profile, loading } = useMyPageProfile(navigate);
  const { orders, refunds, reload: reloadOrders } = useMyPageOrders(user);
  // 스쿨멘토 학적. 입력 안내와 내 정보 행이 같이 쓴다. 위닝은 읽지 않는다.
  const enrollment = useMyEnrollment();

  const memberType = cleanText(profile?.member_type).toLowerCase();
  const isParent = memberType === "parent";

  // 학부모 탭 배지용 대기 건수(확정 디자인 3967:3944 "결제 요청 1"·"환불 요청 1").
  const { pendingOrderCount, reload: reloadPendingCount } =
    usePendingOrderCount(user, isParent);

  // 학부모 결제 내역 탭에서 액션(환불 응답·결제요청 반려·환불 신청)이 일어나면
  // 주문·환불 목록과 탭 배지를 한 번에 다시 읽는다 — 세 섹션이 서로 다른 데이터를
  // 보므로 부분 갱신은 반드시 어딘가를 stale 로 남긴다. pending 주문 목록(섹션 2)은
  // ParentPaymentsTab 이 자체 보유해서 그쪽 reloadPending 과 합성된다.
  const refreshPayments = useCallback(() => {
    reloadOrders();
    reloadPendingCount();
  }, [reloadOrders, reloadPendingCount]);

  const refundRequestCount = refunds.filter(
    (r) => r.approval_status === "requested",
  ).length;

  const tabs = (isParent ? PARENT_TABS : STUDENT_TABS).map((tab) =>
    isParent && tab.key === "payments"
      ? {
          ...tab,
          badges: [
            { label: "결제 요청", count: pendingOrderCount },
            { label: "환불 요청", count: refundRequestCount },
          ],
        }
      : tab,
  );

  const activeTab = useMyPageTab(tabs, loading);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16 text-ink">
        <div className="rounded-2xl border border-line bg-white px-6 py-4 text-sm font-semibold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          개인정보 불러오는 중...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="mx-auto w-full max-w-content px-5 py-30 sm:px-8">
        <h1 className="text-[2rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
          MY 페이지
        </h1>

        {/* 스쿨멘토 학생의 올해 학급이 비어 있으면 입력 안내(사 #109). 위닝은 아무것도 그리지 않는다. */}
        {!isParent && <SelfAssignPrompt {...enrollment} />}

        <div className="-mt-4.25">
          <MyPageTabs tabs={tabs} activeTab={activeTab} />
        </div>

        <div className="mt-16">
          {activeTab === "services" && <MyServicesTab />}

          {activeTab === "children" && <ChildrenTab />}

          {activeTab === "payments" && (
            <>
              {/* 학부모만 — 학생이 만든 결제요청을 발견하는 경로(handoff 작업 1·2).
                  학생 화면에는 인박스 개념 자체가 없다(요청을 만드는 쪽이라서). */}
              {isParent ? (
                <ParentPaymentsTab
                  orders={orders}
                  refunds={refunds}
                  onRefresh={refreshPayments}
                />
              ) : (
                <PaymentsTab
                  orders={orders}
                  refunds={refunds}
                  onRefundSubmitted={reloadOrders}
                />
              )}
            </>
          )}

          {activeTab === "profile" && (
            <ProfileTab
              user={user}
              profile={profile}
              memberType={memberType}
              enrollment={enrollment}
            />
          )}
        </div>
      </div>

      {/* 시안 지시 — "카카오톡 상담하기 버튼은 마이페이지에서 오른쪽 하단에
          항상 뜨게 해주세요!"(3656:362) */}
      <KakaoConsultButton />
    </main>
  );
}
