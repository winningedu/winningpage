import type { SVGProps } from "react";

// 카카오톡 말풍선 모양(단색). lucide-react에 없어 직접 둔다.
export default function KakaoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.86 1.87 5.37 4.68 6.78l-.95 3.5a.4.4 0 0 0 .6.44L10.5 19.1c.49.06.99.1 1.5.1 5.52 0 10-3.58 10-8S17.52 3 12 3Z" />
    </svg>
  );
}
