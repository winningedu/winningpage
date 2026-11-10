import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import { site } from "@/config/site";
import { useAuthOptional } from "@/context/AuthProvider";
import GuestStartNotice from "./GuestStartNotice";
import ResultUseNoticeDialog from "./ResultUseNoticeDialog";

type Pending = "guest" | "result" | null;

/**
 * 서비스 소개 화면의 시작하기 관문(사 #12, #56, 결정 107-8, 107-9). 위닝(site.features.serviceStartNotice
 * 꺼짐)은 곧바로 proceed 한다. 스쿨멘토는 비로그인이면 이용권 없음 안내, 로그인이고 resultNotice면
 * 결과물 안내를 먼저 보인다. 인증 제공자가 없거나 준비 전이면 막지 않는다(라우트 가드가 지킨다).
 */
export function useServiceStart({
  to,
  resultNotice,
}: {
  to: string;
  resultNotice: boolean;
}) {
  const navigate = useNavigate();
  const auth = useAuthOptional();
  const [pending, setPending] = useState<Pending>(null);
  const [onConfirm, setOnConfirm] = useState<() => void>(() => () => {});

  const gated = site.features.serviceStartNotice && auth?.isReady === true;
  const isGuestBlocked = gated && !auth.user;

  function requestStart(proceed: () => void) {
    if (!gated) {
      proceed();
      return;
    }
    if (isGuestBlocked) {
      setPending("guest");
      return;
    }
    if (resultNotice) {
      setOnConfirm(() => proceed);
      setPending("result");
      return;
    }
    proceed();
  }

  const startDialogs: ReactNode = (
    <>
      <GuestStartNotice
        open={pending === "guest"}
        onOpenChange={(open) => !open && setPending(null)}
        onLogin={() => {
          setPending(null);
          navigate(`/login?redirect=${encodeURIComponent(to)}`);
        }}
      />
      <ResultUseNoticeDialog
        open={pending === "result"}
        onOpenChange={(open) => !open && setPending(null)}
        onConfirm={() => {
          setPending(null);
          onConfirm();
        }}
      />
    </>
  );

  return { requestStart, startDialogs, isGuestBlocked };
}
