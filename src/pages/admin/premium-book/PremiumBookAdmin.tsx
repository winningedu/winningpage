import { Navigate, Route, Routes } from "react-router";
import { PremiumBookFormPage } from "./PremiumBookFormPage";
import { PremiumBookList } from "./PremiumBookList";
import { PREMIUM_BOOK_PATH } from "./paths";
import type { PremiumBookAdminConfig } from "./types";

// 어드민 "프리미엄 책자 관리". 화면마다 주소가 있어 새로고침과 뒤로가기가 그대로 동작한다.
// 섹션 라우트가 premiumBookPages/* 라 아래 Routes 가 나머지 경로를 맡는다.
// 저장소와 DB 는 서버(/api/admin/premium-book/*)만 부른다.
export default function PremiumBookAdmin({
  config,
}: {
  config: PremiumBookAdminConfig;
}) {
  return (
    <Routes>
      <Route index element={<PremiumBookList config={config} />} />
      <Route path="new" element={<PremiumBookFormPage config={config} />} />
      <Route path=":id" element={<PremiumBookFormPage config={config} />} />
      <Route path="*" element={<Navigate to={PREMIUM_BOOK_PATH} replace />} />
    </Routes>
  );
}
