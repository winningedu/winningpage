import { Link } from "react-router";

// 서비스 화면의 학년, 반은 마이페이지 학적에서 채워져 여기서는 바꿀 수 없다(사 #40).
export default function GradeLockNote() {
  return (
    <>
      학년은{" "}
      <Link to="/mypage?tab=profile" className="underline">
        마이페이지
      </Link>
      에서 바꿀 수 있어요.
    </>
  );
}
