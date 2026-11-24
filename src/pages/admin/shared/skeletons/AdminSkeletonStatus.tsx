import type { ReactNode } from "react";

interface AdminSkeletonStatusProps {
  label?: string;
  className?: string;
  children?: ReactNode;
}

// 스켈레톤 한 영역의 status 래퍼. status는 내용으로 이름이 정해지지 않아 aria-label로
// 이름을 주고, 같은 글자를 sr-only로도 싣는다(getByText로도 찾히게). 막대는 aria-hidden이다.
export function AdminSkeletonStatus({
  label = "데이터를 불러오는 중입니다.",
  className,
  children,
}: AdminSkeletonStatusProps) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={className}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
