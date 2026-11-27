import type { SVGProps } from "react";

// 네이버 블로그 로고의 소문자 b 모양(단색). lucide-react에 없어 직접 둔다.
export default function NaverBlogIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-icon="naver-blog"
      {...props}
    >
      <path d="M6 3h3.5v18H6Z" />
      <path d="M13 8a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13Zm0 3.5a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z" />
    </svg>
  );
}
