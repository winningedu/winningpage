import { Link } from "react-router";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function EmptyReports() {
  return (
    <section className="flex flex-col items-center gap-4 rounded-xl border border-border bg-white px-6 py-12">
      <p className="text-app-card-title font-semibold text-ink-strong">
        아직 만든 심화탐구가 없어요. 정보 입력에서 시작해요
      </p>
      <Link
        to={INQUIRY_PATHS.home}
        className={cn(buttonVariants(), "h-10 px-5 text-app-label")}
      >
        시작하기
      </Link>
    </section>
  );
}
