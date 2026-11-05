import type { SVGProps } from "react";

// 네이버 클립 로고 모양(단색). lucide-react에 없어 직접 둔다.
export default function NaverClipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M20.9 15.9A9 9 0 1 1 20.9 8.1" />
      <path d="M10 8.5L15.5 12L10 15.5Z" />
    </svg>
  );
}
