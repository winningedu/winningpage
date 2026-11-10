import { Link } from "react-router";
import { classifyMember, type MemberKind } from "@/lib/memberAccess";

// 학생/학부모가 아닌 로그인 사용자를 위한 안내. /checkout 과 /pricing 양쪽에서
// 재사용한다(2026-08-12b 팀 리드 지시 — "학생/학부모가 아니면 /checkout
// 분기와 동일 처리"). 문구를 두 파일에 각자 손으로 쓰면 서서히 갈리므로
// 컴포넌트 자체를 공유한다.
//
// 원인이 둘로 갈려 문구도 나눈다(2026-08-12c 사용자 승인 — "이유·해결법 추가"):
//   member_type 이 NULL(가입 미완료) — dev 실측 3건이 이 상태다(이메일 인증만
//     하고 이탈한 계정, sql/68 배경 조사). 본인이 가입을 마치면 스스로 고칠
//     수 있는 상태라 "완성해 달라"고 안내한다.
//   member_type = 'mentor' 또는 'teacher' — 애초에 결제 대상이 아닌 회원 유형이라 고칠 게
//     없다. 그 사실만 안내한다.
// memberType 이 이 둘 중 무엇도 아닌 값(예상 밖 문자열, 조회 실패로 넘어온
// null/undefined 포함)이면 보수적으로 NULL(가입 미완료) 쪽 문구로 떨어뜨린다
// — "가입을 마치면 된다"는 메시지가 "멘토라 안 된다"는 메시지보다 더 넓은
// 상황을 포괄해서 틀릴 위험이 적다(팀 리드 지시).
const COPY = {
  mentor: {
    title: "멘토 회원은 결제를 이용할 수 없어요",
    body: "결제는 학생과 학부모 회원만 이용할 수 있어요.",
  },
  teacher: {
    title: "선생님 회원은 결제를 이용할 수 없어요",
    body: "결제는 학생과 학부모 회원만 이용할 수 있어요.",
  },
  // null(가입 미완료) 전용이지만, 위 주석대로 예상 밖 값도 전부 여기로 모인다.
  incomplete: {
    title: "회원 정보를 먼저 완성해 주세요",
    body: "학생 또는 학부모 회원만 결제를 이용할 수 있어요. 가입을 마치면 이용할 수 있어요.",
  },
};

const COPY_BY_KIND: Partial<Record<MemberKind, typeof COPY.incomplete>> = {
  mentor: COPY.mentor,
  teacher: COPY.teacher,
};

// memberType 은 optional prop 이다 — 호출부(Checkout.jsx·Pricing.jsx)가
// useMemberType() 으로 이미 들고 있는 값을 그대로 넘긴다(2026-08-12c 팀 리드
// 지시, 새 조회를 만들지 않는다).
type BlockedMemberNoticeProps = {
  memberType?: string | null;
};

export default function BlockedMemberNotice({
  memberType,
}: BlockedMemberNoticeProps) {
  const kind = classifyMember({ memberType });
  const copy = COPY_BY_KIND[kind] ?? COPY.incomplete;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white pt-16 text-center">
      <h1 className="text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink sm:text-[2rem]">
        {copy.title}
      </h1>
      <p className="mt-3 text-[0.875rem] font-normal leading-5.5 text-ink-sub sm:text-[1rem]">
        {copy.body}
      </p>
      {/* 버튼은 두 케이스 모두 기존 홈 링크를 유지한다(팀 리드 지시).
          TODO(wiring): member_type=NULL(가입 미완료) 케이스에서는 이 버튼이
          가입 완료 화면으로 가는 게 더 맞지만, 그 화면 경로가 아직 확정되지
          않아 추측해 넣지 않는다 — 경로가 정해지면 이 Link 의 to 를 조건부로
          바꿀 자리다(2026-08-12c). mentor 케이스는 그대로 홈 링크가 맞다. */}
      <Link
        to="/"
        className="mt-8 rounded-xl bg-primary px-8 py-3.5 text-[0.875rem] font-semibold leading-5 text-white transition hover:brightness-125"
      >
        홈으로 이동
      </Link>
    </main>
  );
}
