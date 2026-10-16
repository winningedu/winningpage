import { Button } from "@/components/ui/button";
import type { StartMode } from "./startLogic";

type ActionRowProps = {
  mode: StartMode;
  canViewReports: boolean;
  onViewReports: () => void;
  onPrimary: () => void;
  onBuy: () => void;
};

export default function ActionRow({
  mode,
  canViewReports,
  onViewReports,
  onPrimary,
  onBuy,
}: ActionRowProps) {
  return (
    <div className="flex flex-col gap-4">
      {mode === "blocked" && (
        <section className="rounded-xl border border-line/60 bg-surface-04 px-6 py-5">
          <p className="text-app-card-title font-bold text-ink-strong">
            이용권이 없어요
          </p>
          <p className="mt-1 text-app-label text-ink-sub">
            성장설계는 이용권 1회로 리포트 하나를 만들어요. 이용권을 구매하면
            바로 시작할 수 있어요.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-4 h-10 px-5 text-app-label font-semibold"
            onClick={onBuy}
          >
            이용권 구매하기
          </Button>
        </section>
      )}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-10 px-5 text-app-label font-medium"
          disabled={!canViewReports}
          onClick={onViewReports}
        >
          지난 리포트 보기
        </Button>
        {mode !== "blocked" && (
          <Button
            type="button"
            size="lg"
            className="h-10 px-5 text-app-label font-semibold"
            onClick={onPrimary}
          >
            {mode === "resume" ? "이어서 하기" : "학생 조사 시작하기"}
          </Button>
        )}
      </div>
    </div>
  );
}
