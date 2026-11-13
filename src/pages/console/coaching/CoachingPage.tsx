// W9 개인종합코칭. 학생 한 명의 6종 서비스 결과를 판정 엔진 응답으로 한 화면에 모아 보인다.
// 학생은 주소의 studentId 가 정한다(없으면 서버가 정한 첫 학생). 학생을 바꾸면 주소를 바꾼다.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Chip, { type ChipTone } from "../Chip";
import type { GradeLabeler } from "../classLabel";
import { kstDotDate } from "../date";
import EmptyMessage from "../EmptyMessage";
import FilterSelect from "../FilterSelect";
import PageHeader from "../PageHeader";
import { useConsoleMe, useGradeLabel } from "../useConsoleMe";
import CoachingRadar, { axisStatusText } from "./CoachingRadar";
import { GoalOpinionCard, Narrative, ServiceCards } from "./CoachingSections";
import MemoPanel from "./MemoPanel";
import ServiceWindow from "./ServiceWindow";
import type {
  Coaching,
  PickerStudent,
  ServiceKey,
  Signal,
  Target,
} from "./types";
import { useCoaching, useCoachingStudents } from "./useCoaching";

const SERVICE_NAMES: [ServiceKey, string][] = [
  ["diagnosis", "학습진단"],
  ["goal", "목표관리"],
  ["growth", "성장설계"],
  ["performance", "수행평가"],
  ["selfeval", "자기평가"],
  ["inquiry", "심화탐구"],
];

const SIGNAL: Record<Signal, { label: string; tone: ChipTone }> = {
  focus: { label: "집중 코칭", tone: "Danger" },
  caution: { label: "주의", tone: "Caution" },
  insufficient: { label: "데이터 부족", tone: "Neutral" },
  stable: { label: "안정", tone: "Success" },
};

const GRADE_ORDER = ["중1", "중2", "중3", "고1", "고2", "고3"];

const CARD =
  "flex flex-col gap-5 rounded-2xl bg-goal-cardTone-neutral px-5 py-6 md:px-8 md:py-7";

/** 대학과 학과, 확률이 있으면 퍼센트까지. 확률이 없으면 0%로 쓰지 않고 뺀다. */
const targetLabel = (t: Target) =>
  [t.university, t.department, t.probability == null ? "" : `${t.probability}%`]
    .filter(Boolean)
    .join(" ");

const classLabelOf = (s: PickerStudent) =>
  `${s.groupName ? `${s.groupName} ` : ""}${s.className ?? "반 없음"}${s.className ? "반" : ""}`;

function StudentPicker({
  students,
  found,
  selected,
  admin,
  q,
  onSearch,
  onPick,
}: {
  students: PickerStudent[];
  /** 이름 검색 결과(서버가 실명으로 거른다). */
  found: PickerStudent[];
  selected: PickerStudent | undefined;
  admin: boolean;
  /** 보낸 검색어. */
  q: string;
  onSearch: (q: string) => void;
  onPick: (id: string) => void;
}) {
  const gradeLabel = useGradeLabel();
  const [draft, setDraft] = useState(q);
  const grades = GRADE_ORDER.filter((g) => students.some((s) => s.grade === g));
  const classes = new Map<string, PickerStudent>();
  for (const s of students) {
    if (s.grade === selected?.grade && s.classId && !classes.has(s.classId)) {
      classes.set(s.classId, s);
    }
  }
  const names = q
    ? found
    : students.filter(
        (s) => s.classId === selected?.classId && s.grade === selected?.grade,
      );
  const firstOf = (match: (s: PickerStudent) => boolean) =>
    students.find(match)?.studentId;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 pb-6 md:px-8 lg:px-12">
      <FilterSelect
        label="학년그룹"
        value={selected?.grade ?? ""}
        options={grades.map((g) => ({ value: g, label: gradeLabel(g) }))}
        onChange={(grade) => {
          const id = firstOf((s) => s.grade === grade);
          if (id) onPick(id);
        }}
      />
      <FilterSelect
        label="반"
        value={selected?.classId ?? ""}
        options={[...classes.values()].map((s) => ({
          value: s.classId as string,
          label: classLabelOf(s),
        }))}
        onChange={(classId) => {
          const id = firstOf((s) => s.classId === classId);
          if (id) onPick(id);
        }}
      />
      <FilterSelect
        label="이름"
        value={selected?.studentId ?? ""}
        options={names.map((s) => ({ value: s.studentId, label: s.name }))}
        onChange={onPick}
      />
      {admin && (
        <>
          <Input
            aria-label="이름 검색"
            placeholder="이름 검색"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch(draft.trim())}
            className="h-10 w-[16.25rem]"
          />
          <Button
            type="button"
            onClick={() => onSearch(draft.trim())}
            className="h-10 rounded-lg px-5 text-app-label font-semibold"
          >
            검색
          </Button>
        </>
      )}
    </div>
  );
}

/** "2학년 1학년그룹 3반 1번" 처럼 학년, 반, 번호를 잇는다. 없는 조각은 뺀다. */
export function studentClassText(
  student: Coaching["student"],
  gradeLabel: GradeLabeler,
) {
  return [
    student.grade ? gradeLabel(student.grade) : null,
    student.className
      ? `${student.groupName ? `${student.groupName} ` : ""}${student.className}반`
      : null,
    student.number !== null ? `${student.number}번` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function StudentCard({ data }: { data: Coaching }) {
  const gradeLabel = useGradeLabel();
  const { student } = data;
  const signal = SIGNAL[data.signal];
  const meta = studentClassText(student, gradeLabel);
  return (
    <section className={CARD} aria-label="학생 정보">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <span
          aria-hidden
          className="flex size-16 items-center justify-center rounded-full bg-surface-avatar text-app-section font-bold text-ink-strong"
        >
          {student.name.slice(0, 1)}
        </span>
        <h2 className="text-app-section font-bold text-ink-strong">
          {student.name}
        </h2>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-app-label text-ink-sub">
          <span>{meta}</span>
          {student.homeroomName && <span>담임 {student.homeroomName}</span>}
          {student.lastSeenAt && (
            <span>최근 접속 {kstDotDate(student.lastSeenAt).slice(5)}</span>
          )}
          <span>
            이용 서비스 {student.servicesUsed}/{SERVICE_NAMES.length}
          </span>
        </p>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Chip tone={signal.tone} size="Lg">
            종합 코칭 신호: {signal.label}
          </Chip>
          <p className="text-app-caption text-ink-sub">{data.signalSubLine}</p>
        </div>
      </div>
      <hr className="border-line" />
      <div className="flex flex-wrap gap-2">
        {student.targets?.ideal && (
          <Chip tone="Badge">이상 {targetLabel(student.targets.ideal)}</Chip>
        )}
        {student.targets?.min && (
          <Chip tone="Neutral">최소 {targetLabel(student.targets.min)}</Chip>
        )}
        {SERVICE_NAMES.map(([key, name]) =>
          student.services[key] === "using" ? (
            <Chip key={key} tone="Info">
              {name}
            </Chip>
          ) : (
            <Chip key={key} tone="Disabled">
              {name} 이용 전
            </Chip>
          ),
        )}
      </div>
      {(student.targets?.ideal?.probability != null ||
        student.targets?.min?.probability != null) && (
        <p className="text-app-caption text-ink-sub">
          목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다
        </p>
      )}
    </section>
  );
}

export function SummaryCallout({ data }: { data: Coaching }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-info px-5 py-4">
      <div className="flex flex-col gap-1">
        <p className="text-app-label font-semibold text-primary">한줄 진단</p>
        <p className="text-app-body text-ink-strong">{data.summary}</p>
      </div>
      {data.text.priorityTask && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <p className="text-app-label font-semibold text-primary">우선 과제</p>
          <p className="text-app-body text-ink-strong">
            {data.text.priorityTask}
          </p>
        </div>
      )}
    </div>
  );
}

export function CompetencyList({ data }: { data: Coaching }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-app-label font-semibold text-ink-strong">
        대학 평가 5대 역량
      </h3>
      <ul aria-label="대학 평가 5대 역량" className="flex flex-col gap-3">
        {data.competencies.map((c) => (
          <li key={c.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-app-label font-semibold text-ink-strong">
                {c.name}
              </span>
              <span className="text-app-label font-bold text-ink-strong">
                {c.score !== null
                  ? `${c.score}점`
                  : (c.fallback ?? "자료 없음")}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${c.score ?? 0}%` }}
              />
            </div>
            <span className="text-app-caption text-ink-sub">
              근거 {c.basisUsed}/{c.basisTotal}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AxisPanel({ data }: { data: Coaching }) {
  const { strongest, weakest } = data.highlights;
  return (
    <div className="flex flex-col items-center gap-3">
      <h3 className="self-start text-app-label font-semibold text-ink-strong">
        6축 종합 진단
      </h3>
      <CoachingRadar axes={data.axes} />
      <ul aria-label="6축 종합 진단" className="grid w-full gap-2">
        {data.axes.map((a) => (
          <li
            key={a.key}
            className={cn(
              "flex items-baseline justify-between gap-2 text-app-label",
              a.status === "scored" ? "text-ink-strong" : "text-ink-sub",
            )}
          >
            <span>{a.name}</span>
            <span className="font-semibold">{axisStatusText(a)}</span>
          </li>
        ))}
      </ul>
      <dl className="grid w-full gap-1 text-app-label">
        {strongest && (
          <div className="flex gap-2">
            <dt className="text-ink-sub">최대장점</dt>
            <dd className="font-semibold text-ink-strong">
              {strongest.name} {strongest.score}점
            </dd>
          </div>
        )}
        {weakest && (
          <div className="flex gap-2">
            <dt className="text-ink-sub">가장 시급한 축</dt>
            <dd className="font-semibold text-ink-strong">
              {weakest.name} {weakest.score}점
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function DiagnosisCard({ data }: { data: Coaching }) {
  return (
    <section className={CARD} aria-label="6종 서비스 종합 진단">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-app-card-title font-semibold text-ink-strong">
          6종 서비스 종합 진단
        </h2>
        <Chip tone="Neutral">
          유형 {data.coachingType.code} {data.coachingType.name}
        </Chip>
      </div>
      <SummaryCallout data={data} />
      <div className="grid gap-8 md:grid-cols-2">
        <CompetencyList data={data} />
        <AxisPanel data={data} />
      </div>
      <Narrative data={data} />
    </section>
  );
}

function Skeleton() {
  return (
    <div
      role="status"
      aria-label="코칭 불러오는 중"
      className="flex min-w-0 flex-1 animate-pulse flex-col gap-6"
    >
      {["h-[11.625rem]", "h-[40rem]"].map((h) => (
        <div key={h} className={cn("rounded-2xl bg-neutral-200", h)} />
      ))}
    </div>
  );
}

export default function CoachingPage() {
  const { me } = useConsoleMe();
  const admin = me.kind !== "homeroom";
  const [params, setParams] = useSearchParams();
  // 이름 검색은 검색을 누르거나 Enter 를 칠 때만 보낸다(결정 61). 입력 중인 글은 StudentPicker 가 가진다.
  const [q, setQ] = useState("");
  const list = useCoachingStudents();
  const search = useCoachingStudents(admin ? q : "");
  const studentId =
    params.get("studentId") ?? list.data?.defaultStudentId ?? null;
  const coaching = useCoaching(studentId);

  const [windowService, setWindowService] = useState<ServiceKey | null>(null);
  const pick = (id: string) => {
    setWindowService(null);
    setParams({ studentId: id }, { replace: true });
  };
  useEffect(() => {
    if (!params.get("studentId") && list.data?.defaultStudentId) {
      setParams({ studentId: list.data.defaultStudentId }, { replace: true });
    }
  }, [params, list.data, setParams]);

  const students = list.data?.students ?? [];
  const selected = students.find((s) => s.studentId === studentId);
  const noStudent = list.isSuccess && students.length === 0;

  return (
    <>
      <PageHeader
        title="개인종합코칭"
        subtitle="6종 서비스 데이터를 한 화면에 모아 상담에 활용합니다"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={!selected}
            onClick={() =>
              window.open(
                `/teacher/coaching/print?studentId=${encodeURIComponent(studentId ?? "")}`,
                "_blank",
              )
            }
            className="h-12 rounded-lg px-6 text-base font-medium"
          >
            PDF 출력
          </Button>
        }
      />
      {noStudent ? (
        <EmptyMessage body="고를 학생이 없어요. 담당 학급이 없거나 학급에 학생이 없어요" />
      ) : (
        <>
          {list.isSuccess && (
            <StudentPicker
              students={students}
              found={search.data?.students ?? []}
              selected={selected}
              admin={admin}
              q={q}
              onSearch={setQ}
              onPick={pick}
            />
          )}
          {list.isPending && <Skeleton />}
          {(list.isError || coaching.isError) && (
            <EmptyMessage body="개인종합코칭을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요" />
          )}
          {studentId && windowService && (
            <ServiceWindow
              studentId={studentId}
              service={windowService}
              onClose={() => setWindowService(null)}
            />
          )}
          {studentId && (
            <div className="flex max-w-content flex-col gap-6 px-4 pb-24 md:px-8 lg:flex-row lg:items-start lg:px-12">
              <div className="order-first lg:order-last">
                <MemoPanel
                  key={studentId}
                  studentId={studentId}
                  admin={admin}
                />
              </div>
              {coaching.isPending && !coaching.isError && <Skeleton />}
              {coaching.data && (
                <div className="flex min-w-0 flex-1 flex-col gap-6">
                  <StudentCard data={coaching.data} />
                  <DiagnosisCard data={coaching.data} />
                  <ServiceCards
                    cards={coaching.data.serviceCards}
                    onOpen={setWindowService}
                  />
                  <GoalOpinionCard data={coaching.data} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
