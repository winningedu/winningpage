import type { ReactNode } from "react";
import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MYPAGE_CHILDREN = "/mypage?tab=children";

/** 학부모 열람 화면 공통 셸. 마이페이지와 같은 SiteLayout 안에서 본문 폭과 여백만 잡는다. */
export function ChildGrowthShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="mx-auto w-full max-w-content px-5 pt-10 pb-20 sm:px-8">
        {children}
      </div>
    </main>
  );
}

export function ChildGrowthLoading() {
  return (
    <ChildGrowthShell>
      <p aria-busy="true" className="text-app-body text-ink-sub">
        불러오는 중이에요.
      </p>
    </ChildGrowthShell>
  );
}

export function ChildGrowthNotLinked() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white pt-16">
      <p className="text-app-body font-medium text-ink">
        연결된 자녀가 아니에요.
      </p>
      <Link
        to={MYPAGE_CHILDREN}
        className={cn(buttonVariants(), "h-10 px-5 text-app-label")}
      >
        마이페이지로
      </Link>
    </main>
  );
}

export function ChildGrowthError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-border bg-white p-6"
    >
      <p className="text-app-body text-ink-strong">
        리포트를 불러오지 못했어요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(buttonVariants({ variant: "outline" }), "h-10 px-5")}
      >
        다시 시도
      </button>
    </div>
  );
}
