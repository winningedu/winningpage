import type { SVGProps } from "react";

// 네이버 N 글자 모양(단색). lucide-react에 없어 직접 둔다.
export default function NaverIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M4 4h5.2l5.6 8.1V4H20v16h-5.2L9.2 11.9V20H4V4Z" />
    </svg>
  );
}
