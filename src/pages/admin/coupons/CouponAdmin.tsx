import { Navigate, Route, Routes } from "react-router";
import CouponFormPage from "./CouponFormPage";
import CouponList from "./CouponList";
import { COUPONS_PATH } from "./paths";

// 어드민 "쿠폰관리". 화면마다 주소가 있어 새로고침과 뒤로가기가 그대로 동작한다.
// 섹션 라우트가 coupons/* 라 아래 Routes 가 나머지 경로를 맡는다.
export default function CouponAdmin() {
  return (
    <Routes>
      <Route index element={<CouponList />} />
      <Route path="new" element={<CouponFormPage />} />
      <Route path=":id/edit" element={<CouponFormPage />} />
      <Route path="*" element={<Navigate to={COUPONS_PATH} replace />} />
    </Routes>
  );
}
