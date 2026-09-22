import { ChevronDown, LogOut, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { useNavGroups } from "@/hooks/useNavGroups";
import { useSignupEnabled } from "@/hooks/useSignupEnabled";
import { buildMyMenu, type MyMenuRole } from "./myMenuItems";

type NavGroups = ReturnType<typeof useNavGroups>;

type MobileNavDrawerProps = {
  open: boolean;
  onClose: () => void;
  navGroups: NavGroups;
  shouldShowLoggedInHeader: boolean;
  isLoggedIn: boolean;
  displayName: string;
  memberLabel: string;
  myMenuRole: MyMenuRole;
  csatDDay: string;
  onLogout: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  // 현재 경로가 속한 nav 그룹 타이틀 — Header의 activePathTitle(정확 일치 → 첫 세그먼트
  // 2단계 판정)을 그대로 받아 데스크톱 nav와 활성 표시 기준을 일치시킨다.
  activeGroupTitle?: string | null;
};

// 헤더 햄버거(전체메뉴) 버튼으로 여는 전체화면 드로어. 모바일 전용이 아니라 데스크톱에서도
// nav 5개 메뉴와 병행 노출된다(전체메뉴 버튼 클릭 시 뷰포트 무관하게 항상 열린다).
// 5개 nav 그룹 + 로그인 상태의 마이페이지/관리자/로그아웃(또는 로그인/회원가입)을 아코디언으로 노출한다.
//
// shadcn Sheet(ui/sheet.tsx, base-ui Dialog 기반) 위에 구성한다. ESC 닫기·포커스 트랩·배경
// 스크롤 잠금은 Sheet 내장 동작이 처리한다. 트리거(헤더 햄버거 버튼)가 SheetTrigger가 아니라
// 별도 ref로 넘어오므로, 닫힐 때 포커스 복귀 대상은 SheetContent의 finalFocus로 명시한다.
// open/onOpenChange는 Header가 소유하는 controlled 컴포넌트다.
//
// **닫힘 애니메이션이 계약이다.** Base UI Popup은 CSS 트랜지션이 걸린 요소를 감지하면
// 닫힘 시에도 트랜지션이 끝날 때까지 DOM에서 내리지 않는다. ui/sheet.tsx의 기본 SheetContent
// 스타일(작은 opacity 페이드 + 2.5rem 넛지)은 이 드로어의 계약(전체 폭만큼 완전히 슬라이드
// 아웃)과 다르므로, data-open/data-closed(영속 상태)와 data-starting-style/data-ending-style
// (전환 시작·종료 프레임) 양쪽 모두에 translate-x-full을 걸어 어느 쪽이 실제로 적용되든 동일한
// 풀 슬라이드가 재현되도록 className으로 덮어쓴다. opacity 페이드는 0으로 두지 않도록
// data-starting-style/data-ending-style에 opacity-100을 강제해, 슬라이드만 보이게 한다.
export default function MobileNavDrawer({
  open,
  onClose,
  navGroups,
  shouldShowLoggedInHeader,
  isLoggedIn,
  displayName,
  memberLabel,
  myMenuRole,
  csatDDay,
  onLogout,
  triggerRef,
  activeGroupTitle = null,
}: MobileNavDrawerProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const { pathname } = useLocation();
  // 가입 오픈 여부(app_settings.signup_enabled) — false/로딩 중(null)이면
  // 회원가입 CTA를 숨긴다(Header.tsx와 동일 원칙).
  const signupEnabled = useSignupEnabled();

  useEffect(() => {
    if (!open) {
      setOpenGroup(null);
    }
  }, [open]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        // Header의 햄버거 버튼이 aria-controls="mobile-nav-drawer"로 이 패널을
        // 가리킨다 — Base UI가 자동 부여하는 useId 대신 이 고정 id를 유지해야 한다.
        id="mobile-nav-drawer"
        side="right"
        showCloseButton={false}
        finalFocus={triggerRef}
        aria-modal="true"
        overlayClassName="bg-black/40 duration-100"
        className="z-60 gap-0 rounded-none border-none bg-white p-0 shadow-[-18px_0_45px_rgba(13,27,42,0.14)] outline-none transition-transform duration-300 ease-(--ease-out-quart) motion-reduce:transition-none motion-reduce:duration-0 data-open:translate-x-0 data-closed:translate-x-full data-starting-style:opacity-100 data-ending-style:opacity-100 data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-[85vw] data-[side=right]:max-w-88 data-[side=right]:border-l-0 data-[side=right]:data-starting-style:translate-x-full data-[side=right]:data-ending-style:translate-x-full data-[side=right]:sm:max-w-88"
      >
        <SheetHeader className="shrink-0 flex-row items-center justify-between gap-0 space-y-0 border-b border-[#eeeeee] px-6 py-5">
          <SheetTitle className="sr-only">
            {shouldShowLoggedInHeader
              ? `${displayName}님${memberLabel ? ` ${memberLabel}` : ""}`
              : "전체 메뉴"}
          </SheetTitle>

          {shouldShowLoggedInHeader ? (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="rounded-sm bg-primary px-2.5 py-1 text-xs text-white">
                {csatDDay}
              </span>
              <span className="text-sm font-medium text-[#1e293b]">
                {displayName}님{memberLabel ? ` ${memberLabel}` : ""}
              </span>
            </div>
          ) : (
            <span className="text-lg font-semibold text-primary">메뉴</span>
          )}

          <SheetClose
            aria-label="메뉴 닫기"
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-11 shrink-0 rounded-lg text-[#1e293b] hover:bg-[#f5f8fb] hover:text-[#1e293b]"
              />
            }
          >
            <X size={22} className="size-[1.375rem]" />
          </SheetClose>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <nav className="px-2 py-2">
            <Accordion
              value={openGroup === null ? [] : [openGroup]}
              onValueChange={(next) => {
                const nextValue = next[0];
                setOpenGroup(typeof nextValue === "string" ? nextValue : null);
              }}
            >
              {navGroups.map((group) => {
                const hasDropdown =
                  Array.isArray(group.items) && group.items.length > 0;
                const isOpen = openGroup === group.title;
                const isGroupActive = activeGroupTitle === group.title;

                if (!hasDropdown) {
                  // 하위 항목이 없는 그룹은 토글할 아코디언이 없으니 헤더 자체가 목적지다.
                  return (
                    <div
                      key={group.title}
                      className="border-b border-[#eeeeee]"
                    >
                      <Link
                        to={group.to}
                        onClick={onClose}
                        aria-current={isGroupActive ? "page" : undefined}
                        className={`block whitespace-nowrap px-4 py-4 text-lg ${
                          isGroupActive
                            ? "font-semibold text-primary"
                            : "font-medium text-[#1e293b]"
                        }`}
                      >
                        {group.title}
                      </Link>
                    </div>
                  );
                }

                return (
                  <AccordionItem
                    key={group.title}
                    value={group.title}
                    className="border-b border-[#eeeeee]"
                  >
                    {/* 그룹 헤더 = 아코디언 토글. 이동은 하위 항목 클릭에서만 일어난다
                      (group.to로의 헤더 자체 이동은 폐지 — 단일 열림 아코디언으로 대체).
                      기본 shadcn 아이콘 스왑 대신 회전 트랜지션이 있는 기존 ChevronDown을 쓴다. */}
                    <AccordionTrigger
                      className={`items-center gap-2 whitespace-nowrap rounded-none border-none px-4 py-4 text-lg hover:no-underline focus-visible:ring-0 **:data-[slot=accordion-trigger-icon]:hidden ${
                        isGroupActive
                          ? "font-semibold text-primary"
                          : "font-medium text-[#1e293b]"
                      }`}
                    >
                      {group.title}
                      <ChevronDown
                        size={18}
                        strokeWidth={2.2}
                        className={`shrink-0 transition ${isOpen ? "rotate-180" : ""}`}
                      />
                    </AccordionTrigger>

                    <AccordionContent className="pb-0 [&_a]:no-underline [&_a]:hover:text-primary">
                      {group.items.map((item) => {
                        const isItemActive = item.to === pathname;
                        return (
                          <Link
                            key={`${group.title}-${item.to}-${item.label}`}
                            to={item.to}
                            onClick={onClose}
                            aria-current={isItemActive ? "page" : undefined}
                            className={`block whitespace-nowrap px-8 py-3 text-base transition hover:text-primary ${
                              isItemActive
                                ? "font-semibold text-primary"
                                : "text-ink"
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </nav>
        </ScrollArea>

        <div className="shrink-0 border-t border-[#eeeeee] px-4 py-4">
          {shouldShowLoggedInHeader ? (
            <>
              {/* 역할별 단일 소스(myMenuItems.buildMyMenu) — 관리자도 별도 버튼 없이
                  이 목록의 "관리자 메뉴" 항목으로 진입한다. */}
              {buildMyMenu(myMenuRole).map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={onClose}
                  className="flex items-center gap-3 whitespace-nowrap px-4 py-3 text-base font-medium text-ink-header transition hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}

              <Button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="mt-2 h-auto w-full justify-center gap-2 rounded-lg border-none bg-primary px-6 py-3 text-base font-medium text-[#f5f5f5] hover:bg-[#012347]"
              >
                <LogOut size={16} className="size-4" />
                로그아웃
              </Button>
            </>
          ) : isLoggedIn ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="h-auto w-full justify-center gap-2 border-line bg-transparent px-6 py-3 text-base font-medium text-[#1e293b] hover:border-primary hover:bg-transparent hover:text-primary"
            >
              로그아웃
            </Button>
          ) : (
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                render={<Link to="/login" onClick={onClose} />}
                className="h-auto w-full justify-center border-line bg-transparent px-6 py-3 text-base font-medium text-[#1e293b] hover:border-primary hover:bg-transparent hover:text-primary"
              >
                로그인
              </Button>

              {signupEnabled && (
                <Button
                  render={<Link to="/signup" onClick={onClose} />}
                  className="h-auto w-full justify-center rounded-lg border-none bg-primary px-6 py-3 text-base font-medium text-[#f5f5f5] hover:bg-[#012347]"
                >
                  회원가입
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
