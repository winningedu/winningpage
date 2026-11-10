import { ChevronRight, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { site } from "@/config/site";
import { useNavGroups } from "@/hooks/useNavGroups";
import MobileNavDrawer from "../MobileNavDrawer";
import MegaPanel from "./MegaPanel";
import { NAV_LEFT, PILL_GAP, PILL_W } from "./navGrid";
import { signOutB2B, useB2BAccount } from "./useB2BAccount";

const CLOSE_DELAY_MS = 100;

const CHIP = "rounded-sm px-2.5 py-1 text-xs";
const ACCOUNT_PILL =
  "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-b2b-account px-3.5 text-sm font-bold tracking-[-0.01875rem]";

// 스쿨멘토 전용 헤더(b2bMenu 사이트). 위닝은 기존 Header를 그대로 쓴다.
export default function Header() {
  const account = useB2BAccount();
  // 하위 항목이 없는 그룹은 알약과 패널 컬럼에서 뺀다(결정 19).
  const groups = useNavGroups().filter((group) => group.items.length > 0);
  const loggedIn = account.status === "student" || account.status === "teacher";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const [openTitle, setOpenTitle] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(
      () => setOpenTitle(null),
      CLOSE_DELAY_MS,
    );
  };
  const open = (title: string) => {
    cancelClose();
    setOpenTitle(title);
  };

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (openTitle === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenTitle(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openTitle]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 마우스가 헤더와 패널 밖으로 나가면 메가 패널을 닫는 편의 동작이다. 항목은 키보드로도 열고 닫는다(알약 버튼, Esc).
    <header
      className="fixed left-0 top-0 z-50 h-16 w-full border-b border-black/5 bg-white"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <div className="flex h-full items-center justify-between px-8 desktop:px-[clamp(2rem,6.25vw,7.5rem)]">
        <Link to="/" className="flex shrink-0 items-center">
          <img
            src={site.logo.horizontal}
            alt={site.brandName}
            className="h-5.5 w-[9.675rem] object-contain desktop:w-[9.881rem]"
          />
        </Link>
        {(account.status === "student" || account.status === "teacher") &&
          account.orgName && (
            <span
              className={`${CHIP} ml-3 hidden bg-surface-muted text-ink-strong desktop:block`}
            >
              {account.orgName}
            </span>
          )}

        <div
          className="absolute top-0 hidden h-full items-center desktop:flex"
          style={{ left: NAV_LEFT, gap: PILL_GAP }}
        >
          {groups.map((group) => (
            <button
              key={group.title}
              type="button"
              aria-expanded={openTitle === group.title}
              onMouseEnter={() => open(group.title)}
              onClick={() => open(group.title)}
              className={`h-11 shrink-0 rounded-full border px-2 text-[0.9375rem] font-semibold tracking-[-0.01875rem] transition ${
                openTitle === group.title
                  ? "border-b2b-pill-ink bg-b2b-pill-ink text-white"
                  : "border-b2b-pill-line bg-b2b-pill-bg text-b2b-pill-ink"
              }`}
              style={{ width: PILL_W }}
            >
              {group.title}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {account.status === "guest" && (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className={`${ACCOUNT_PILL} bg-white text-b2b-account`}
              >
                로그인
              </Link>
              <Link
                to="/login"
                className={`${ACCOUNT_PILL} bg-b2b-account text-white`}
              >
                선생님
              </Link>
            </div>
          )}
          {account.status === "student" && (
            <div className="hidden items-center gap-3 desktop:flex">
              <span className={`${CHIP} bg-primary text-white`}>
                {account.csatDDay}
              </span>
              <Link
                to="/mypage"
                className="flex items-center gap-2 whitespace-nowrap py-1.5 text-sm font-medium text-primary"
              >
                {account.name} 님
                {account.memberLabel && ` ${account.memberLabel}`}
                <ChevronRight size={24} className="size-6" />
              </Link>
              {account.myMenuRole === "admin" && (
                <Link
                  to="/admin"
                  className={`${ACCOUNT_PILL} bg-b2b-account text-white`}
                >
                  관리자 메뉴
                </Link>
              )}
              <button
                type="button"
                onClick={signOutB2B}
                className={`${ACCOUNT_PILL} bg-white text-b2b-account`}
              >
                로그아웃
              </button>
            </div>
          )}
          {account.status === "teacher" && (
            <div className="hidden items-center gap-3 desktop:flex">
              <span className="whitespace-nowrap py-1.5 text-sm font-medium text-primary">
                {account.name} 선생님
                {account.roleLabel && ` ${account.roleLabel}`}
              </span>
              <Link
                to="/teacher/dashboard"
                className={`${ACCOUNT_PILL} bg-b2b-account text-white`}
              >
                관리 화면
              </Link>
              <button
                type="button"
                onClick={signOutB2B}
                className={`${ACCOUNT_PILL} bg-white text-b2b-account`}
              >
                로그아웃
              </button>
            </div>
          )}
          <button
            ref={hamburgerRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            aria-label="전체 메뉴 열기"
            className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-primary after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-1/2 after:content-['']"
          >
            <Menu size={18} className="size-[1.125rem]" />
          </button>
        </div>
      </div>

      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        navGroups={groups}
        shouldShowLoggedInHeader={loggedIn}
        isLoggedIn={loggedIn}
        displayName={loggedIn ? account.name : ""}
        memberLabel={account.status === "student" ? account.memberLabel : ""}
        myMenuRole={
          account.status === "student" ? account.myMenuRole : "student"
        }
        csatDDay={account.status === "student" ? account.csatDDay : ""}
        onLogout={signOutB2B}
        triggerRef={hamburgerRef}
        variant="b2b"
        guestSecondary={{ label: "선생님", href: "/login" }}
        hideMenuItems={["신청 내역"]}
        orgName={loggedIn ? (account.orgName ?? undefined) : undefined}
        teacher={
          account.status === "teacher"
            ? {
                name: account.name,
                roleLabel: account.roleLabel,
                consoleHref: "/teacher/dashboard",
              }
            : undefined
        }
      />

      <div className="absolute left-0 top-full hidden w-full desktop:block">
        <MegaPanel
          groups={groups}
          openGroupTitle={openTitle}
          onNavigate={() => setOpenTitle(null)}
        />
        {openTitle !== null && (
          <div
            aria-hidden="true"
            className="h-screen bg-overlay"
            onMouseEnter={scheduleClose}
          />
        )}
      </div>
    </header>
  );
}
