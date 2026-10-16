import { useEffect, useMemo } from "react";
import { Navigate, useParams } from "react-router";
import { DEMO_REGISTRY } from "@/demo/demoRegistry";

// srcDoc 문서의 document URL은 about:srcdoc이지만 base URL은 부모(SPA) 문서를 그대로
// 상속한다. 그래서 목업 안의 <a href="#process">가 about:srcdoc이 아니라 부모 경로
// (예: /demo/research-intro#process)로 resolve되고, 이는 프래그먼트 스크롤이 아니라
// iframe의 전체 네비게이션을 일으킨다. sandbox에 allow-same-origin이 없어 그 네비게이션은
// opaque origin이 되어 CORS로 전부 막히고 로고만 남은 백지 화면이 된다(뒤로가기 외 복구
// 경로 없음). 그래서 앵커 클릭을 가로채 직접 스크롤하는 스크립트를 목업 HTML에 주입한다.
// target="_top" 링크(최종 CTA 등)는 href가 "#"로 시작하지 않으므로 이 처리에서 자연히
// 제외되고, 기존 sandbox 설정(allow-top-navigation-by-user-activation)대로 정상 동작한다.
const FRAGMENT_NAV_FIX_SCRIPT = `
<script>
(function () {
  document.addEventListener('click', function (event) {
    var anchor = event.target.closest('a');
    if (!anchor) return;

    var href = anchor.getAttribute('href');
    if (!href || href.charAt(0) !== '#') return; // target="_top" 등 정상 링크는 손대지 않는다

    event.preventDefault();

    if (href === '#') {
      window.scrollTo(0, 0); // html{scroll-behavior:smooth}가 부드러운 스크롤을 담당한다
      return;
    }

    var target = document.getElementById(href.slice(1));
    if (target) {
      target.scrollIntoView();
    }
    // 대상을 못 찾으면 아무것도 하지 않는다 — 전체 네비게이션이 나가는 것보다 무동작이 낫다
  });
})();
</script>
`;

// 인라인 <script>(go() 스텝 네비게이터, pill 핸들러) 뒤에 오도록 </body> 직전에 주입한다.
// </body>를 못 찾는 방어적인 경우엔 문자열 끝에 덧붙인다.
function injectFragmentNavFix(html: string) {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${FRAGMENT_NAV_FIX_SCRIPT}</body>`);
  }
  return html + FRAGMENT_NAV_FIX_SCRIPT;
}

// 고객사 HTML 목업을 iframe 전체 뷰포트로 띄운다. 콘텐츠 높이로 늘려 내부 스크롤을 없애면
// 원본의 position:sticky 헤더와 window.scrollTo(0,0) 스텝 이동, @media(max-width:900px)가
// 의도대로 걸리지 않는다 — iframe이 자체 뷰포트를 가져야 한다.
export default function DemoFrame() {
  const { demoKey: paramKey } = useParams();
  // :demoKey 라우트만 쓰지만 파라미터 타입이 optional이라 빈 문자열로 정규화한다.
  const demo = DEMO_REGISTRY[paramKey || ""];

  // HTML이 최대 69KB라 렌더마다 문자열을 새로 만들지 않도록 메모이즈한다.
  const html = useMemo(
    () => (demo ? injectFragmentNavFix(demo.html) : undefined),
    [demo],
  );

  // SiteLayout 밖 라우트라 헤더/푸터가 없어 react-helmet류를 쓸 이유가 없다 — 마운트 시
  // robots 메타만 직접 넣고 언마운트 시 제거한다.
  useEffect(() => {
    if (!demo) return undefined;

    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);

    return () => {
      document.head.removeChild(meta);
    };
  }, [demo]);

  if (!demo) {
    return <Navigate to="/" replace />;
  }

  return (
    <iframe
      title={demo.title}
      srcDoc={html}
      // allow-same-origin은 주지 않는다 — allow-scripts는 인라인 go() 스텝 네비게이터용,
      // allow-top-navigation-by-user-activation은 소개 페이지 CTA의 target="_top" 링크가
      // 사용자 클릭으로만 부모 SPA를 이동시키게 하기 위함이다.
      sandbox="allow-scripts allow-top-navigation-by-user-activation"
      className="fixed inset-0 h-dvh w-full"
      style={{ border: 0 }}
    />
  );
}
