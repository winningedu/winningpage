// 장기 로드맵 섹션의 원형 다이어그램(특목고입학 시안 전용) — 중앙 네이비 원(로고) 주위로
// 6개의 흰 pill을 60°씩 원형 배치한다. 이미지 통짜 대신 순수 CSS(absolute + 삼각함수 좌표)로
// 그린다 — 시안의 roadmap-ellipse.png 는 점선 원 하나만 담긴 Figma 구성 가이드라 자산으로
// 쓰지 않고 border-dashed 로 대체한다. 로고는 site.logo.stacked(짙은 회색 #36393E)를
// brightness-0 invert 필터로 반전해 흰색으로 쓴다 — 별도 흰색 자산이 없다.
//
// 6개 고정 배치 전제(각도 하드코딩)라 범용 개수로 확장하려면 각도 계산을 일반화해야 한다 —
// 지금은 이 시안 전용 단일 용도.
// 모바일은 원형 absolute 배치가 좁은 폭에서 겹치기 쉬워 아래 wrap 리스트로 대체한다(sm 미만).
import { site } from "@/config/site";

type PremiumRoadmapDiagramProps = {
  pills: [string, string, string, string, string, string];
};

// 12시 방향부터 시계방향 60°씩 6개 지점 (각도는 CSS 좌표계 기준 -90°가 12시).
const PILL_ANGLES_DEG: [number, number, number, number, number, number] = [
  -90, -30, 30, 90, 150, 210,
];

export default function PremiumRoadmapDiagram({
  pills,
}: PremiumRoadmapDiagramProps) {
  return (
    <div>
      {/* 데스크톱/태블릿 — 원형 배치 */}
      <div className="relative mx-auto hidden aspect-square w-full max-w-[22rem] sm:block">
        <div
          aria-hidden="true"
          className="absolute inset-[3rem] rounded-full border border-dashed border-gold/40"
        />
        <div className="absolute left-1/2 top-1/2 flex size-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full bg-primary shadow-[0_0.75rem_1.75rem_rgba(1,50,98,0.28)]">
          <img
            src={site.logo.stacked}
            alt={site.brandName}
            className="h-10 w-auto brightness-0 invert"
          />
        </div>
        {pills.map((label, index) => {
          const angleRad = ((PILL_ANGLES_DEG[index] ?? 0) * Math.PI) / 180;
          const x = 50 + 50 * Math.cos(angleRad);
          const y = 50 + 50 * Math.sin(angleRad);

          return (
            <span
              key={label}
              style={{ left: `${x}%`, top: `${y}%` }}
              className="absolute flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white px-2 text-center text-[0.75rem] font-medium leading-[1.3] text-ink-strong shadow-[0_0.25rem_0.75rem_rgba(28,26,25,0.12)]"
            >
              {label}
            </span>
          );
        })}
      </div>

      {/* 모바일 — 중앙 로고 + pill wrap 리스트 */}
      <div className="flex flex-col items-center gap-6 sm:hidden">
        <div className="flex size-28 flex-col items-center justify-center gap-1 rounded-full bg-primary shadow-[0_0.75rem_1.75rem_rgba(1,50,98,0.28)]">
          <img
            src={site.logo.stacked}
            alt={site.brandName}
            className="h-8 w-auto brightness-0 invert"
          />
        </div>
        <ul className="flex flex-wrap justify-center gap-3">
          {pills.map((label) => (
            <li
              key={label}
              className="rounded-full bg-white px-4 py-2 text-center text-[0.8125rem] font-medium leading-[1.3] text-ink-strong shadow-[0_0.25rem_0.75rem_rgba(28,26,25,0.12)]"
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
