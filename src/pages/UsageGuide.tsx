import { USAGE_GUIDE_SERVICE_OPTIONS } from "../../api/_lib/consult/usageGuideServices.js";
import { type ConsultApplyCopy, ConsultApplyPage } from "./PremiumApply";

// 이용신청 > 이용안내 (스쿨멘토). 프리미엄 이용 화면과 같은 틀(안내서 뷰어 + 문의 폼)에
// 이용안내 문구를 넘긴다. 안내서 페이지 이미지는 프리미엄 책자와 같은 premium_book_pages를
// 읽는다. 스쿨멘토 DB에는 학생사용안내서만 올라가므로 위닝에듀 책자와 섞이지 않는다.
const USAGE_GUIDE_COPY: ConsultApplyCopy = {
  eyebrow: "이용안내",
  title: "스쿨멘토 이용 방법을 확인해보세요",
  bookLabel: "학생 사용 안내서",
  inquiryHeading: "이용방법 세부 문의하기 및 서비스 도입 신청하기",
  inquirySentence:
    "문의사항을 남겨주시면 관련 팀이 확인후 연락 또는 메일회신 드립니다",
  emailPlaceholder: "example@email.com",
  serviceOptions: USAGE_GUIDE_SERVICE_OPTIONS,
};

export default function UsageGuide() {
  return <ConsultApplyPage copy={USAGE_GUIDE_COPY} />;
}
