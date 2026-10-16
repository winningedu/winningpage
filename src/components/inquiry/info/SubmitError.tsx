import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import type { SubmitErrorView } from "./infoLogic";

const PRICING = "/pricing?service=inquiry";
const BOX =
  "flex flex-col items-start gap-2 rounded-xl border border-line px-5 py-4";

// 제출 실패 안내. 이용 횟수 소진(No.20), 이용권 없음, 잠김(409), 그 밖의 오류를 한 자리에서 그린다.
export default function SubmitError({ error }: { error: SubmitErrorView }) {
  if (error.kind === "quota") {
    return (
      <section aria-labelledby="inquiry-submit-error" className={BOX}>
        <h2
          id="inquiry-submit-error"
          className="text-app-card-title font-bold text-ink-strong"
        >
          이용 횟수를 모두 썼어요
        </h2>
        <p className="text-app-label text-ink-sub">
          새 세션을 시작하려면 이용권이 더 필요해요.
        </p>
        <Link
          to={PRICING}
          className={`${buttonVariants({ variant: "outline", size: "lg" })} h-10 px-5 text-app-label`}
        >
          이용권 보기
        </Link>
      </section>
    );
  }
  if (error.kind === "entitlement") {
    return (
      <section aria-labelledby="inquiry-submit-error" className={BOX}>
        <h2
          id="inquiry-submit-error"
          className="text-app-card-title font-bold text-ink-strong"
        >
          이용권이 필요해요
        </h2>
        <Link
          to={PRICING}
          className={`${buttonVariants({ variant: "outline", size: "lg" })} h-10 px-5 text-app-label`}
        >
          이용권 보기
        </Link>
      </section>
    );
  }
  return (
    <p
      role="alert"
      className="rounded-xl bg-surface-04 px-5 py-4 text-app-label text-ink"
    >
      {error.text}
    </p>
  );
}
