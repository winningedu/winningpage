// 다른 기기 로그인으로 인한 킥(강제 세션 종료) 감지 + 안내 다이얼로그.
//
// 배치 위치: App.tsx의 RootLayout(모든 라우트의 공통 조상 — SiteLayout 안팎,
// goalApp/performanceApp 셸, admin, standalone 전부를 포함) 안에 항상 마운트한다.
// "전 계정(어드민 포함)"이 대상이라는 요구를 만족하려면 특정 라우트 그룹 안이
// 아니라 이 위치여야 한다 — 어드민도 같은 supabase.auth 세션을 쓰고 판정만
// resolveAdmin이 얹힐 뿐이라(adminSession.ts), AuthProvider의 userId가 그대로
// 어드민 계정도 포괄한다.
//
// 동작 두 갈래(같은 컴포넌트가 둘 다 맡는다 — location.replace가 전체 리로드라
// 마운트가 곧 "이 로드에서 처음 실행되는 시점"이기 때문에 자연스럽게 하나로
// 묶인다):
//   1) 감지 → 킥 확정 시 signOut(scope:'local') → sessionStorage 플래그 세팅 →
//      location.replace('/')로 완전 리로드.
//   2) 리로드 후 새 마운트 시 플래그를 읽어 다이얼로그를 띄우고 플래그를 지운다
//      (한 번만 보여준다 — 그 뒤 새로고침에서는 다시 뜨지 않아야 한다).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import ConfirmModal from "@/components/checkout/ConfirmModal";
import { useAuth } from "@/context/AuthProvider";
import { clearAllDrafts } from "@/lib/diagnosisDraft";
import { sessionCheckQueryOptions } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

// 리로드를 관통해 "방금 킥당해서 이리로 왔다"를 전달하는 유일한 수단이다(React
// state는 location.replace로 사라진다). 세션 단위(sessionStorage)로 둬서 다른
// 탭에는 절대 새지 않는다 — 탭별 독립 동작 요구사항(각 탭이 자기 focus 시점에
// 각자 감지·각자 안내).
const KICKED_FLAG_KEY = "kicked-by-other-device";

// 리로드 루프 차단기(리뷰 MEDIUM). signOut의 /logout 네트워크 호출이 실패하면
// auth-js가 로컬 세션을 지우지 않은 채 리로드되고, 새 마운트에서 쿼리가 다시
// "kicked"를 판정해 replace가 반복될 수 있다(토큰 만료까지 최대 ~5분). 이 탭이
// 이미 킥을 한 번 처리했다는 표식을 sessionStorage(탭 단위)에 남겨, 표식이 있는
// 동안은 다이얼로그 표시만 하고 signOut/replace를 다시 하지 않는다. 정상 세션
// ("ok")이 확인되면 — 이 탭에서 새로 로그인한 경우 — 표식을 지워 다음 킥을 다시
// 처리할 수 있게 한다.
const KICK_HANDLED_KEY = "kicked-handled";

// signOut(scope:'local')은 GoTrue에 revoke 요청을 태우는 네트워크 호출이다 —
// 서버가 응답하지 않으면 무한 대기할 수 있다(리뷰 MEDIUM). 리다이렉트를
// `.finally()`에 의존시키면 그 hang 동안 킥당한 화면에 계속 머무르게 되므로,
// 이 타이머와 race시켜 어느 쪽이 먼저 끝나든 반드시 진행한다.
const SIGN_OUT_TIMEOUT_MS = 2000;

/** sessionStorage 접근 3종(읽기/쓰기/삭제) — 시크릿 모드 등에서 접근 자체가
 * 던질 수 있어 전부 try/catch로 감싼다(src/context/SignupContext.tsx의
 * readStoredFlow/writeStoredFlow와 같은 관례, `window.sessionStorage`로 표기). */
function readKickedFlag(): boolean {
  try {
    return window.sessionStorage.getItem(KICKED_FLAG_KEY) === "1";
  } catch (error) {
    console.warn("[SessionKickGuard] sessionStorage 읽기 실패(무시):", error);
    return false;
  }
}

function writeKickedFlag(): void {
  try {
    window.sessionStorage.setItem(KICKED_FLAG_KEY, "1");
  } catch (error) {
    console.warn("[SessionKickGuard] sessionStorage 쓰기 실패(무시):", error);
  }
}

function clearKickedFlag(): void {
  try {
    window.sessionStorage.removeItem(KICKED_FLAG_KEY);
  } catch (error) {
    console.warn("[SessionKickGuard] sessionStorage 삭제 실패(무시):", error);
  }
}

function readKickHandled(): boolean {
  try {
    return window.sessionStorage.getItem(KICK_HANDLED_KEY) === "1";
  } catch (error) {
    console.warn("[SessionKickGuard] sessionStorage 읽기 실패(무시):", error);
    return false;
  }
}

function writeKickHandled(): void {
  try {
    window.sessionStorage.setItem(KICK_HANDLED_KEY, "1");
  } catch (error) {
    console.warn("[SessionKickGuard] sessionStorage 쓰기 실패(무시):", error);
  }
}

function clearKickHandled(): void {
  try {
    window.sessionStorage.removeItem(KICK_HANDLED_KEY);
  } catch (error) {
    console.warn("[SessionKickGuard] sessionStorage 삭제 실패(무시):", error);
  }
}

export default function SessionKickGuard() {
  const { userId } = useAuth();
  const [showKickedDialog, setShowKickedDialog] = useState(false);

  const { data: sessionState } = useQuery(sessionCheckQueryOptions(userId));

  // 킥 확정 → signOut → 메인 이동. 이 effect 안에서 다이얼로그를 직접 띄우지
  // 않는다 — location.replace 직후 이 컴포넌트 인스턴스 자체가 사라지므로,
  // "리로드 후 플래그를 읽어 띄우는" 두 번째 effect가 유일한 표시 경로다(같은
  // 탭이 리로드 없이 다이얼로그만 보는 경로는 없다 — 배정 메시지의 플로우 그대로).
  useEffect(() => {
    if (sessionState === "ok") {
      clearKickHandled();
      return;
    }
    if (sessionState !== "kicked") return;
    // 이 탭이 이미 킥을 처리하고 리로드된 상태 — signOut 실패로 로컬 세션이
    // 남아 쿼리가 또 "kicked"를 내더라도 재처리(리로드 루프)하지 않는다.
    // 잔존 세션은 토큰 만료 시 auto-refresh 실패로 정리된다.
    if (readKickHandled()) return;
    writeKickHandled();
    // 킥된 기기가 공용 PC일 수 있어 학습진단 초안(성적, 목표 학교)을 남기지 않는다.
    clearAllDrafts();

    // signOut이 성공하든 타임아웃으로 포기하든 이후 동작은 같다 — 그래서
    // 플래그 쓰기는 이 race가 끝난 뒤, replace 바로 직전에만 한다(리뷰 LOW:
    // 그 사이 어느 시점에 실패해도 플래그 없이 리로드되는 경로를 만들지
    // 않는다).
    Promise.race([
      supabase.auth.signOut({ scope: "local" }).catch(() => {}),
      new Promise<void>((resolve) => {
        setTimeout(resolve, SIGN_OUT_TIMEOUT_MS);
      }),
    ]).then(() => {
      writeKickedFlag();
      window.location.replace("/");
    });
  }, [sessionState]);

  // 마운트 1회 — 리로드 직후에만 플래그를 소비한다(읽는 즉시 제거해 다음
  // 새로고침·재방문에서는 다시 뜨지 않게 한다).
  useEffect(() => {
    if (!readKickedFlag()) return;
    clearKickedFlag();
    setShowKickedDialog(true);
  }, []);

  if (!showKickedDialog) return null;

  // ConfirmModal은 "마운트 자체가 열림"인 관례(open prop 없음, checkout/
  // ConfirmModal.tsx 헤더 주석)라 조건부 렌더로 표시를 제어한다. 단일 [확인]
  // 버튼(onConfirm 생략 시 onClose와 동일 동작)·ESC/오버레이 닫기는 Base UI
  // Dialog가 내장 제공한다(role="dialog"도 자동 배선). 문구는 사용자 확정
  // 카피 — 변경 금지.
  //
  // elevated: 킥은 무조건 메인("/")으로 보내는데, 홈 프로모션 팝업
  // (Home.tsx의 HomePopupLayer, z-9999)이 떠 있으면 ConfirmModal 기본
  // z-100(오버레이 z-50)이 그 아래 깔려 확인 버튼을 클릭할 수 없었다(E2E
  // 실버그). 이 다이얼로그는 어떤 페이지 레이어보다도 위에 있어야 하는
  // 전역 안내라 elevated로 z-10000까지 끌어올린다.
  return (
    <ConfirmModal
      title="다른 기기에서 로그인되었습니다"
      onClose={() => setShowKickedDialog(false)}
      elevated
    >
      동일 계정으로 다른 기기에서 로그인되어 이 기기에서는 로그아웃되었습니다.
      본인이 아닌 경우 비밀번호를 변경해 주세요.
    </ConfirmModal>
  );
}
