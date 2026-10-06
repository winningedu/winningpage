import { Link } from "react-router";
import { formatKoreanDate } from "@/lib/growth/format";
import type { GrowthBanner } from "@/lib/selfeval/types";
import { staleLabel } from "./start/startLogic";

// 성장설계 방향 배너(명세 No.68, 시안 06, 14). 시작, 기본 입력, 활동 선택 화면이 같은 모양을 쓴다.
// 값이 없는 줄은 그리지 않는다. 칩 문구는 서버 bannerSummary 가 만든 값을 그대로 쓴다.
//   tone light  시작 화면(연한 바탕)
//   tone dark   활동 선택 화면(진한 바탕, 시안 14)

type Props = {
  banner: GrowthBanner;
  tone?: "light" | "dark";
  /** 발행이 오래됐을 때 경과 안내와 다시 받기 링크를 붙인다. */
  stale?: boolean;
  now?: Date;
};

export default function GrowthDirectionBanner({
  banner,
  tone = "light",
  stale = false,
  now = new Date(),
}: Props) {
  const dark = tone === "dark";
  const issued = formatKoreanDate(banner.issuedAt);
  const staleText = stale ? staleLabel(banner.issuedAt, now) : null;
  const chips = [
    banner.stageLabel,
    banner.currentSubtheme,
    ...banner.weakAxisNames.map((name) => `부족 축 ${name}`),
  ].filter((c): c is string => c !== null && c !== "");

  return (
    <section
      aria-label="성장설계 방향"
      className={
        dark
          ? "rounded-xl bg-primary px-6 py-5 text-white"
          : "rounded-xl border border-line/60 bg-surface-04 px-6 py-5"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-app-caption font-semibold ${dark ? "text-white/80" : "text-accent"}`}
        >
          성장설계 방향
        </p>
        {issued && (
          <p
            className={`text-app-caption ${dark ? "text-white/80" : "text-ink-sub"}`}
          >
            발행 {issued}
          </p>
        )}
      </div>
      {banner.theme && (
        <p
          className={`mt-2 text-app-card-title font-bold ${dark ? "text-white" : "text-ink-strong"}`}
        >
          {banner.theme}
        </p>
      )}
      {chips.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li
              key={chip}
              className={`rounded-full px-2.5 py-0.5 text-app-caption font-medium ${
                dark ? "bg-white/20 text-white" : "bg-white text-ink-strong"
              }`}
            >
              {chip}
            </li>
          ))}
        </ul>
      )}
      {staleText && (
        <p className="mt-3 flex items-center gap-3 text-app-label text-ink-sub">
          <span>{staleText}</span>
          <Link
            to="/app/growth"
            className="font-semibold text-accent underline underline-offset-2"
          >
            다시 받기
          </Link>
        </p>
      )}
    </section>
  );
}
