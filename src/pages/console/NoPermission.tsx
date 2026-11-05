// W11 권한 없음. 담임이 /teacher/import 를 열면 셸 본문에 이 안내를 보인다.

import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { CONSOLE_BASE } from "./menu";

export default function NoPermission() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="text-app-section font-semibold text-ink-sub">
        이 메뉴는 학교 전체 관리자만 쓸 수 있어요
      </h1>
      <p className="text-app-body text-ink-sub">
        담당 학급 관리는 학생 관리에서 할 수 있어요
      </p>
      <Button
        type="button"
        onClick={() => navigate(`${CONSOLE_BASE}/students`)}
        className="h-10 rounded-lg px-5 text-app-label font-semibold"
      >
        학생 관리로 가기
      </Button>
    </div>
  );
}
