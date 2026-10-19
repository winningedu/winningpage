// 리포트 표지 실측 데모(개발 전용, /demo/report-cover). 표지를 로컬에서 반복 실측하는
// 화면이라 디자인 대상이 아니다. 좌측 조작 패널은 인쇄 영역(contentRef) 밖에 둔다.
import { useState } from "react";
import {
  REPORT_COVER_PRESETS,
  type ReportCoverKind,
} from "@/components/report/coverPresets";
import ReportCoverPage from "@/components/report/ReportCoverPage";
import {
  buildCoverFixture,
  type CoverFixtureOptions,
} from "./reportCoverFixtures";

const KINDS = Object.keys(REPORT_COVER_PRESETS) as ReportCoverKind[];

const OPTION_TOGGLES: { key: keyof CoverFixtureOptions; label: string }[] = [
  { key: "dropName", label: "학생명 빼기" },
  { key: "dropGrade", label: "학년 빼기" },
  { key: "dropDate", label: "날짜 빼기" },
  { key: "longName", label: "긴 이름" },
  { key: "longTitle", label: "긴 제목" },
];

export default function ReportCoverDemo() {
  const [kind, setKind] = useState<ReportCoverKind>("diagnosis");
  const [options, setOptions] = useState<CoverFixtureOptions>({
    dropName: false,
    dropGrade: false,
    dropDate: false,
    longName: false,
    longTitle: false,
  });
  const { title, infoItems } = buildCoverFixture(kind, options);

  return (
    <div className="flex min-h-screen gap-4 bg-neutral-100 p-4">
      <aside className="w-64 shrink-0 text-sm">
        <label>
          종류
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ReportCoverKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {OPTION_TOGGLES.map(({ key, label }) => (
          <label key={key} className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, [key]: e.target.checked }))
              }
            />
            {label}
          </label>
        ))}
      </aside>
      <main className="min-w-0 flex-1">
        <ReportCoverPage kind={kind} title={title} infoItems={infoItems} />
      </main>
    </div>
  );
}
