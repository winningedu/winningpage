import { Navigate, Route, Routes } from "react-router";
import MentorApplicationDetail from "./MentorApplicationDetail";
import MentorApplicationList from "./MentorApplicationList";
import { MENTOR_APPLICATIONS_PATH } from "./paths";

export interface MentorApplicationsAdminProps {
  config: {
    title: string;
    searchPlaceholder?: string;
    // 목록 렌더(AdminTable)와 QA 270, 228 다운로드가 함께 읽는다.
    columns: { key: string; label: string; type?: string | undefined }[];
    [key: string]: unknown;
  };
}

// 어드민 "멘토 신청 내역". 화면마다 주소가 있어 새로고침과 뒤로가기가 그대로 동작한다.
// 섹션 라우트가 mentorApplications/* 라 아래 Routes 가 나머지 경로를 맡는다.
export default function MentorApplicationsAdmin({
  config,
}: MentorApplicationsAdminProps) {
  return (
    <Routes>
      <Route index element={<MentorApplicationList config={config} />} />
      <Route path=":id" element={<MentorApplicationDetail config={config} />} />
      <Route
        path="*"
        element={<Navigate to={MENTOR_APPLICATIONS_PATH} replace />}
      />
    </Routes>
  );
}
