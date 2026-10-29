import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import AcceptanceSection from "@/components/landing/AcceptanceSection";
import HeroSection from "@/components/landing/HeroSection";
import MentorSection from "@/components/landing/MentorSection";
import NewsSection from "@/components/landing/NewsSection";
import ServicesSection from "@/components/landing/ServicesSection";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as landingPreview from "@/data/landingPreview";
import type { NormalizedMentor } from "@/hooks/useHomeMentors";
import { useHomeMentors } from "@/hooks/useHomeMentors";
import { supabase } from "@/lib/supabase";

// 랜딩 콘텐츠(배너/대학/서비스/멘토): Supabase DB fetch 모드 (LANDING_PREVIEW=false).
// true로 되돌리면 ../data/landingPreview 정적 픽스처로 렌더 (로컬 프리뷰 전용 스위치).
// fetch 실패 시 각 섹션은 빈 배열 폴백으로 미렌더 처리 — 픽스처 자동 폴백은 없음.
// 공지사항 섹션(company_news/notices)은 이 플래그와 무관하게 항상 DB 연동.
const LANDING_PREVIEW = false;
const NEWS_SECTION_PREVIEW_COUNT = 5;

type Banner = {
  // banners.id는 실제로 bigint PK지만(uuid가 아니다) HeroSection.MainBanner의
  // React key 계약에 맞춰 fetchBanners()가 문자열로 변환해 담는다.
  id?: string;
  title?: string;
  highlight?: string | null;
  // 조회 직후 아래 fetchBanners()가 image_url이 있는 행만 남기므로 렌더
  // 시점엔 항상 값이 있다(HeroSection.MainBanner도 같은 계약).
  image_url: string;
  button_text?: string | null;
  button_link?: string | null;
  link_url?: string;
  sort_order?: number | null;
  is_active?: boolean | null;
  display_seconds?: number | null;
};

type SideBanner = {
  id?: string;
  title?: string;
  subtitle?: string;
  image_url?: string;
  mobile_image_url?: string;
  link_url?: string;
  open_new_window?: boolean;
  sort_order?: number;
};

type University = {
  id: string;
  name: string;
  emblem_url?: string;
  subtitle?: string;
  count?: number | null;
  // "graduate" 는 대학원입학 프리미엄 랜딩(PremiumAcceptanceMarquee) 전용 트랙 — 홈 화면
  // AcceptanceSection 은 general/medical_special 두 탭만 다뤄 graduate 행은 그대로 걸러진다.
  track: "general" | "medical_special" | "graduate";
  sort_order?: number;
};

type Service = {
  id: string;
  name: string;
  description?: string;
  link?: string;
  icon?: string;
  icon_image_url?: string;
  sort_order?: number;
  is_premium?: boolean;
};

type Popup = {
  id: string;
  title?: string;
  url?: string;
  image_url?: string;
  mobile_image_url?: string;
  open_new_window?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

type NewsItem = {
  id: string;
  title: string;
  created_at: string;
  category?: string | null;
  sort_order?: number;
  is_pinned?: boolean | null;
};

function preloadImage(src: string | undefined): Promise<string> {
  if (!src) return Promise.resolve("");

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function todayKstYmd() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// 동시 노출 상한. 어드민 팝업 관리 guideText("동시 노출: 최대 3개")와 맞춘다.
// sort_order 상위 3장만 후보가 되며, 그 밖의 행은 누구에게도 노출되지 않는다.
const MAX_VISIBLE_POPUPS = 3;

function getHiddenPopupIds(): Record<string, string> {
  try {
    const saved = localStorage.getItem("hiddenPopupIds");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function setHiddenPopupToday(id: string) {
  try {
    const today = todayKstYmd();
    const saved = getHiddenPopupIds();
    saved[id] = today;
    localStorage.setItem("hiddenPopupIds", JSON.stringify(saved));
  } catch {
    // localStorage 사용 불가 환경에서는 무시
  }
}

function HomePopupLayer({
  popups,
  onClose,
  onCloseToday,
  onCloseAll,
}: {
  popups: Popup[];
  onClose: (id: string) => void;
  onCloseToday: (id: string) => void;
  onCloseAll: () => void;
}) {
  // popups는 fetch 단계에서 이미 상위 MAX_VISIBLE_POPUPS장으로 잘려 들어온다.
  // 여기서 다시 자르지 않는다 — 카드가 닫혀도 대기열에서 다음 장이 올라오지 않는다.
  const visible = popups;

  function handleOpenChange(next: boolean) {
    if (next) return;
    // ESC/딤 클릭은 화면의 카드를 한꺼번에 전부 닫는다. 카드 안의 X·오늘 하루
    // 보지 않기 버튼만 개별 닫기다.
    onCloseAll();
  }

  // Popup이 `fixed inset-0`으로 뷰포트 전체를 덮으므로(카드가 3장까지 가로로
  // 늘어서고 세로 스크롤도 여기서 담당), 딤 영역 클릭이 Base UI 기준으로는
  // "팝업 안쪽" 클릭이라 outside-press로 잡히지 않는다(실측). 카드 밖을 눌렀을 때만
  // ESC와 같은 전체 닫기를 직접 태운다 — 카드 안(이미지 링크·버튼)은 제외.
  function handleDimClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-popup-card]")) return;
    handleOpenChange(false);
  }

  return (
    <Dialog open={visible.length > 0} onOpenChange={handleOpenChange}>
      <DialogPortal>
        {/* 오버레이 색·블러는 shadcn 기본값 그대로. z-index만 Popup과 맞춘다. */}
        <DialogOverlay className="z-9999" />
        <DialogPrimitive.Popup
          aria-label="공지 팝업"
          className="fixed inset-0 z-9999 outline-none"
          onClick={handleDimClick}
        >
          <ScrollArea className="h-full w-full px-4 py-6">
            <div className="mx-auto flex min-h-full w-full max-w-[92.5rem] items-center justify-center gap-5">
              <div className="flex w-full flex-wrap items-center justify-center gap-5">
                {visible.map((popup) => {
                  const imageSrc = popup.image_url || popup.mobile_image_url;
                  const Wrapper = popup.url ? "a" : "div";
                  const wrapperProps = popup.url
                    ? {
                        href: popup.url,
                        target: popup.open_new_window ? "_blank" : "_self",
                        rel: popup.open_new_window ? "noreferrer" : undefined,
                      }
                    : {};

                  return (
                    <div
                      key={popup.id}
                      data-popup-card=""
                      className="flex w-[clamp(20rem,28vw,27.5rem)] shrink-0 flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-[0_1.75rem_5.625rem_rgba(0,0,0,0.36)]"
                    >
                      <Wrapper
                        // biome-ignore lint/suspicious/noExplicitAny: Wrapper는 'a' | 'div' 중 런타임에 결정되는 태그명이라 각 태그 전용 props(href/target/rel)를 하나의 정적 타입으로 표현할 수 없다.
                        {...(wrapperProps as any)}
                        className="block aspect-3/4 w-full overflow-hidden bg-white"
                      >
                        <picture>
                          {popup.mobile_image_url && (
                            <source
                              media="(max-width: 48rem)"
                              srcSet={popup.mobile_image_url}
                            />
                          )}
                          <img
                            src={imageSrc}
                            alt={popup.title || "팝업"}
                            className="h-full w-full object-contain"
                          />
                        </picture>
                      </Wrapper>

                      <div className="flex h-[3.875rem] shrink-0 items-center justify-between border-t border-slate-100 bg-white px-5">
                        <button
                          type="button"
                          onClick={() => onCloseToday(popup.id)}
                          className="inline-flex items-center gap-2 text-[0.9375rem] font-bold text-[#0D1B2A]"
                        >
                          <span className="text-[1.375rem] leading-none text-blue-500">
                            ✓
                          </span>
                          오늘 하루 보지않기
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onClose(popup.id)}
                            className="text-[0.9375rem] font-bold text-[#111827]"
                          >
                            닫기
                          </button>
                          <button
                            type="button"
                            onClick={() => onClose(popup.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-sm font-black text-white"
                            aria-label="팝업 닫기"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

export default function Home() {
  const [banners, setBanners] = useState<Banner[]>(
    LANDING_PREVIEW ? (landingPreview.banners as Banner[]) : [],
  );
  const [heroReady, setHeroReady] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [sideBanners, setSideBanners] = useState<SideBanner[]>(
    // landingPreview 픽스처의 subtitle/link_url 등은 null 리터럴이라 SideBanner(undefined 허용)와
    // 구조적으로 충분히 겹치지 않는다 — 프리뷰 전용 데이터 캐스팅이라 unknown 경유로 좁힌다.
    LANDING_PREVIEW
      ? (landingPreview.sideBanners as unknown as SideBanner[])
      : [],
  );
  const [universities, setUniversities] = useState<University[]>(
    LANDING_PREVIEW ? (landingPreview.universities as University[]) : [],
  );
  const [services, setServices] = useState<Service[]>(
    LANDING_PREVIEW ? (landingPreview.services as Service[]) : [],
  );
  // 멘토 fetch+정규화는 useHomeMentors로 추출됨(프리미엄 랜딩 섹션 9와 공유) — LANDING_PREVIEW일
  // 때는 기존과 동일하게 정적 픽스처를 쓰고, 아니면 훅이 마운트 시 자체 fetch한다(enabled 가드로
  // LANDING_PREVIEW 중에는 fetch 자체를 건너뛰어 기존 동작과 100% 동일).
  const { mentors: fetchedMentors } = useHomeMentors({
    enabled: !LANDING_PREVIEW,
  });
  const mentors = LANDING_PREVIEW
    ? (landingPreview.mentors as NormalizedMentor[])
    : fetchedMentors;
  // 공지사항 섹션(회사소식/공지사항)은 실 Supabase DB 연동 완료 — 프리뷰 대상 아님.
  const [companyNews, setCompanyNews] = useState<NewsItem[]>([]);
  const [notices, setNotices] = useState<NewsItem[]>([]);

  useEffect(() => {
    if (LANDING_PREVIEW) return undefined;

    let mounted = true;

    async function fetchBanners() {
      const { data, error } = await supabase
        .from("banners")
        .select(
          "id, title, highlight, image_url, button_text, button_link, sort_order, is_active, display_seconds",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("배너 조회 오류:", error);
        setBanners([]);
        return;
      }

      // image_url이 없는 행은 배너로 렌더할 수 없어 걸러낸다 — 타입 서술어로
      // 걸러야 남은 Banner[]가 image_url: string(non-null) 계약을 지킨다
      // (그냥 as Banner[] 캐스트는 실제 image_url: string | null과 겹치지
      // 않아 TS2352로 거부된다).
      const normalized = (data || [])
        .filter((item): item is typeof item & { image_url: string } =>
          Boolean(item.image_url),
        )
        // HeroSection.MainBanner.id는 string 계약이라(React key 용) bigint PK를
        // 문자열로 맞춘다.
        .map((item) => ({ ...item, id: String(item.id) }));
      setBanners(normalized);
    }

    fetchBanners();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (LANDING_PREVIEW) return undefined;

    let mounted = true;

    async function fetchServices() {
      const { data, error } = await supabase
        .from("program_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("서비스 조회 오류:", error);
        setServices([]);
        return;
      }

      setServices((data || []) as Service[]);
    }

    fetchServices();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function fetchPopups() {
      const today = todayKstYmd();
      const { data, error } = await supabase
        .from("popups")
        .select(
          "id, title, url, image_url, mobile_image_url, open_new_window, start_date, end_date, sort_order, is_active",
        )
        .eq("is_active", true)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("팝업 조회 오류:", error);
        setPopups([]);
        return;
      }

      const hidden = getHiddenPopupIds();
      // 상위 3장을 먼저 확정한 뒤 "오늘 하루 보지 않기"를 뺀다. 순서를 바꾸면
      // 사용자가 1장 숨긴 날 4번째 행이 올라와 어드민 가이드(최대 3개)와 어긋난다.
      const visiblePopups = ((data || []) as Popup[])
        .filter((popup) => popup.image_url || popup.mobile_image_url)
        .slice(0, MAX_VISIBLE_POPUPS)
        .filter((popup) => hidden[popup.id] !== today);

      setPopups(visiblePopups);
    }

    fetchPopups();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (LANDING_PREVIEW) return undefined;

    let mounted = true;

    async function fetchRenewalContents() {
      const today = todayKstYmd();
      const [sideResult, universityResult] = await Promise.all([
        supabase
          .from("home_side_banners")
          .select("*")
          .eq("is_active", true)
          .or(`start_date.is.null,start_date.lte.${today}`)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order("sort_order", { ascending: true }),
        supabase
          .from("university_acceptances")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);

      if (!mounted) return;

      if (sideResult.error) {
        console.error("우측 배너 조회 오류:", sideResult.error);
        setSideBanners([]);
      } else {
        const visible = ((sideResult.data || []) as SideBanner[]).filter(
          (item) => item.image_url || item.mobile_image_url,
        );
        setSideBanners(visible);
      }

      if (universityResult.error) {
        // 테이블 미생성/조회 실패 시 섹션 미렌더 fallback
        console.error("합격생 대학 조회 오류:", universityResult.error);
        setUniversities([]);
      } else {
        setUniversities((universityResult.data || []) as University[]);
      }
    }

    fetchRenewalContents();

    return () => {
      mounted = false;
    };
  }, []);

  // 공지사항 섹션(회사소식/공지사항) — 실 Supabase DB 연동. LANDING_PREVIEW 가드 대상 아님.
  useEffect(() => {
    let mounted = true;

    async function fetchNewsSectionContents() {
      const [companyResult, noticeResult] = await Promise.all([
        supabase
          .from("company_news")
          .select("id, title, created_at, is_pinned, sort_order, category")
          .eq("is_active", true)
          .order("is_pinned", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(NEWS_SECTION_PREVIEW_COUNT),
        supabase
          .from("notices")
          .select("id, title, created_at, is_pinned, sort_order, category")
          .eq("is_active", true)
          .order("is_pinned", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(NEWS_SECTION_PREVIEW_COUNT),
      ]);

      if (!mounted) return;

      if (companyResult.error) {
        console.error("회사소식 조회 오류:", companyResult.error);
        setCompanyNews([]);
      } else {
        setCompanyNews((companyResult.data || []) as NewsItem[]);
      }

      if (noticeResult.error) {
        console.error("공지사항 미리보기 조회 오류:", noticeResult.error);
        setNotices([]);
      } else {
        setNotices((noticeResult.data || []) as NewsItem[]);
      }
    }

    fetchNewsSectionContents();

    return () => {
      mounted = false;
    };
  }, []);

  // 페이지 reveal(첫 배너 이미지 + 폰트 준비) — 히어로 첫 진입 렌더 안정용
  const heroRevealedRef = useRef(false);

  useEffect(() => {
    if (heroRevealedRef.current) return undefined;

    let mounted = true;

    async function prepareHero() {
      const fontReady = document.fonts?.ready || Promise.resolve();
      const firstImage = banners[0]?.image_url;
      await Promise.all([preloadImage(firstImage), fontReady]);

      if (mounted) {
        heroRevealedRef.current = true;
        setHeroReady(true);
      }
    }

    prepareHero();

    return () => {
      mounted = false;
    };
  }, [banners]);

  function closePopup(id: string) {
    setPopups((prev) => prev.filter((popup) => popup.id !== id));
  }

  function closePopupToday(id: string) {
    setHiddenPopupToday(id);
    closePopup(id);
  }

  function closeAllPopups() {
    setPopups([]);
  }

  return (
    <>
      <HomePopupLayer
        popups={popups}
        onClose={closePopup}
        onCloseToday={closePopupToday}
        onCloseAll={closeAllPopups}
      />

      <main
        className={`min-h-screen bg-white pt-16 text-[#0D1B2A] transition-opacity duration-500 ${
          heroReady ? "opacity-100" : "opacity-0"
        }`}
      >
        {(banners.length > 0 || sideBanners.length > 0) && (
          <HeroSection
            // HeroSection.MainBanner.button_link/sort_order는 exactOptionalPropertyTypes
            // 하에서 null도, 명시적 undefined 값도 못 받는 optional 필드(생략만 허용)라
            // 값이 있을 때만 키를 스프레드한다(state 자체는 DB 값 그대로 유지). sort_order는
            // HeroSection이 실제로 읽지 않는 필드라(정렬은 조회 쿼리가 이미 끝냄) 아예 뺀다.
            banners={banners.map(({ button_link, sort_order: _s, ...b }) => ({
              ...b,
              ...(button_link ? { button_link } : {}),
            }))}
            sideBanners={sideBanners}
          />
        )}

        {services.length > 0 && <ServicesSection services={services} />}

        {universities.length > 0 && (
          <AcceptanceSection universities={universities} />
        )}

        {mentors.length > 0 && <MentorSection mentors={mentors} />}

        {/* 공지사항 섹션: 실 DB(company_news/notices) 기준 — 0건이어도 항상 렌더, 컬럼별 빈 상태 문구 표시 */}
        <NewsSection companyNews={companyNews} notices={notices} />
      </main>
    </>
  );
}
