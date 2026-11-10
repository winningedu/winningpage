// 수행평가 사이드바 메뉴 활성 표시 회귀 검증 — scripts/verify-performance-sidebar-nav.mjs 이식.
//
// 무엇을 막는가
// -------------
// `PerformanceSidebar`의 메뉴 2항목은 **상호 배타**다 — 시안 `3754:3121`에서 pill이
// `저장 리포트`로 **이동**하고 `위닝 채팅` 쪽 pill은 사라진다. 그런데 활성 판정을
// react-router의 `NavLink`에 맡기면 이 규칙이 조용히 깨진다:
//
//   NavLink는 `aria-current` prop을 자기 기본값(`ariaCurrentProp = 'page'`)으로 흡수하고
//   **라우터 자체의 prefix 매칭**으로 다시 계산해 내보낸다
//   (`let ariaCurrent = isActive ? ariaCurrentProp : undefined`).
//   `to="/app/performance"`에 `end`가 없으면 `/app/performance/reports`도 prefix로 걸려
//   두 항목이 동시에 `aria-current="page"`가 된다. 시각적으로는 pill이 하나뿐이라
//   눈으로는 절대 안 보이고, 스크린리더에서만 「현재 페이지」가 2개로 들린다.
//
// 그래서 컴포넌트는 `Link` + 커스텀 판정을 쓰고, 이 파일이 그 계약을 고정한다.
// 반대로 `end`를 붙이는 해법은 `/app/performance/:sessionId`(새로고침 복구)에서
// 채팅 메뉴가 꺼지므로 채택하지 않는다 — 그 경로도 함께 검사한다.
//
// shadcn Sidebar 전환(2026-09-06) 이식 메모
// -----------------------------------------
// `PerformanceSidebar`가 이제 `AppShellSidebar`(shadcn `Sidebar` 기반)를 쓰므로
// `useSidebar()`가 `SidebarProvider` 컨텍스트를 요구한다 — 렌더 헬퍼를
// `SidebarProvider`로 함께 감싼다. 활성 pill의 시각적 신호도
// `bg-performance-activePill` 리터럴 클래스에서 shadcn 표준 `data-active` 속성
// (Base UI `useRender`의 state→data-* 변환, 값이 `true`면 `data-active=""`로
// 직렬화된다)으로 바뀌었다 — 검증 대상만 그에 맞춰 바꾸고 "정확히 1개, aria-current와
// 같은 항목" 의도는 그대로 유지한다.
//
// 이식 메모(node:test → Vitest, task 10.8)
// -----------------------------------------
// 원본은 esbuild로 컴포넌트를 번들해 `react-router-dom`을 external로 남긴 뒤
// `StaticRouter`로 감쌌다(react-router-dom/server.js가 CJS 전용이라 ESM 번들 출력에서
// dynamic require가 터지는 것을 피하기 위함). Vitest는 TSX를 그대로 변환하므로 그 번들링이
// 필요 없다 — 컴포넌트를 직접 import하고, 라우터도 저장소가 실제로 쓰는 `react-router`
// 패키지(v8, task 5에서 `react-router-dom`을 대체)에서 `MemoryRouter`를 가져와 감싼다.
// `.jsx` → `.tsx` 경로 드리프트: `PerformanceSidebar.jsx` → `PerformanceSidebar.tsx`.

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import PerformanceSidebar from "./PerformanceSidebar";

// 검사 경로 4종. §3.4 메뉴 정본 + P13 세션 복구 라우트(`/app/performance/:sessionId`).
const CASES = [
  { pathname: "/app/performance", expected: "위닝 채팅" },
  {
    pathname: "/app/performance/8f1c2b3d-0000-4000-8000-000000000001",
    expected: "위닝 채팅",
  },
  { pathname: "/app/performance/reports", expected: "저장 리포트" },
  {
    pathname: "/app/performance/reports/8f1c2b3d-0000-4000-8000-000000000002",
    expected: "저장 리포트",
  },
] as const;

function renderShell(children: React.ReactNode, pathname: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider>{children}</SidebarProvider>
    </MemoryRouter>,
  );
}

function render(pathname: string) {
  return renderShell(<PerformanceSidebar />, pathname);
}

// <a ...>라벨</a> 를 통째로 집어 속성과 텍스트를 함께 본다.
function collectAnchors(html: string) {
  const anchors: { attrs: string; text: string }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    anchors.push({
      attrs: m[1] as string,
      text: (m[2] as string).replace(/<[^>]*>/g, "").trim(),
    });
  }
  return anchors;
}

describe.each(CASES)("$pathname", ({ pathname, expected }) => {
  const html = render(pathname);
  const anchors = collectAnchors(html);

  test("메뉴 <a>가 정확히 2개다(§3.4 — 세 번째 항목 '설정'은 범위 밖)", () => {
    expect(anchors).toHaveLength(2);
  });

  test('aria-current="page"가 정확히 1개이고 기대 항목에 있다(NavLink 회귀 방지)', () => {
    const current = anchors.filter((a) => /aria-current="page"/.test(a.attrs));
    expect(
      current.length,
      `[${current.map((a) => a.text).join(", ")}] — NavLink로 되돌아갔거나 활성 판정이 깨졌다`,
    ).toBe(1);
    expect(current[0]?.text).toBe(expected);
  });

  test("NavLink 잔재인 리터럴 'active' 클래스가 새어 나오지 않는다", () => {
    // `class="..."` 값 안에는 `data-active:bg-sidebar-accent`(Tailwind data-* 변형
    // 셀렉터) 같은 정상 토큰이 "active"라는 부분 문자열을 포함하므로, 단순
    // `\bactive\b` 검사는 오탐한다(콜론도 단어 경계로 잡힌다) — class 값을 공백으로
    // 쪼갠 토큰 중 정확히 "active"인 것만 리터럴 잔재로 본다.
    for (const a of anchors) {
      const classValue = a.attrs.match(/\bclass="([^"]*)"/)?.[1] ?? "";
      expect(classValue.split(/\s+/)).not.toContain("active");
    }
  });

  test("활성 pill이 정확히 1개이고 aria-current 항목과 일치한다(시안 3754:3121 — pill은 이동한다)", () => {
    // shadcn SidebarMenuButton의 `isActive` state → Base UI useRender가 실제 DOM
    // 속성 `data-active=""`로 직렬화한다(getStateAttributesProps.js: value===true면
    // 빈 문자열 속성). `="")` 까지 정확히 매치해야 한다 — `class="..."` 안의
    // `data-active:bg-sidebar-accent`(콜론으로 이어지는 Tailwind 변형)와 혼동하면
    // 활성/비활성 항목 둘 다 걸려 버린다(className이 정적이라 두 항목이 같은
    // `data-active:` 토큰을 갖고 있다).
    const activePills = anchors.filter((a) => /\bdata-active=""/.test(a.attrs));
    expect(activePills.length).toBe(1);
    expect(activePills[0]?.text).toBe(expected);
  });

  test("<nav 역할>의 aria-labelledby ↔ '메뉴' id 연결이 유지된다", () => {
    expect(html.includes('aria-labelledby="perf-nav-heading"')).toBe(true);
    expect(html.includes('id="perf-nav-heading"')).toBe(true);
  });

  test("진행단계 region의 aria-labelledby ↔ '진행단계' id 연결이 유지된다", () => {
    expect(html.includes('aria-labelledby="perf-steps-heading"')).toBe(true);
    expect(html.includes('id="perf-steps-heading"')).toBe(true);
  });
});

describe("complementary 랜드마크(AppShellSidebar)", () => {
  // 회귀: `role`/`aria-label`을 `Sidebar`(shadcn 프리미티브)에 직접 걸면 모바일에서
  // `Sidebar`가 `<Sheet {...props}>`(Base UI Dialog.Root, DOM 없음)로 갈라져 랜드마크가
  // 사라진다 — `AppShellSidebar`가 `children`을 감싼 `<aside>` 래퍼에 옮겨 달았는지
  // 검사한다(리터럴 `role="complementary"`가 아니라 `<aside>`의 암묵적 role이다 —
  // `AppShellSidebar.tsx` 주석 참고). 이 파일은 SSR 정적 렌더라 데스크톱 분기만
  // 확인하지만, `Sidebar`가 데스크톱·모바일 둘 다 같은 `children`을 렌더하므로 래퍼가
  // 존재하면 두 경로 모두에서 적용된다.
  test("한국어 aria-label을 가진 <aside>가 정확히 1개 있다", () => {
    const html = render("/app/performance");
    const matches = [...html.matchAll(/<aside\s+aria-label="([^"]*)"/g)];
    expect(matches).toHaveLength(1);
    expect(matches[0]?.[1]).toBe("수행평가 사이드바");
  });
});

// 프로필 슬롯(P5) — 값이 없으면 그 줄을 렌더하지 않는다(§11 Q61-ⓔ, 가짜 기본값 금지).
function renderWithProfile(props: {
  profileName?: string | null;
  schoolType?: string | null;
  gradeLabel?: string | null;
}) {
  return renderShell(<PerformanceSidebar {...props} />, "/app/performance");
}

describe("프로필 블록", () => {
  test("이름·학년·학교유형이 전부 있으면 이름 줄과 '학년・학교유형' 부제를 함께 렌더한다", () => {
    const html = renderWithProfile({
      profileName: "홍길동",
      gradeLabel: "고1",
      schoolType: "고등학교",
    });
    expect(html.includes("홍길동의 수행평가")).toBe(true);
    expect(html.includes("고1・고등학교")).toBe(true);
  });

  test("학년이 없으면 부제에 학교유형만 남는다", () => {
    const html = renderWithProfile({
      profileName: "홍길동",
      gradeLabel: null,
      schoolType: "고등학교",
    });
    expect(html.includes("홍길동의 수행평가")).toBe(true);
    expect(html.includes(">고등학교<")).toBe(true);
  });

  test("이름·학년·학교유형이 전부 없으면 프로필 블록에 이름·부제 <p>가 하나도 없다", () => {
    const html = renderWithProfile({
      profileName: null,
      gradeLabel: null,
      schoolType: null,
    });
    // "・"만으로는 판별할 수 없다 — STEP5 라벨("작성・평가")에도 같은 글자가 쓰인다.
    // 프로필 헤더 슬롯(data-slot="sidebar-header")만 잘라내 그 안에 <p>가 없는지 본다.
    const profileBlock = html.match(
      /<div data-slot="sidebar-header"[^>]*>([\s\S]*?)<\/div>/,
    )?.[1];
    expect(profileBlock).toBeDefined();
    expect(profileBlock?.includes("<p")).toBe(false);
  });
});

describe("스쿨멘토 메뉴 이름", () => {
  test("채팅 메뉴는 '스쿨멘토 채팅'이다(결정 107.11)", async () => {
    vi.resetModules();
    vi.doMock("@/config/site", () => ({
      site: { brandName: "스쿨멘토", features: { stripWinningPrefix: true } },
    }));
    const { default: Sidebar } = await import("./PerformanceSidebar");

    const { SidebarProvider: Provider } = await import(
      "@/components/ui/sidebar"
    );
    const { MemoryRouter: Router } = await import("react-router");
    const anchors = collectAnchors(
      renderToStaticMarkup(
        <Router initialEntries={["/app/performance"]}>
          <Provider>
            <Sidebar />
          </Provider>
        </Router>,
      ),
    );

    expect(anchors.map((a) => a.text)).toContain("스쿨멘토 채팅");
    vi.doUnmock("@/config/site");
    vi.resetModules();
  });
});
