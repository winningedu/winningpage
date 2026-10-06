import { Link } from "react-router";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_MODEL_ATTEMPTS } from "@/lib/inquiry/labels";

// 평가 호출이 끝나지 못했을 때의 안내 카드 4종(부록 C 오류 분기 공통).
const CARD = "rounded-xl border border-line/60 bg-white px-6 py-6";
const TITLE = "text-app-card-title font-bold text-ink-strong";
const LINK = "mt-4 h-10 px-5 text-app-label";

export const PRICING_PATH = "/pricing?service=inquiry";

type Props =
  | { variant: "failed"; attempts: number | null; onRetry: () => void }
  | { variant: "terminal" }
  | { variant: "noEntitlement" }
  | { variant: "reevaluationLimit" };

export default function EvaluateStatusCard(props: Props) {
  switch (props.variant) {
    case "failed":
      return (
        <section role="alert" className={CARD}>
          <p className={TITLE}>평가 리포트를 만들지 못했어요</p>
          <p className="mt-2 text-app-label text-ink-sub">
            작성한 내용은 저장돼 있어요. 다시 시도해도 이용 횟수는 더 차감되지
            않아요.
          </p>
          {props.attempts !== null && (
            <p className="mt-1 text-app-caption text-ink-sub">
              {`시도 ${props.attempts} / ${MAX_MODEL_ATTEMPTS}`}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="mt-4 h-10 px-5 text-app-label"
            onClick={props.onRetry}
          >
            다시 시도
          </Button>
        </section>
      );
    case "terminal":
      return (
        <section role="alert" className={CARD}>
          <p className={TITLE}>이 세션은 종결됐어요</p>
          <p className="mt-2 text-app-label text-ink-sub">
            차감된 이용 횟수는 복구됐어요. 새 세션으로 다시 시작할 수 있어요.
          </p>
          <Link
            to={INQUIRY_PATHS.home}
            className={`${buttonVariants({ size: "lg" })} ${LINK}`}
          >
            처음부터 다시 시작
          </Link>
        </section>
      );
    case "noEntitlement":
      return (
        <section role="alert" className={CARD}>
          <p className={TITLE}>이용권이 필요해요</p>
          <Link
            to={PRICING_PATH}
            className={`${buttonVariants({ size: "lg" })} ${LINK}`}
          >
            이용권 보기
          </Link>
        </section>
      );
    case "reevaluationLimit":
      return (
        <section role="alert" className={CARD}>
          <p className={TITLE}>재평가를 모두 썼어요</p>
          <p className="mt-2 text-app-label text-ink-sub">
            이 세션에서 받을 수 있는 평가를 모두 받았어요. 마지막 평가 리포트를
            확인해요.
          </p>
          <Link
            to={INQUIRY_PATHS.evaluate}
            className={`${buttonVariants({ size: "lg" })} ${LINK}`}
          >
            평가 리포트 보기
          </Link>
        </section>
      );
  }
}
