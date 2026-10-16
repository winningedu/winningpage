import { useEffect, useState } from "react";
import { nextLineIndex } from "./topicsLogic";

const LINE_INTERVAL_MS = 2500;

type Props = {
  title: string;
  lines: readonly string[];
};

export default function GeneratingCard({ title, lines }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => nextLineIndex(i, lines.length)),
      LINE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [lines.length]);

  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-xl border border-line/60 bg-white px-6 py-8"
    >
      <p className="text-app-card-title font-bold text-ink-strong">{title}</p>
      <p className="mt-2 text-app-label text-ink-sub">{lines[index]}</p>
      <div
        aria-hidden="true"
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-04"
      >
        <div className="h-full w-1/3 animate-pulse rounded-full bg-ink-strong" />
      </div>
    </section>
  );
}
