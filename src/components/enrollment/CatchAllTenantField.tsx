import { useState } from "react";
import ProfileField from "@/components/mypage/ProfileField";
import JoinTenantModal from "./JoinTenantModal";

// 마이페이지 소속 칸의 기타 소속 변형(결정 96). 기관 이름은 읽기 전용으로 두고 소속코드 입력 모달을 연다.
export default function CatchAllTenantField({
  tenantName,
  onJoined,
}: {
  tenantName: string;
  onJoined: (tenantName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ProfileField
        label="소속"
        value={tenantName}
        readOnly
        actionLabel="소속코드 입력"
        onAction={() => setOpen(true)}
        className="mb-5"
      />
      <JoinTenantModal
        open={open}
        onClose={() => setOpen(false)}
        onJoined={onJoined}
      />
    </>
  );
}
