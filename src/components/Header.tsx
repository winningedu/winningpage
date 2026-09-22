import type { User } from "@supabase/supabase-js";
import { Menu } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "react-router";
import chevronIcon from "@/assets/header/chevron.svg";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { useAuth } from "@/context/AuthProvider";
import {
  MEGA_COL_GAP,
  MEGA_COL_W,
  MEGA_GUARD,
  NAV_CELL_GAP,
  NAV_CELL_W,
  NAV_GUARD,
} from "@/data/navigation";
import { cleanText, isSameObject, useNavGroups } from "@/hooks/useNavGroups";
import { useSignupEnabled } from "@/hooks/useSignupEnabled";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";
import MobileNavDrawer from "./MobileNavDrawer";
import { buildMyMenu, resolveMyMenuRole } from "./myMenuItems";

const CSAT_DATE = "2026-11-19";
const HEADER_PROFILE_CACHE_KEY = "winning-header-profile";
const MS_PER_DAY = 86400000;

// ---- 헤더 정렬 상수 ----
// (QA 행327, 2026-09-02 개정) 로고·nav·계정 그룹은 이제 max-w-[120rem](1920px) 밴드 하나를
//   공유하는 3존 flex 행(로고 shrink-0 / nav flex-1 / 계정 그룹 shrink-0)에 배치한다 — 로고+
//   계정 그룹의 max-w-[120rem] 밴드와 nav의 max-w-content(72.75rem) 컨텐츠 영역이 서로 독립적으로
//   중앙정렬되던 옛 2중 좌표계는 폐기했다(계정 그룹 실측폭을 전혀 반영 못 하는 뷰포트 전용
//   clamp() 가드 수식이 원인이라 좁은 데스크톱 구간에서 nav·계정 그룹이 실제로 겹쳤다 — 상세
//   경위는 아래 return 블록 헤더 주석 참고). MEGA_GUARD·MEGA_COL_W·MEGA_COL_GAP(메가 패널
//   컬럼 격자)은 이번 변경 대상이 아니라 기존 방식을 그대로 유지한다.
// LOGO_W: 2026-09-03 사용자 최종 결정 — 헤더 로고는 가로형(public/images/
//   winning-logo-horizontal.svg, Figma 4549:2682 "W"+WINNING EDU 가로 그라디언트,
//   80ac46d7에서 들어온 정본 파일)을 쓴다. 스택형(QA 행320)은 헤더에서 폐기하고(푸터는
//   스택형 유지, 이 파일 소관 아님) 신규 시안 svg 사본(docs/figma-assets·src/assets/header
//   등)도 만들지 않는다 — public 정본 파일만 참조한다. 크기는 헤더 시안(4782:3215) 실값
//   h 22px(2279c0b8 이전의 h-6=24px/190px 추정치 대신 시안 실측값 채택)로 렌더하고,
//   실렌더 폭은 가로형 원본 비율로 환산한 10.882rem(174.112px)이다. 로고 존 폭(NAV_GUARD
//   등 nav 안전영역 계산)도 이 값을 그대로 쓴다(navigation.ts 참고 — LOGO_W를 바꾸면
//   NAV_GUARD/MEGA_GUARD도 함께 재계산해야 한다).
const LOGO_W = "10.882rem";
// 프로모 카드 폭: 2026-09-03 사용자 결정으로 풀스케일(460px)을 폐기하고 0.8 컴팩트
// 스케일로 되돌린다 — 시안 §3 실값(460×478, p-8/gap-8/rounded-3xl/타이틀 26px Bold/
// 서브 18px Medium/이미지 프레임 282×188/CTA px-15 py-6 rounded-2xl 20px SemiBold)에
// 전부 ×0.8을 적용한 값(카드 368px=23rem, p 1.6rem, gap 1.6rem, radius 1.2rem, 타이틀
// 1.3rem(20.8px)/tracking -0.026rem, 서브 0.9rem(14.4px), 이미지 프레임 225.6×150.4px
// =14.1rem×9.4rem, CTA px-[3rem] py-[1.2rem] rounded-2xl(1rem) text-base)을 아래 카드
// JSX에 그대로 반영했다. 이미지 크롭 구조(absolute+height 120.21%/top -10.64%)·타이포
// 색(#525252=text-ink)·오픈 트리거 로직(§8)은 풀스케일 작업 때 새로 정리한 것을 그대로
// 유지한다 — 스케일만 되돌리는 변경이다.
const MEGA_PROMO_W = "23rem";
// 프로모 카드는 비로그인 상태에서만 노출한다(§6-4 사용자 결정 — 로그인 시 카드 자리에
// 6번째 MY 컬럼이 대신 들어간다, 아래 return 블록 참고). 로그인 전용 콘텐츠(구
// MEGA_PROMO_MEMBER)는 폐기했다.
// subtitle은 시안 §3에 두 줄로 고정돼 있어(줄바꿈 위치까지 지정) 배열로 두고 아래 JSX에서
// 줄마다 <br/>로 렌더한다.
const MEGA_PROMO_GUEST = {
  title: "흔들리지 않는 학습·진로 관리의 시작!",
  subtitleLines: [
    "학습진단, 목표관리, 수행, 탐구, 성장설계까지",
    "완벽히 점검해 드립니다",
  ],
  image: "/images/mega-menu-promo.png",
  ctaLabel: "로그인하기",
  ctaTo: "/login",
};
// 메가 회색 존(#F9FAFB — Figma 1483:846 get_design_context 실값, 기존 #F7F7F7 추정치 폐기):
// 게스트(프로모 카드) 존은 고정 크기(GREY_ZONE_W×GREY_ZONE_H)를 그대로 쓴다 — 상하좌우
// 동일한 2.5rem(p-10) 패딩, ml-auto로 밴드 우측 끝에 고정.
// GREY_ZONE_W = MEGA_PROMO_W(23rem) + p-10×2(5rem) = 28rem. 게스트 전용 상수다.
// GREY_ZONE_H는 두 상태 공용 — 게스트 카드 자연 높이 + p-10×2 ≈ 28.9rem(사용자 산정값).
// 로그인(6번째 MY 컬럼) 존도 같은 높이를 써서 패널 높이가 로그인/게스트 전환에 변하지
// 않는다(구 `shouldShowLoggedInHeader ? {minHeight:"35rem"}` 조건부 스타일은 폐기).
// 로그인 존의 폭·좌측 위치는 2026-09-03 사용자 결정으로 GREY_ZONE_W 고정을 버리고
// 계정 그룹(D-day 배지) 좌측 x에 유동적으로 맞춘다 — accountGroupRef/zoneBandRef +
// useLayoutEffect(아래 컴포넌트 본문)와 return 블록의 로그인 존 JSX 참고. myZoneRect
// 측정 전(첫 페인트 찰나)에는 이 GREY_ZONE_W를 폴백값으로 재사용한다.
const GREY_ZONE_W = "28rem";
const GREY_ZONE_H = "28.9rem";

function getCsatDay() {
  const now = new Date();
  const kstNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  const today = new Date(
    kstNow.getFullYear(),
    kstNow.getMonth(),
    kstNow.getDate(),
  );
  const target = new Date(`${CSAT_DATE}T00:00:00+09:00`);
  const diff = Math.ceil((target.getTime() - today.getTime()) / MS_PER_DAY);

  if (diff > 0) return `수능 D-${diff}`;
  if (diff === 0) return "수능 D-DAY";
  return `수능 D+${Math.abs(diff)}`;
}

// profiles 테이블 행 — 헤더가 실제로 읽는 컬럼만 좁혀서 둔다.
// 생성 타입(Tables<"profiles">)에서 파생시켜 null 가능 여부가 실제 스키마와 어긋나지
// 않게 한다(role만 NOT NULL이라 string, 나머지는 string | null).
type Profile = Pick<
  Tables<"profiles">,
  "id" | "name" | "email" | "username" | "member_type" | "role"
>;

function getMemberLabel(profile: Profile | null) {
  const raw = cleanText(profile?.member_type).toLowerCase();
  const role = cleanText(profile?.role).toLowerCase();

  if (role === "admin") return "관리자";
  if (!raw) return "";
  if (raw === "student" || raw === "학생" || raw === "학생회원")
    return "학생회원";
  if (
    raw === "parent" ||
    raw === "parents" ||
    raw === "학부모" ||
    raw === "학부모회원"
  )
    return "학부모회원";
  if (raw === "mentor" || raw === "teacher" || raw === "멘토" || raw === "교사")
    return "멘토회원";
  return raw.endsWith("회원") ? raw : `${raw}회원`;
}

// 이름 라벨 truncate(§6-6 사용자 결정, 이름 max 5자) — 계정 그룹 폭 겹침 방지(QA 행327)
// 이후 폐지됐던 이름 truncate 상한을 헤더 이름 칩에 한해 다시 도입한다.
function truncateDisplayName(name: string, max = 5) {
  const trimmed = name.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function readCachedProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(HEADER_PROFILE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: Profile | null) {
  try {
    if (!profile) {
      window.localStorage.removeItem(HEADER_PROFILE_CACHE_KEY);
      return;
    }

    window.localStorage.setItem(
      HEADER_PROFILE_CACHE_KEY,
      JSON.stringify(profile),
    );
  } catch {
    // 캐시 저장 실패는 무시
  }
}

function isSameUserProfile(
  profile: Profile | null | undefined,
  user: User | null | undefined,
) {
  if (!profile || !user) return false;

  const profileId = cleanText(profile.id);
  const userId = cleanText(user.id);
  const profileEmail = cleanText(profile.email).toLowerCase();
  const userEmail = cleanText(user.email).toLowerCase();

  return (
    (!!profileId && profileId === userId) ||
    (!!profileEmail && profileEmail === userEmail)
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallbackValue: T,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      window.setTimeout(() => resolve(fallbackValue), ms),
    ),
  ]);
}

async function queryProfileById(
  userId: string | undefined,
): Promise<Profile | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, username, member_type, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("profiles id 조회 실패:", error);
    return null;
  }

  return data || null;
}

async function queryProfileByEmail(
  email: string | null | undefined,
): Promise<Profile | null> {
  const normalizedEmail = cleanText(email).toLowerCase();

  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, username, member_type, role")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error("profiles email 조회 실패:", error);
    return null;
  }

  return data || null;
}

async function queryProfileByUsername(
  email: string | null | undefined,
): Promise<Profile | null> {
  const username = cleanText(email).split("@")[0];

  if (!username) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, username, member_type, role")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error("profiles username 조회 실패:", error);
    return null;
  }

  return data || null;
}

async function fetchProfile(
  user: User | null | undefined,
): Promise<Profile | null> {
  if (!user) return null;

  const byId = await queryProfileById(user.id);
  if (byId?.name) return byId;

  const byEmail = await queryProfileByEmail(user.email);
  if (byEmail?.name) return byEmail;

  const byUsername = await queryProfileByUsername(user.email);
  if (byUsername?.name) return byUsername;

  return byId || byEmail || byUsername || null;
}

const MEGA_CLOSE_DELAY_MS = 100;
// megaPanelPhase를 'closing' → 'closed'로 옮기는 JS 타이머 지연이자, 메가 딤+패널의
// 클로즈 transitionDuration(인라인 style)이기도 하다 — 아래 두 <div>가 이 상수를 그대로
// style로 소비한다. Tailwind duration-[Nms] 유틸은 정적 문자열만 JIT가 인식하므로 JS
// 상수를 클래스명에 보간할 수 없어, 클로징 구간만 인라인 style로 뺐다(둘이 어긋나면
// setMegaPanelPhase("closed")가 트랜지션 도중에 발화해 깜빡임이 생긴다).
const MEGA_PANEL_CLOSING_MS = 120;
const CSAT_DDAY_REFRESH_MS = 60 * 60 * 1000;
const LOGOUT_FALLBACK_TIMEOUT_MS = 1800;
// activeMega는 원래 "어떤 nav 그룹이 열렸는가"만 표현했다. §8 사용자 결정으로 로고·이름
// 칩·D-day 배지·chevron도 패널을 여는데, 이 요소들은 특정 nav 그룹을 강조하면 안 된다
// (강조 없이 패널만 오픈). 이 sentinel을 activeMega에 넣으면 어떤 group.title과도 일치하지
// 않아 패널은 열리되(megaPanelPhase 이펙트는 truthy 값만 본다) nav 항목 하이라이트는 전부
// 꺼진다 — 기존 열림/닫힘 타이머·이펙트를 그대로 재사용할 수 있는 최소 변경이다.
const MEGA_GENERIC_TRIGGER = "__mega-generic__";
// 계정 그룹 버튼(로그인/회원가입/로그아웃) 폭 — 시안 §1 w 90px(5.625rem), 1920 기준.
// nav 셀과 동일한 1440~1919 clamp(vw) 비례 축소 원칙을 적용한다(90*1440/1920=67.5px).
const ACCOUNT_BTN_W_CLAMP = "clamp(4.21875rem, 4.6875vw, 5.625rem)";

export default function Header() {
  // 세션 구독 자체는 AuthProvider(전역 단일 구독, src/context/AuthProvider.tsx)에
  // 위임한다(명세서 B-3) — 이 컴포넌트는 세션이 확정된 뒤 프로필(profiles 테이블)만
  // 별도로 조회한다.
  const { session, user, isReady: isAuthReady } = useAuth();
  // 가입 오픈 여부(app_settings.signup_enabled) — false/로딩 중(null)이면
  // 회원가입 CTA를 숨긴다(routeMiddleware.ts requireSignupEnabledMiddleware가
  // 라우트 진입 자체는 이미 막는다, 이 훅은 CTA 노출만 담당).
  const signupEnabled = useSignupEnabled();
  const [profile, setProfile] = useState<Profile | null>(() =>
    readCachedProfile(),
  );
  const [csatDDay, setCsatDDay] = useState(getCsatDay());
  const [activeMega, setActiveMega] = useState<string | null>(null);
  // 메가 패널 애니메이션 상태(open/closed 3-phase state machine, 사용자 확정 스펙).
  // 'closed' → 마운트는 유지하되 opacity-0/invisible/pointer-events-none으로 완전히 상주(비표시).
  // 'open'   → activeMega가 켜지는 즉시 진입, 180ms ease-out-quart로 opacity+translateY 페이드인.
  // 'closing'→ activeMega가 null이 될 때(유지영역 타이머 만료·클릭 토글·로고 클릭 등) 진입,
  //            120ms opacity만 페이드아웃(이동 없음) 후 아래 타이머로 'closed'에 도달한다.
  // 패널이 always-mounted(조건부 렌더 아님)라 첫 hover 시에도 트랜지션이 항상 이미 걸려있는
  // 상태에서 클래스만 토글되므로 최초 오픈에서도 트랜지션이 확실히 발화한다.
  const [megaPanelPhase, setMegaPanelPhase] = useState<
    "closed" | "open" | "closing"
  >("closed");
  const megaPanelAnimTimerRef = useRef<number | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const navGroups = useNavGroups();
  const { pathname } = useLocation();

  // 로그인 메가 패널 회색존 좌측 정렬(2026-09-03 사용자 결정) — 회색존 좌측 x를 헤더
  // 계정 그룹(D-day 배지) 좌측 x에 유동적으로 맞춘다(고정 28rem 폭 폐기, 로그인 상태만).
  // accountGroupRef: D-day 배지+이름 칩+chevron을 감싸는 트리거 div(shouldShowLoggedInHeader
  // 분기에서만 렌더) — 배지가 그 안의 첫 자식이라 이 div의 좌측 x = 배지 좌측 x다.
  // zoneBandRef: 회색존이 실제로 속한 "1920 밴드"(mx-auto max-w-[120rem], 아래 메가 패널
  // return 블록) — 이 밴드 기준 상대 좌표(marginLeft)로 존 위치를 잡아야 뷰포트·2xl 패딩
  // 전환에도 안전하다.
  const accountGroupRef = useRef<HTMLDivElement>(null);
  const zoneBandRef = useRef<HTMLDivElement>(null);
  const [myZoneRect, setMyZoneRect] = useState<{
    marginLeft: number;
    width: number;
  } | null>(null);

  // 현재 경로 기반 GNB 활성 그룹 판정(사용자 확정 스펙, 2단계):
  // 1단계 — 그룹의 후보 경로(group.to + items[].to 중 내부 경로만) 중 pathname과 정확히
  //   같은 것이 있으면 그 그룹이 활성.
  // 2단계 — 1단계에서 아무 그룹도 안 걸렸을 때만, 후보 경로의 첫 세그먼트와 pathname의 첫
  //   세그먼트가 같으면 활성. /page/<slug>는 여러 그룹에 걸쳐 있어 첫 세그먼트로 비교하면
  //   전 그룹이 동시에 활성화되므로 2단계 비교에서 제외(1단계 정확 일치에만 참여)한다.
  // 세그먼트가 없는 경로(예: '/')는 2단계에서 제외 — 홈은 어느 nav 그룹에도 속하지 않는다.
  // navGroups 순회 순서상 먼저 오는 그룹 하나만 활성으로 삼아 동시 활성을 방지한다.
  const activePathTitle = useMemo(() => {
    function firstSegment(path: string | null | undefined) {
      const segment = String(path || "")
        .split("/")
        .filter(Boolean)[0];
      return segment || null;
    }

    function internalCandidates(group: (typeof navGroups)[number]) {
      const raw = [
        group?.to,
        ...(Array.isArray(group?.items) ? group.items : []).map(
          (item) => item?.to,
        ),
      ];
      return raw.filter(
        (to): to is string => typeof to === "string" && to.startsWith("/"),
      );
    }

    for (const group of navGroups) {
      if (internalCandidates(group).includes(pathname)) {
        return group.title;
      }
    }

    const pathSegment = firstSegment(pathname);
    if (!pathSegment) return null;

    for (const group of navGroups) {
      const segmentCandidates = internalCandidates(group).filter(
        (to) => !to.startsWith("/page/"),
      );
      if (segmentCandidates.some((to) => firstSegment(to) === pathSegment)) {
        return group.title;
      }
    }

    return null;
  }, [navGroups, pathname]);

  // 메가 유지영역(nav 메뉴 블록 + 메가 패널) 전용 공유 close 타이머 —
  // 두 영역이 헤더 안에서 서로 다른 DOM 서브트리(nav 오버레이 / 패널)라 완전히 붙어있지
  // 않고, nav↔패널 이동 시 짧은 순간 두 영역 모두를 벗어나는 프레임이 있을 수 있어
  // 즉시 닫지 않고 ~100ms 유예를 둔다. 로고·계정 그룹·딤·기타 영역으로 나가면(두 영역
  // 중 어느 쪽도 재진입하지 않으면) 유예 후 닫힌다.
  const megaCloseTimerRef = useRef<number | null>(null);

  const clearMegaCloseTimer = useCallback(() => {
    if (megaCloseTimerRef.current) {
      window.clearTimeout(megaCloseTimerRef.current);
      megaCloseTimerRef.current = null;
    }
  }, []);

  function scheduleMegaClose() {
    clearMegaCloseTimer();
    megaCloseTimerRef.current = window.setTimeout(() => {
      setActiveMega(null);
      megaCloseTimerRef.current = null;
    }, MEGA_CLOSE_DELAY_MS);
  }

  useEffect(() => () => clearMegaCloseTimer(), [clearMegaCloseTimer]);

  // activeMega(어떤 그룹이 활성인지)와 megaPanelPhase(패널이 화면에서 어떻게 보이는지)를
  // 분리한다 — 그룹이 바뀌어도(호버 이동) activeMega만 바뀌고 phase는 'open'을 유지해
  // 재애니메이션 없이 패널이 그대로 열려있게 하고, activeMega가 null이 될 때만 'closing'으로
  // 전환한다.
  useEffect(() => {
    if (activeMega) {
      if (megaPanelAnimTimerRef.current) {
        window.clearTimeout(megaPanelAnimTimerRef.current);
        megaPanelAnimTimerRef.current = null;
      }

      setMegaPanelPhase("open");
      return undefined;
    }

    setMegaPanelPhase((prev) => (prev === "open" ? "closing" : prev));
    return undefined;
  }, [activeMega]);

  // 'closing' 진입 120ms 후 'closed'로 전환 — 이 시점엔 opacity가 이미 0에 도달해 있어
  // (visibility invisible로 전환되며) translateY를 -0.5rem으로 되돌려도 시각적 이동이 보이지
  // 않는다(닫힘 애니메이션 자체는 opacity 페이드만, 이동 없음이라는 스펙을 그대로 지킨다).
  useEffect(() => {
    if (megaPanelPhase !== "closing") return undefined;

    megaPanelAnimTimerRef.current = window.setTimeout(() => {
      setMegaPanelPhase("closed");
      megaPanelAnimTimerRef.current = null;
    }, MEGA_PANEL_CLOSING_MS);

    return () => {
      if (megaPanelAnimTimerRef.current) {
        window.clearTimeout(megaPanelAnimTimerRef.current);
        megaPanelAnimTimerRef.current = null;
      }
    };
  }, [megaPanelPhase]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setCsatDDay(getCsatDay()),
      CSAT_DDAY_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  // 세션이 아니라 프로필(profiles 테이블)만 조회한다 — 세션 확정은 AuthProvider가
  // 이미 끝냈으므로(위 useAuth()), user가 바뀔 때만 프로필을 다시 가져오면 된다.
  // "winning-profile-updated" 커스텀 이벤트(마이페이지 등에서 이름 변경 후 발행)도
  // 같은 재조회 트리거로 남겨둔다.
  useEffect(() => {
    let alive = true;
    let seq = 0;

    async function syncProfile() {
      const currentSeq = ++seq;

      if (!user) {
        setProfile(null);
        writeCachedProfile(null);
        return;
      }

      try {
        const cachedProfile = readCachedProfile();
        let nextProfile: Profile | null = null;

        if (isSameUserProfile(cachedProfile, user)) {
          nextProfile = cachedProfile;
        }

        const fetchedProfile = await withTimeout(
          fetchProfile(user),
          1800,
          null,
        );

        if (!alive || currentSeq !== seq) return;

        if (fetchedProfile && isSameUserProfile(fetchedProfile, user)) {
          nextProfile = fetchedProfile;
          writeCachedProfile(fetchedProfile);
        }

        setProfile((prev) => {
          if (isSameObject(prev, nextProfile)) {
            return prev;
          }

          return nextProfile;
        });
      } catch (error) {
        console.error("헤더 프로필 동기화 오류:", error);

        if (!alive || currentSeq !== seq) return;

        setProfile(null);
      }
    }

    syncProfile();

    const handleProfileUpdated = () => {
      syncProfile();
    };

    window.addEventListener("winning-profile-updated", handleProfileUpdated);

    return () => {
      alive = false;
      window.removeEventListener(
        "winning-profile-updated",
        handleProfileUpdated,
      );
    };
  }, [user]);

  function clearSupabaseAuthStorage() {
    try {
      const localKeys: string[] = [];

      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key) localKeys.push(key);
      }

      localKeys.forEach((key) => {
        if (
          key.startsWith("sb-") ||
          key.includes("supabase") ||
          key.includes("auth-token") ||
          key === HEADER_PROFILE_CACHE_KEY
        ) {
          window.localStorage.removeItem(key);
        }
      });

      const sessionKeys: string[] = [];

      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key) sessionKeys.push(key);
      }

      sessionKeys.forEach((key) => {
        if (
          key.startsWith("sb-") ||
          key.includes("supabase") ||
          key.includes("auth-token")
        ) {
          window.sessionStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error("브라우저 세션 정리 오류:", error);
    }
  }

  async function handleLogout() {
    // 세션 자체는 AuthProvider가 SIGNED_OUT 이벤트로 곧 null로 갱신하지만(비동기),
    // 프로필은 이 컴포넌트가 로컬로 들고 있으므로 여기서 즉시 비운다.
    setProfile(null);
    writeCachedProfile(null);
    clearSupabaseAuthStorage();

    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((resolve) =>
          window.setTimeout(resolve, LOGOUT_FALLBACK_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      console.error("로그아웃 오류:", error);
    }

    // 1차 정리는 supabase의 SIGNED_OUT 이벤트 구독(queryClient.ts)이 담당한다 —
    // 위 signOut() 호출이 성공하면 그 구독이 이미 queryClient.clear()를 부른다.
    // 여기 있는 호출은 그 위에 얹는 중복 안전장치다(주석 정정, 재검증 LOW) —
    // signOut()이 LOGOUT_FALLBACK_TIMEOUT_MS 안에 응답하지 않아 이벤트 자체가
    // 아직 안 왔거나, 이 페이지 이동(window.location.replace 아래)까지 SIGNED_OUT
    // 처리보다 먼저 도달하는 경우를 대비한다. signOut 시도가 끝난 뒤로 미룬
    // 이유는 별도다 — signOut 요청이 아직 진행 중인데 먼저 캐시를 비우면, 그
    // 사이 진행 중이던 다른 in-flight 쿼리가 비워진 캐시에 다시 값을 채워 넣는
    // 경합 창이 생긴다.
    queryClient.clear();

    clearSupabaseAuthStorage();
    window.dispatchEvent(new Event("winning-profile-updated"));
    window.location.replace("/");
  }

  const isLoggedIn = isAuthReady && !!session?.user;
  const hasProfile = !!profile && !!cleanText(profile?.name);
  const shouldShowLoggedInHeader = isLoggedIn && hasProfile;
  const displayName = cleanText(profile?.name) || "";
  const memberLabel = getMemberLabel(profile);
  // MY 메뉴 역할 판정·목록은 myMenuItems.ts(단일 소스, §6-3 사용자 결정)를 그대로 쓴다 —
  // 데스크톱 메가 패널 6번째 컬럼(아래 return 블록)과 모바일 드로어(MobileNavDrawer)가
  // 이 두 값을 공유한다. profile이 아직 로딩 중이어도 안전한 기본값(student)으로
  // resolveMyMenuRole이 수렴하므로 그냥 항상 계산해 둔다.
  const myMenuRole = resolveMyMenuRole({
    role: profile?.role ?? null,
    memberType: profile?.member_type ?? null,
  });
  const myMenuItems = buildMyMenu(myMenuRole);

  // 메가 패널 콘텐츠(모든 navGroups 컬럼)는 activeMega와 무관하게 항상 동일하다(어떤
  // 그룹을 hover해도 5개 컬럼 전체가 함께 보이는 구조 — activeMega는 nav 버튼 하이라이트와
  // 패널 표시 여부만 결정한다). 그래서 패널 자체는 open 여부(megaPanelPhase)만으로 gate하면
  // 되고, 그룹별 콘텐츠 스위칭 로직은 불필요하다.
  const isMegaPanelOpen = megaPanelPhase === "open";
  const isMegaPanelClosing = megaPanelPhase === "closing";
  // 우측 회색존 콘텐츠(프로모 카드 vs 6번째 MY 컬럼) 분기 — 프로필 로딩 완료 여부
  // (shouldShowLoggedInHeader)와 무관하게 "로그인했는가"만으로 2분기한다(사용자 확정,
  // §6-4). 로그인 전용 프로모(구 MEGA_PROMO_MEMBER)는 폐기했다 — 로그인 시 카드 자리에
  // MY 컬럼이 대신 들어간다.
  const showMegaMyColumn = isLoggedIn;
  const megaPromo = MEGA_PROMO_GUEST;

  // 회색존 좌측 x를 계정 그룹(D-day 배지) 좌측 x에 맞춘다(위 accountGroupRef/zoneBandRef
  // 주석 참고). 우측 끝은 "현행대로"(기존 게스트 존이 translateX(0.5rem)로 밴드 우측 끝을
  // 8px 넘어서게 맞추던 것과 동일한 지점)를 유지한다 — zoneBandRect.right + 8을 목표
  // 우측 x로 두고, marginLeft/width를 밴드(zoneBandRef) 기준 상대값으로 환산한다.
  // ResizeObserver로 계정 그룹 자체의 폭 변화(역할·이름 길이)를, window resize로 뷰포트에
  // 따른 밴드·계정 그룹의 위치 이동(2xl 패딩 전환 등 콘텐츠 크기 변화가 없는 경우)을 각각
  // 잡는다 — 계정 그룹 리사이즈만으로는 순수 위치 이동을 못 잡고, window resize만으로는
  // 콘텐츠 폭 변화(예: 프로필 로딩 완료로 이름이 늦게 채워지는 경우)를 못 잡는다.
  useLayoutEffect(() => {
    if (!showMegaMyColumn) return undefined;

    const accountEl = accountGroupRef.current;
    const bandEl = zoneBandRef.current;
    // shouldShowLoggedInHeader를 여기서도 명시적으로 확인한다 — accountEl 자체가 그
    // 상태일 때만 렌더되는 D-day 배지 트리거 div라 사실상 항상 함께 참이지만, 아래
    // deps 배열에 shouldShowLoggedInHeader를 넣는 근거(프로필 로딩 완료 시 재실행)를
    // biome exhaustive-deps 검사와도 일치시키기 위해 조건에 직접 포함한다.
    if (!shouldShowLoggedInHeader || !accountEl || !bandEl) return undefined;

    function measure() {
      if (!accountEl || !bandEl) return;

      const accountRect = accountEl.getBoundingClientRect();
      const bandRect = bandEl.getBoundingClientRect();
      const ZONE_RIGHT_NUDGE_PX = 8; // translateX(0.5rem)와 동일한 우측 보정(위 주석 참고)

      setMyZoneRect({
        marginLeft: accountRect.left - bandRect.left,
        width: bandRect.right + ZONE_RIGHT_NUDGE_PX - accountRect.left,
      });
    }

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(accountEl);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
    // shouldShowLoggedInHeader도 deps에 넣는다 — accountGroupRef는 그 조건이 true일 때만
    // 렌더되는 D-day 배지 트리거 div에 달려 있다. showMegaMyColumn(=isLoggedIn)은 세션
    // 확정 즉시 true가 되지만 프로필(이름) 로딩은 비동기라, shouldShowLoggedInHeader가
    // 나중에 false→true로 바뀔 때(accountGroupRef.current가 그제서야 채워질 때) 이 효과가
    // 다시 실행되지 않으면 최초 measure()가 항상 "아직 ref 없음"으로 조기 반환해 실측이
    // 영영 일어나지 않는다(재현: 로그인 세션을 가진 채 새로고침 — 세션은 즉시 확정되지만
    // 프로필은 한 박자 늦게 옴).
  }, [showMegaMyColumn, shouldShowLoggedInHeader]);

  // 계정 그룹(로그인 로딩 placeholder / 로그인+프로필 완료 / 로그인만·프로필 로딩 중 /
  // 비로그인 4분기)을 별도 노드로 뽑아둔다 — 아래 헤더 행에서 실제로 그리는 것 외에,
  // return 블록 헤더 주석에 적은 이유로 헤더 nav 존의 "실제로 남는 폭"을 구하기 위해
  // 같은 내용을 그대로 한 번 더(보이지 않게) 렌더해야 하기 때문이다.
  // QA 행241 — 우측 상단 "마이페이지" 단독 버튼을 없애고, 이름 칩 자체를 /mypage 링크로
  // 바꾼다(호버 시 언더라인+색 변화, aria-label로 목적지 명시).
  // §6-1(2026-09-03 사용자 결정) — 관리자 단독 버튼("관리자" 링크+Settings 아이콘)을
  // 없앤다. 관리자 구분은 메가 패널 MY 컬럼의 "관리자 메뉴" 항목(buildMyMenu)으로만 한다.
  // §8 — 로그인/로그아웃/회원가입 버튼을 제외한 계정 그룹 요소(D-day 배지·이름 칩·chevron)는
  // hover 시 메가 패널을 강조 없이 연다(MEGA_GENERIC_TRIGGER).
  const accountGroupNode = (() => {
    if (!isAuthReady)
      return <div className="h-8 w-[16rem]" aria-hidden="true" />;
    if (shouldShowLoggedInHeader)
      return (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: hover 전용 메가 패널
              오픈 트리거(§8)다 — 실제 조작 가능한 컨트롤은 안쪽 이름 칩(Link)뿐이고, 이
              래퍼는 키보드 등가가 필요 없는 순수 호버 감지 영역이다(포커스 이동은 이름
              칩 자체의 onFocus 등가가 필요 없다 — 마우스 전용 패널 프리뷰라 Tab만으로도
              이름 칩까지 정상 도달한다). */}
          <div
            ref={accountGroupRef}
            className="flex shrink-0 items-center gap-3"
            onMouseEnter={() => {
              clearMegaCloseTimer();
              setActiveMega(MEGA_GENERIC_TRIGGER);
            }}
            onMouseLeave={scheduleMegaClose}
          >
            <span className="shrink-0 whitespace-nowrap rounded-sm bg-primary px-2.5 py-1 text-xs text-white">
              {csatDDay}
            </span>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/mypage"
                aria-label="마이페이지"
                className="flex shrink-0 items-center whitespace-nowrap py-1.5 text-sm font-medium text-primary transition hover:text-[#012347] hover:underline"
              >
                {truncateDisplayName(displayName)}님
                {memberLabel ? ` ${memberLabel}` : ""}
              </Link>

              <img
                src={chevronIcon}
                alt=""
                aria-hidden="true"
                data-testid="header-mega-chevron"
                className={`h-6 w-6 shrink-0 transition-transform duration-200 ${
                  isMegaPanelOpen ? "rotate-90" : "rotate-0"
                }`}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={handleLogout}
            style={{ width: ACCOUNT_BTN_W_CLAMP }}
            className="h-8 shrink-0 rounded-lg bg-surface-04 px-3 text-sm font-medium leading-5 text-primary hover:bg-[#ebebef]"
          >
            로그아웃
          </Button>
        </>
      );
    if (isLoggedIn)
      // 프로필(이름) 로딩 중이라 아직 이름 칩을 그릴 수 없다 — 이 분기는 로그아웃만
      // 노출한다(이름 도착 즉시 위 분기로 전환).
      return (
        <Button
          type="button"
          variant="ghost"
          onClick={handleLogout}
          style={{ width: ACCOUNT_BTN_W_CLAMP }}
          className="h-8 shrink-0 rounded-lg bg-surface-04 px-3 text-sm font-medium leading-5 text-primary hover:bg-[#ebebef]"
        >
          로그아웃
        </Button>
      );
    return (
      <>
        <Button
          render={<Link to="/login" />}
          variant="ghost"
          style={{ width: ACCOUNT_BTN_W_CLAMP }}
          className="h-8 shrink-0 rounded-lg bg-white px-3 text-sm font-medium leading-5 text-primary hover:bg-[#f5f8fb]"
        >
          로그인
        </Button>

        {signupEnabled && (
          <Button
            render={<Link to="/signup" />}
            variant="ghost"
            style={{ width: ACCOUNT_BTN_W_CLAMP }}
            className="h-8 shrink-0 rounded-lg bg-primary px-3 text-sm font-medium leading-5 text-[#f5f5f5] hover:bg-[#012347]"
          >
            회원가입
          </Button>
        )}
      </>
    );
  })();

  return (
    // `h-16`을 이 요소(`<header>`) 자신에 건다 — Tailwind preflight의 전역
    // `box-sizing: border-box` 아래에서는 `border-b`가 이 4rem 안에 포함되므로
    // `header.getBoundingClientRect().height`가 정확히 4rem(64px)이 된다. 예전엔
    // 높이가 안쪽 `h-16` div(아래)에만 걸려 있어 `<header>` 자체는 "auto"(내용 높이 +
    // 자기 테두리) 높이였다 — 내용 64px + 테두리 1px = 65px. 앱 셸(`AppShellSidebar`의
    // `--header-height`, `top-(--header-height)` 등)이 4rem을 리터럴로 가정하는 여러
    // 곳과 실측이 1px 어긋났던 원인이 이것이다(그리핑 원인). 사이트 전역의 `pt-16` 보정도
    // 원래부터 65px가 아니라 4rem(64px)만 가정해 왔으므로, 이 수정은 그 가정을 실제로
    // 맞춰 준다(부작용이 아니라 기존 오차의 해소).
    <header className="fixed left-0 top-0 z-50 h-16 w-full border-b border-black/5 bg-white">
      {/* 좌표계 1(1920 밴드): 로고(좌측 끝) + 계정 그룹(우측 끝). 랜딩 마퀴 밴드(max-w-[120rem])와
          동일 기준의 px-8 패딩으로 로고/계정 그룹을 뷰포트 1920 캡 좌우 끝에 고정한다.
          nav는 이 flex 라인에 속하지 않는다(좌표계 2, 아래 별도 overlay).
          (2026-09-03 사용자 결정 — QA 행327 커밋 0d3f8487이 이 좌표계 1(로고/계정 그룹)과
          좌표계 2(nav, absolute overlay)를 하나의 3존 flex로 합쳤던 것을 되돌린다. 3존
          flex는 nav를 "로고~계정 그룹 사이"에 중앙 정렬해 nav가 페이지(컨텐츠 영역) 중앙이
          아니라 계정 그룹 상태에 따라 매번 다른 위치에 떠 보이는 문제가 있었다(1920 실측
          nav 시작 x가 계정 그룹 상태에 따라 흔들리고 메가 컬럼 좌측선과도 어긋남) — 사용자가
          "헤더 위치 자체가 이상하다"고 판단해 0d3f8487 이전 구조(로고/계정 그룹은 이 좌표계 1,
          nav는 좌표계 2 absolute overlay, 각각 독립적으로 컨텐츠 중앙/NAV_GUARD 기준 정렬)로
          복귀했다. 이 되돌리기로 nav-계정 그룹 겹침(QA 행327 원인)이 좁은 데스크톱 구간에서
          다시 나타날 수 있다는 트레이드오프가 있다 — 계정 그룹이 가장 넓은 상태에서의 여유는
          아래 nav 오버레이 주석에 계산값을 남긴다. chevron·오픈 트리거(MEGA_GENERIC_TRIGGER)·
          MY 컬럼·회색존 28rem·프로모 카드 0.8 스케일·계정 버튼 스타일·햄버거 우측 배치·메가
          컬럼 제목 행·nav 타이포(hover SemiBold #013262/패널 열림 중 비활성 Medium #525252)는
          이 되돌리기와 무관하게 그대로 유지한다. */}
      {/* `h-16`이 아니라 `h-full` — 높이는 이제 `<header>` 자신(`border-box` 4rem, 위
          주석)이 정본이다. 여기서도 `h-16`을 그대로 두면 `border-b`만큼(1px) 안쪽
          content-box가 줄어든 `<header>`(63px)보다 이 div가 1px 더 커져 아래로 삐져
          나온다 — `h-full`로 부모가 실제로 내주는 높이만큼만 채운다. */}
      <div className="mx-auto flex h-full max-w-[120rem] items-center justify-between px-8 2xl:px-30">
        <Link
          to="/"
          className="flex shrink-0 items-center"
          style={{ width: LOGO_W }}
          onClick={() => setActiveMega(null)}
          onMouseEnter={() => {
            clearMegaCloseTimer();
            setActiveMega(MEGA_GENERIC_TRIGGER);
          }}
          onMouseLeave={scheduleMegaClose}
        >
          <img
            src={site.logo.horizontal}
            alt={site.brandName}
            className="h-5.5 w-auto object-contain"
          />
        </Link>

        {/* 2026-09-03 사용자 결정 — 햄버거를 모든 화면 크기에서 표시하고 계정 그룹 다음
            (게스트: 로그인·회원가입 다음 / 로그인: 로그아웃 다음)에 둔다. 계정 그룹
            래퍼(모바일 hidden)와 햄버거(항상 표시)의 순서를 바꿔 gap-3 flex 안에서
            자연스럽게 "계정 그룹 마지막"으로 자리잡게 한다 — 데스크톱에서는 두 요소 모두
            보여 햄버거가 계정 그룹 우측에 서고, 모바일에서는 계정 그룹 래퍼만 숨어(hidden
            desktop:flex) 기존과 동일하게 햄버거 단독으로 보인다. QA 행242가 데스크톱
            (90rem 이상)에서 햄버거를 숨겼던 것(desktop:hidden)을 폐기한다. */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden shrink-0 flex-nowrap items-center justify-end gap-3 whitespace-nowrap desktop:flex">
            {accountGroupNode}
          </div>

          <Button
            ref={(el) => {
              // Button은 base-ui Button.Props의 Ref<HTMLElement>를 받는다 —
              // variant/size만 쓰고 render prop을 안 줬으니 실제로는 항상 <button>을
              // 그린다. mobileNavTriggerRef(HTMLButtonElement) 계약은 MobileNavDrawer의
              // finalFocus에 그대로 넘어가므로(파일 소유권 밖) 여기서 콜백 ref로 좁혀
              // 할당한다.
              mobileNavTriggerRef.current = el as HTMLButtonElement | null;
            }}
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(true)}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav-drawer"
            aria-label="전체 메뉴 열기"
            className="shrink-0 rounded-lg bg-surface-04 text-primary hover:bg-[#ebebef]"
          >
            <Menu size={18} className="size-[1.125rem]" />
          </Button>
        </div>
      </div>

      {/* 좌표계 2(72.75rem 컨텐츠 영역): nav 5개. 2026-09-03부터 `<nav>` 자체를 메가 컬럼
          회색 밴드(아래)와 동일한 `position:fixed left-0 top-0 w-full`로 통일했다(좌측선
          어긋남 재조정, 아래 nav 태그 앞 주석 참고) — header의 `position:fixed`에 얹혀
          containing block을 물려받는 `absolute` 대신, nav도 뷰포트를 직접 기준 삼는 별도
          `fixed` 요소로 좌표계 1(로고/계정 그룹) 위에 겹쳐 그린다.
          바깥 두 겹(overlay, mx-auto 컨테이너)은 pointer-events-none이라 로고/계정 그룹 클릭을
          가리지 않고, 실제 nav 아이템을 감싸는 안쪽 div만 pointer-events-auto로 되살린다.
          상태 불변 nav 그리드: nav 아이템은 로그인/비로그인 상태와 무관하게 항상
          NAV_CELL_W(고정폭) + NAV_CELL_GAP(고정 간격)만 사용한다(과거 게스트 gap-5/로그인 gap-0
          토글로 인해 상태별 x 좌표가 달라지던 문제 제거) — 좌표계가 계정 그룹과 완전히
          분리돼 있어 이제는 이 원칙이 자연히 충족된다.
          0729 시안: 셀 100px 내부 좌측 정렬(justify-start) — 메가 컬럼과 좌측선을 공유한다
          (컬럼 정렬은 아래 메가 패널 컬럼 grid의 MEGA_GUARD/MEGA_COL_W 참고).
          데스크톱 인라인 nav 전환 시점(desktop: 브레이크포인트)은 90rem(nav 5칸 692px 고정 폭 +
          로고/계정 그룹 폭 기준 재산정, tailwind.config.js 주석 참고 — max-w-content와 더 이상
          동일 값이 아니다).
          겹침 재발 위험(2026-09-03, 계정 그룹 최대 폭 가정 — 학부모 로그인, 이름 5자 truncate
          상한+"…"+"님"+" 학부모회원"(§6-6) + D-day 배지 + chevron + 로그아웃 버튼, CSS
          박스모델 계산값 — 계정 그룹은 우측 정렬 shrink-0이라 nav 좌측 시작(NAV_GUARD)과는
          무관하고, nav 우측 끝(NAV_GUARD marginLeft + 5칸 고정폭 43.25rem)이 계정 그룹 좌측
          끝을 침범하는지만 본다. 텍스트 폭은 실측 폰트 렌더링이 아니라 CJK≈1em/글자 가정
          추정치라 오차가 있다 — 정확한 값은 커밋 보고에 산출 스크립트와 함께 남긴다):
            1440px: nav 우측 끝 x≈1034px, 계정 그룹 좌측 끝 추정 x≈1025px → 여유 ≈-10px
              (추정상 근소하게 겹칠 수 있음 — 오차범위 내라 확정은 아니나 QA327이 고치려던
              바로 그 좁은 구간이라 재발 가능성이 가장 높은 지점)
            1512px: nav 우측 끝 x≈1034px, 계정 그룹 좌측 끝 추정 x≈1093px → 여유 ≈+59px
            1920px: nav 우측 끝 x≈1102px, 계정 그룹 좌측 끝 추정 x≈1394px → 여유 ≈+292px
          (1440px 구간은 겹침 위험이 남아 있다 — 완화 방안은 코드로 임의 적용하지 않고
          커밋 보고에서 제안만 한다, 사용자 결정 대기.)
          2026-09-03 좌측선 재조정: 로고 가로형 교체(123e7e5a) 후 리드 실측 결과 nav 좌측 x와
          메가 컬럼 좌측 x가 어긋났다(1440~1680 −8px, 1920 −5px) — NAV_GUARD=MEGA_GUARD로 같은
          상수를 쓰는데도 실제로는 다르게 반응한 원인은 두 컨테이너의 포지셔닝 매커니즘 차이였다.
          이 `<nav>`는 `position:absolute`(가장 가까운 포지션드 조상 = `<header>`, 그 자체가
          fixed)였고, 메가 컬럼이 속한 아래쪽 회색 밴드는 `<header>`에 중첩된 별도의
          `position:fixed left-0 w-full` 요소였다 — 스펙상 두 방식 모두 결국 뷰포트(ICB)
          기준으로 귀결돼야 하지만, 중첩된 `fixed`가 그 조상 `fixed`를 containing block으로
          쓰는지 여부는 브라우저마다 처리가 갈릴 수 있는 지점이라(nested position:fixed 관련
          공지된 엔진 간 차이) absolute와 100% 동일하다고 보장할 수 없었다. "같은 상수를 쓰면
          당연히 정렬된다"는 구조적 가정 대신, 두 컨테이너의 포지셔닝 매커니즘 자체를
          `fixed left-0 top-0 w-full`로 완전히 통일해 계산식을 실제로 같게 만든다(아래
          `inset-x-0` 대신 메가 패널 wrapper와 동일한 `left-0 w-full` 표기로 맞췄다) — 1440
          /1512/1680/1920 재정렬 여부는 리드가 재실측한다. */}
      {/* `border-b border-transparent`가 시각적으로 아무 것도 그리지 않지만 빠지면 안
          된다 — `<header>`(위 주석)는 `border-box` 4rem 안에 `border-b`(1px)가 포함돼
          실제 내용 행이 63px인데, 이 `<nav>`는 테두리가 없어 `h-16`이 그대로 64px 내용
          행이 된다. 겹치는 `items-center`가 서로 다른 높이(64px vs 63px) 안에서 각자
          중앙 정렬돼 nav 라벨이 로고/계정 그룹 행보다 0.5px 아래로 보였다 — 투명
          테두리로 같은 1px을 내부로 밀어 넣어 두 행의 내용 높이(63px)를 실제로
          맞춘다. */}
      <nav className="pointer-events-none fixed left-0 top-0 hidden h-16 w-full border-b border-transparent desktop:block">
        <div className="pointer-events-none mx-auto flex h-full w-full max-w-content items-center px-8">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: 마우스 호버로 메가메뉴 닫힘 타이머를 관리하는 데스크톱 편의 동작 — 실제 nav 링크는 클릭·키보드 모두로 접근 가능하다. */}
          <div
            className="pointer-events-auto flex items-center"
            style={{ gap: NAV_CELL_GAP, marginLeft: NAV_GUARD }}
            onMouseEnter={clearMegaCloseTimer}
            onMouseLeave={scheduleMegaClose}
          >
            {navGroups.map((group) => {
              const hasDropdown =
                Array.isArray(group.items) && group.items.length > 0;
              const isPathActive = activePathTitle === group.title;
              const isOpenHighlight = activeMega === group.title;

              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: 마우스 호버로 메가메뉴를 여는 데스크톱 편의 동작 — 실제 nav 링크는 클릭·키보드 모두로 접근 가능하다.
                <div
                  key={group.title}
                  className="pointer-events-none relative flex shrink-0 items-center justify-start"
                  style={{ width: NAV_CELL_W }}
                  onMouseEnter={() => hasDropdown && setActiveMega(group.title)}
                >
                  {/* nav 아이템은 페이지 이동 없이 메가 패널 트리거 전용(사용자 확정) —
                      Link 제거, hover(부모 onMouseEnter)·keyboard focus·클릭 토글로만 패널을 연다.
                      hit 영역은 셀(NAV_CELL_W) 전폭이 아니라 버튼 콘텐츠 폭만(부모 justify-start로
                      셀 좌측에 고정, 메가 컬럼과 동일 좌측선 공유) — 셀의 나머지 빈 공간(이 div)은
                      pointer-events-none으로 통과시켜, 셀이 우측 계정 그룹(배지 등)과 겹치는
                      뷰포트 구간에서도 nav가 그 영역의 hover/클릭을 가로채지 않게 한다. */}
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={activeMega === group.title}
                    aria-current={isPathActive ? "page" : undefined}
                    onFocus={() => {
                      clearMegaCloseTimer();
                      hasDropdown && setActiveMega(group.title);
                    }}
                    onClick={() => {
                      clearMegaCloseTimer();
                      hasDropdown &&
                        setActiveMega((prev) =>
                          prev === group.title ? null : group.title,
                        );
                    }}
                    className={`pointer-events-auto cursor-default whitespace-nowrap py-4 text-base leading-[1.4] tracking-[-0.02em] transition ${
                      isPathActive || isOpenHighlight
                        ? "font-semibold text-primary"
                        : isMegaPanelOpen
                          ? "font-medium text-ink"
                          : "font-medium text-ink-header"
                    }`}
                  >
                    {group.title}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </nav>

      {/* 메가 딤+패널은 activeMega 조건부 마운트 대신 상시 마운트(always-mounted) 후 상태
          클래스로 open/closing/closed 3-phase를 토글한다(megaPanelPhase, 위 effect 참고).
          조건부 마운트는 클로즈 애니메이션이 불가능하고(언마운트 즉시 사라짐), 마운트 직후
          클래스를 바로 여는 첫 프레임에 트랜지션이 발화하지 않을 위험이 있어 폐기했다 —
          항상 DOM에 상주(opacity-0 + invisible + pointer-events-none)시켜 두 문제를 모두 해소한다. */}

      {/* 헤더+메가패널 아래 전체를 어둡게 dim 처리. 패널(z-50, 불투명)이 위에 그려져
            패널이 차지하는 영역만 자연히 dim이 가려지므로 패널 높이를 따로 측정할 필요가 없다.
            오픈 200ms / 클로즈 120ms 모두 opacity만(이동 없음), ease-out-quart(프로젝트 표준
            이징 — MobileNavDrawer의 ease-(--ease-out-quart) 관례를 그대로 따른다). */}
      <div
        className={`fixed inset-x-0 top-16 bottom-0 z-40 hidden bg-black/30 desktop:block motion-reduce:transition-none motion-reduce:duration-0 ${
          isMegaPanelOpen
            ? "visible opacity-100 pointer-events-auto transition-opacity duration-200 ease-(--ease-out-quart)"
            : isMegaPanelClosing
              ? "visible opacity-0 pointer-events-none transition-opacity ease-(--ease-out-quart)"
              : "invisible opacity-0 pointer-events-none"
        }`}
        style={
          isMegaPanelClosing
            ? { transitionDuration: `${MEGA_PANEL_CLOSING_MS}ms` }
            : undefined
        }
        onClick={() => setActiveMega(null)}
        aria-hidden="true"
      />

      <div
        className={`fixed left-0 top-16 z-50 hidden w-full border-b border-black/5 bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)] desktop:block motion-reduce:transition-none motion-reduce:duration-0 ${
          isMegaPanelOpen
            ? "visible opacity-100 translate-y-0 pointer-events-auto transition-all duration-180 ease-(--ease-out-quart)"
            : isMegaPanelClosing
              ? "visible opacity-0 translate-y-0 pointer-events-none transition-all ease-(--ease-out-quart)"
              : "invisible opacity-0 -translate-y-2 pointer-events-none"
        }`}
        style={
          isMegaPanelClosing
            ? { transitionDuration: `${MEGA_PANEL_CLOSING_MS}ms` }
            : undefined
        }
        aria-hidden={!isMegaPanelOpen}
        onMouseEnter={clearMegaCloseTimer}
        onMouseLeave={scheduleMegaClose}
      >
        {/* 2026-09-03 좌측선 재조정(2차): 컬럼(좌표계 2)과 회색존(좌표계 1, 프로모 카드 또는
                MY 컬럼)을 같은 grid cell(col-start-1 row-start-1)에 겹쳐 그리던 구조를
                버렸다 — 실측 결과 컬럼 wrapper의 mx-auto가 nav의 mx-auto(순수 block 흐름)와
                다르게 8px(1440~1680)/5px(1920) 비대칭으로 어긋났는데, 원인은 CSS Grid에서
                margin:auto가 "실제 마진"이 아니라 grid 정렬(auto-margin alignment)로 처리되고,
                같은 셀에 겹친 회색존 형제(그 자체도 grid item)가 implicit 컬럼 트랙의
                크기/정렬 기준에 영향을 줘 두 아이템의 auto-margin 결과가 서로 달라졌기
                때문으로 추정된다(브라우저 실측 기반). 컬럼 wrapper를 grid item에서 완전히
                빼서 nav와 동일하게 순수 block 흐름의 mx-auto(항상 대칭 centering이 보장되는
                유일한 CSS 메커니즘)로 되돌리고, 회색존은 absolute로 분리해 컬럼의 흐름/폭
                계산에 전혀 관여하지 못하게 한다. "패널 자연 높이(hug)"는 이제 grid 겹침이
                아니라 이 wrapper의 `minHeight: GREY_ZONE_H`(회색존과 동일 상수, 파일 상단
                주석 참고)로 직접 보장한다 — 회색존 높이가 이미 로그인/게스트 공용 고정값이라
                더 이상 "더 큰 레이어가 자연 높이를 결정"할 필요가 없다(그 필요 자체가
                사라져 grid 겹침이라는 수단도 함께 폐기했다). */}
        <div className="relative" style={{ minHeight: GREY_ZONE_H }}>
          {/* (QA 행327 재작업 이후) 메가 컬럼은 여전히 옛 좌표계 2(72.75rem 컨텐츠 영역,
                  mx-auto max-w-content px-8 + MEGA_GUARD marginLeft)를 그대로 쓴다 — 위 nav
                  행은 고정폭 셀에서 텍스트 자연폭 + 반응형 gap으로 바뀌었지만(return 블록 헤더
                  주석 참고), 2026-09-03 사용자 결정(B안)으로 nav·메가 컬럼 얼라인을 dev 정본
                  방식(NAV_GUARD/MEGA_GUARD 좌측선 공유, navigation.ts 상단 주석)으로 되돌려
                  "컬럼 0의 시작 x = nav 셀 0의 텍스트 시작 x"가 다시 보장된다(피치 148px 공유,
                  6.25rem+3rem=8.75rem+0.5rem). 위 grid-분리 조치로 이 wrapper는 이제 nav의
                  `mx-auto max-w-content px-8` 체인과 포지셔닝 매커니즘까지 완전히 동일하다
                  (둘 다 순수 block 흐름 — nav는 fixed 조상 안의 block, 이쪽은 relative 조상
                  안의 block, 어느 쪽도 grid item이 아니다).
                  컬럼 제목은 신규 시안(header-footer-figma-2026-09.md §2)대로 유지한다 —
                  이전엔 nav 아이템과 중복돼 제거했었으나 이번 시안은 제목을 명시적으로
                  요구한다: 14px SemiBold #808080(text-ink-natural) tracking -0.02em
                  leading-5, 제목-아이템 gap 20px(mt-5). 아이템은 14px
                  Medium #525252(text-ink), 아이템 간 gap 16px(gap-4). */}
          <div className="mx-auto w-full max-w-content px-8 py-6">
            <div
              className="grid"
              style={{
                marginLeft: MEGA_GUARD,
                gridTemplateColumns: `repeat(5, ${MEGA_COL_W})`,
                columnGap: MEGA_COL_GAP,
              }}
            >
              {navGroups.map((group) => (
                <div key={`mega-col-${group.title}`} className="flex flex-col">
                  <p className="text-sm font-semibold leading-5 tracking-[-0.02em] text-ink-natural">
                    {group.title}
                  </p>
                  <div className="mt-5 flex flex-col gap-4">
                    {group.items.map((item) => {
                      const isItemActive = item.to === pathname;
                      return (
                        <Link
                          key={`mega-${group.title}-${item.to}-${item.label}`}
                          to={item.to}
                          onClick={() => setActiveMega(null)}
                          aria-current={isItemActive ? "page" : undefined}
                          className={`break-keep text-sm leading-5 transition hover:text-primary ${
                            isItemActive
                              ? "font-semibold text-primary"
                              : "font-medium text-ink"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 좌표계 1(1920 밴드): 회색 존 + (게스트) 프로모 카드 또는 (로그인) 6번째 MY 컬럼
                  (§6-4 사용자 결정 — 로그인 시 프로모 카드 대신 MY 메뉴가 회색존 안에 들어간다,
                  회색존 자체는 로그인 여부와 무관하게 항상 유지). 헤더 Band 1(로고+계정 그룹)과
                  동일한 mx-auto max-w-[120rem] 축을 공유한다. 2026-09-03 좌측선 재조정(2차)으로
                  더 이상 컬럼 레이어와 grid cell을 공유하지 않는다 — absolute(inset-x-0 top-0)로
                  분리해 컬럼 wrapper의 mx-auto/폭 계산에 전혀 영향을 주지 않는다(위 grid-분리
                  주석 참고). absolute 자체의 중앙 정렬(left:0/right:0 + max-w-[120rem] +
                  margin:auto)은 CSS 2.1의 "over-constrained 절대배치 auto margin 균등분배"
                  규칙으로, grid auto-margin 정렬과 달리 다른 형제와 트랙을 공유하지 않는 단독
                  메커니즘이라 안정적이다. 바깥 겹은 pointer-events-none이라 컬럼 클릭을
                  가리지 않고, 안쪽 콘텐츠만 pointer-events-auto로 되살린다(헤더 nav 오버레이와
                  동일한 기법). */}
          <div
            ref={zoneBandRef}
            className="pointer-events-none absolute inset-x-0 top-0 mx-auto w-full max-w-[120rem]"
          >
            {showMegaMyColumn ? (
              // 로그인 회색존(2026-09-03 사용자 결정) — 좌측 x를 계정 그룹(D-day 배지) 좌측
              // x에 유동적으로 맞춘다(고정 28rem 폭 폐기, 위 accountGroupRef/zoneBandRef +
              // useLayoutEffect 주석 참고). myZoneRect가 아직 측정 전(첫 페인트 찰나)이면
              // 게스트 존과 동일한 ml-auto+GREY_ZONE_W로 폴백해 레이아웃이 순간적으로
              // 무너지지 않게 한다. 높이는 GREY_ZONE_H로 게스트와 동일하게 고정해 패널
              // 높이가 상태 전환에도 변하지 않는다. 색상 #f9fafb는 Figma 1483:846 실측값.
              // 상단 패딩만 pt-6(1.5rem)로 다른 5개 컬럼의 py-6과 맞춘다 — MY 컬럼 첫
              // 항목("MY페이지")이 빈 제목 줄 없이 바로 다른 컬럼 제목 행과 같은 y에서
              // 시작하게 하기 위함(좌/우/하단은 계정 그룹 축 기준 p-10=2.5rem 유지).
              <div
                className="pointer-events-none bg-surface-footer pt-6 pr-10 pb-10 pl-10"
                style={
                  myZoneRect
                    ? {
                        marginLeft: `${myZoneRect.marginLeft}px`,
                        width: `${myZoneRect.width}px`,
                        height: GREY_ZONE_H,
                      }
                    : {
                        marginLeft: "auto",
                        width: GREY_ZONE_W,
                        height: GREY_ZONE_H,
                      }
                }
              >
                {/* 6번째 MY 컬럼(시안 §2 "로그인된" variant, w 120px). 빈 제목 줄은
                    제거했다(위 존 pt-6 주석 참고) — 항목이 곧 컬럼의 첫 콘텐츠다. */}
                <div
                  className="pointer-events-auto flex flex-col gap-4"
                  style={{ width: "7.5rem" }}
                >
                  {myMenuItems.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => setActiveMega(null)}
                      className="break-keep text-sm font-medium leading-5 text-ink transition hover:text-primary"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              // 게스트 회색존: 변경 없음(2026-09-03 사용자 결정 — 게스트 상태는 그대로 둔다).
              // 카드(MEGA_PROMO_W)를 상하좌우 동일한 2.5rem(p-10) 패딩으로 감싸는 고정
              // 크기(GREY_ZONE_W×GREY_ZONE_H) 박스. ml-auto로 밴드 래퍼 바깥쪽 우측 끝
              // (패딩 이전)에 붙인다 — 뷰포트가 120rem(1920px)을 넘으면 밴드 자체가 중앙
              // 정렬되며 캡 안쪽에 서므로 존 우측 끝은 항상 밴드 우측 끝과 일치한다.
              // translateX(0.5rem): 존 박스의 p-10(2.5rem)은 헤더 Band 1(px-8=2rem)보다
              // 0.5rem(8px) 두꺼워 카드 우측 끝이 계정 그룹 우측 끝보다 8px 안쪽에 있었다 —
              // 박스 자체의 우측 기준점만 8px 우측으로 옮겨 계정 그룹 축에 맞춘다(로그인
              // 존의 ZONE_RIGHT_NUDGE_PX=8과 같은 보정, 위 useLayoutEffect 주석 참고).
              <div
                className="pointer-events-none ml-auto bg-surface-footer p-10"
                style={{
                  width: GREY_ZONE_W,
                  height: GREY_ZONE_H,
                  transform: "translateX(0.5rem)",
                }}
              >
                {/* 프로모 카드: 콘텐츠 하드코딩(MEGA_PROMO_GUEST). 추후 admin에서 편집 가능한
                    배너로 전환 후보. 0.8 컴팩트 스케일(파일 상단 MEGA_PROMO_W 주석 참고) —
                    카드 23rem, p-[1.6rem], gap-[1.6rem], rounded-[1.2rem], 타이틀
                    text-[1.3rem] Bold, 서브 text-[0.9rem] Medium, 이미지 프레임
                    14.1rem×9.4rem, CTA px-[3rem] py-[1.2rem] rounded-2xl text-base
                    SemiBold. 쉐도우는 기존 3중 그림자 유지(DROP_SHADOW 0/4/16
                    rgba(0,0,0,.06) + inset 하이라이트 2종). */}
                <div
                  className="pointer-events-auto relative shrink-0 rounded-[1.2rem] bg-white p-[1.6rem] shadow-[0px_4px_16px_rgba(0,0,0,0.06)]"
                  style={{ width: MEGA_PROMO_W }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0px_4px_4px_0px_rgba(255,255,255,0.24),inset_0px_-0.9px_0px_0px_rgba(0,0,0,0.04)]"
                    aria-hidden="true"
                  />
                  <div className="flex flex-col gap-2">
                    <p className="text-[1.3rem] font-bold leading-[1.3] tracking-[-0.026rem] text-ink">
                      {megaPromo.title}
                    </p>
                    <p className="break-keep text-[0.9rem] font-medium leading-[1.4] text-ink">
                      {megaPromo.subtitleLines[0]}
                      <br />
                      {megaPromo.subtitleLines[1]}
                    </p>
                  </div>

                  <div className="relative mx-auto mt-[1.6rem] h-[9.4rem] w-[14.1rem] overflow-hidden">
                    <img
                      src={megaPromo.image}
                      alt=""
                      className="absolute left-0 w-full max-w-none object-cover"
                      style={{ height: "120.21%", top: "-10.64%" }}
                    />
                  </div>

                  <Link
                    to={megaPromo.ctaTo}
                    onClick={() => setActiveMega(null)}
                    className="mt-[1.6rem] flex items-center justify-center whitespace-nowrap rounded-2xl bg-primary px-[3rem] py-[1.2rem] text-base font-semibold text-white transition hover:bg-[#012347]"
                  >
                    {megaPromo.ctaLabel}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        navGroups={navGroups}
        shouldShowLoggedInHeader={shouldShowLoggedInHeader}
        isLoggedIn={isLoggedIn}
        displayName={displayName}
        memberLabel={memberLabel}
        myMenuRole={myMenuRole}
        csatDDay={csatDDay}
        onLogout={handleLogout}
        triggerRef={mobileNavTriggerRef}
        activeGroupTitle={activePathTitle}
      />
    </header>
  );
}
