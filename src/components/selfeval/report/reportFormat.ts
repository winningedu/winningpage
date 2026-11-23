// 리포트 화면용 순수 표시 함수. 값은 서버가 정해 payload 에 담고, 여기서는 글자 모양만 만든다.
import type {
  ReportCh01,
  ReportCover,
  ReportStepKey,
  ReportTag,
} from "@/lib/selfeval/reportTypes";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** 문장 번호 글리프. 20을 넘으면 괄호 숫자로 쓴다(서버 copy.ts 와 같은 규칙). */
export function circled(n: number): string {
  return n >= 1 && n <= 20 ? (CIRCLED[n - 1] as string) : `(${n})`;
}

export function circledList(numbers: readonly number[]): string {
  return numbers.map(circled).join("");
}

/** 꼬리표의 종류 글자. P1 이면 P. */
export function tagKind(tag: ReportTag): string {
  return tag.slice(0, 1);
}

/** 표지 계단 6단 순서. 표지 컴포넌트의 STEPS 와 같다. */
export const STEP_ORDER: readonly ReportStepKey[] = [
  "diagnosis",
  "goal",
  "growth",
  "performance",
  "inquiry",
  "selfeval",
];

export function filledSteps(cover: ReportCover): boolean[] {
  return STEP_ORDER.map((key) => cover.steps[key]);
}

/**
 * 표지 정보 줄. 서비스는 individual 일 때만 라벨을 붙인다. standard 는 명세에 표시 라벨이 없어
 * 아무것도 붙이지 않는다(열린 결정).
 */
export function coverInfoItems(cover: ReportCover, studentName: string | null) {
  const individual = cover.serviceTier === "individual";
  return [
    { label: "학생명", value: studentName },
    { label: "학년", value: cover.gradeLabel },
    individual
      ? { label: "저장일, 서비스", value: `${cover.savedAt}, 개별관리` }
      : { label: "저장일", value: cover.savedAt },
  ];
}

function signed(percent: number): string {
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

/** 예: 수학 자기평가서 공백 포함 493자 (목표 대비 -1.4%), 3문단, 9문장 */
export function ch01SummaryLine(title: string, ch: ReportCh01): string {
  const withSpace = ch.targetCharsMode === "with_space";
  const count = withSpace ? ch.charCount.withSpace : ch.charCount.withoutSpace;
  const diff =
    ch.diffPercent === null ? "" : ` (목표 대비 ${signed(ch.diffPercent)})`;
  return `${title} ${withSpace ? "공백 포함" : "공백 제외"} ${count}자${diff}, ${ch.paragraphCount}문단, ${ch.sentenceCount}문장`;
}

export function ch01Intro(targetChars: number | null): string {
  const target = targetChars === null ? "" : `(목표 ${targetChars}자)`;
  return `학생이 완성한 자기평가 결과${target}입니다. 문장마다 근거가 된 활동 기록을 표시했습니다.`;
}
