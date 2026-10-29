import { useEffect, useState } from "react";
import AppModal from "@/components/goal/AppModal";
import {
  TASK_DURATIONS,
  TASK_SCHEDULES,
  TASK_SUBJECTS,
  WEEKDAY_CHIP_LABELS,
  WEEKDAY_REPEAT_SCHEDULE,
} from "@/components/goal/goalFormOptions";
import ModalField from "@/components/goal/ModalField";
import SegmentedChipGroup from "@/components/goal/SegmentedChipGroup";
import { resolveSubjectId } from "@/components/goal/subjectTokens";
import { fetchGoalWorkbooks } from "@/lib/goalApi";

// 과제 추가 모달 — docs/figma-goal/part-06.md #16 (530×468 = 33.125rem × 29.25rem, 높이는 주석용).
// 트리거: StudyPlanRail("+")·주간 학습 계획표 컬럼 "+ 추가".
//
// 실 저장은 호출부의 onSubmit이 담당한다(이 컴포넌트는 폼 상태·검증만 소유) — 호출부마다
// "일정(오늘만/이번 주만/매주 반복)"을 몇 개의 plan_date로 펼칠지가 다르기 때문이다
// (StudyPlanRail은 항상 오늘 기준, WeeklyPlan은 화살표로 이동한 임의의 주 기준 —
// src/lib/goalPlanUtils.js). onSubmit 미지정 시 콘솔 로그로 물러난다(단계 E 이전 호출부 보호).
const SUBJECT_OPTIONS = TASK_SUBJECTS.map((label) => ({
  value: label,
  label,
}));
const DURATION_OPTIONS = TASK_DURATIONS.map((label) => ({
  value: label,
  label,
}));
const SCHEDULE_OPTIONS = TASK_SCHEDULES.map((label) => ({
  value: label,
  label,
}));

// 시안(#16) 실측 표시값 — 옵션 목록엔 없던 값이라도 셀렉트 기본값으로 그대로 채택.
const DEFAULT_DURATION = "1시간 30분";
const DEFAULT_SCHEDULE = "이번 주만";

// Date#getDay() 인덱스(0=일요일 ~ 6=토요일) 순 요일명 — WeekdayPlanBoard의 DAY_KEY와 동일 표기.
const WEEKDAY_NAMES = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];

function getTodayLabel() {
  return WEEKDAY_NAMES[new Date().getDay()];
}

type AddTaskModalSubmitPayload = {
  subject: string | null;
  taskText: string;
  duration: string;
  schedule: string;
  // "선택요일반복"일 때만 실린다 — 고른 요일 인덱스(월=0 ~ 일=6, 오름차순).
  weekdays?: number[];
  // 문제집 연결(QA 행286-B, 선택) — 연결 안 하면 셋 다 없다. workbookId만 있고
  // 페이지가 없으면 페이지 없이 연결만, 셋 다 있으면 페이지 범위까지 연결한다
  // (api/goal/plan-tasks.ts validateWorkbookLinkFields와 같은 규약).
  workbookId?: number;
  pageFrom?: number;
  pageTo?: number;
};

type WorkbookOption = {
  id: number;
  title: string;
  totalPages: number | null;
  // 과목 id(korean/math/english/science/etc) — 선택된 과목 우선 정렬용(임무 지시
  // 후속, 2026-09-02). 과목 필터 자체는 그대로 두고(전 과목 노출) 정렬만 우선한다.
  subject: string;
};

type AddTaskModalProps = {
  open: boolean;
  onClose: () => void;
  day?: string;
  onSubmit?: (payload: AddTaskModalSubmitPayload) => void | Promise<void>;
};

// day prop 미지정 호출부(StudyPlanRail 등 대시보드 트리거)는 오늘 요일을 기본값으로 쓴다.
// onSubmit({ subject, taskText, duration, schedule })는 async여도 된다 — 완료될 때까지
// 버튼을 disabled로 막아 이중 제출을 막는다. reject하면 폼을 유지한 채(닫지 않고) 콘솔에만
// 에러를 남긴다 — 네트워크 실패로 입력을 날리지 않기 위해서다.
export default function AddTaskModal({
  open,
  onClose,
  day = getTodayLabel(),
  onSubmit,
}: AddTaskModalProps) {
  // 시안은 "수학" 칩이 이미 선택된 상태로 그려져 있지만, 그건 스크린샷용 데모 상태다.
  // 확정 사항 §4(필수값 미입력 시 저장 버튼 disabled)를 실제로 보여주려면 빈 상태로 시작해야 한다.
  const [subject, setSubject] = useState<string | null>(null);
  const [taskText, setTaskText] = useState("");
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 문제집 연결(QA 행286-B, 선택) — workbookId는 select value라 문자열("" = 연결 안
  // 함)로 들고, 페이지 두 칸은 문제집을 고른 뒤에만 보인다.
  const [workbooks, setWorkbooks] = useState<WorkbookOption[]>([]);
  const [workbookId, setWorkbookId] = useState("");
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");

  // 모달을 열 때마다 "읽는 중"(status: reading) 문제집 목록을 새로 불러온다 — 다른
  // 화면(나의 노력)에서 방금 등록·완독했을 수 있어 열릴 때마다 최신으로 맞춘다.
  // AddTaskModal은 StudyPlanRail/WeeklyPlan에 상시 마운트돼 있고 open으로만
  // 보이고 숨겨진다(부모가 언마운트하지 않는다) — 그래서 open을 의존성으로 둔다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchGoalWorkbooks().then((result) => {
      if (cancelled) return;
      if (result.kind === "success") {
        setWorkbooks(
          result.workbooks
            .filter((book) => book.status === "reading")
            .map((book) => ({
              id: book.id,
              title: book.title,
              totalPages: book.totalPages,
              subject: book.subject,
            })),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedWorkbook =
    workbooks.find((book) => String(book.id) === workbookId) ?? null;
  const totalPages = selectedWorkbook?.totalPages ?? null;
  const pageFromNum = pageFrom === "" ? null : Number(pageFrom);
  const pageToNum = pageTo === "" ? null : Number(pageTo);
  // 페이지 두 칸은 "둘 다 비움" 또는 "둘 다 채움"만 허용한다(서버 검증과 동일 규약,
  // api/goal/plan-tasks.ts validateWorkbookLinkFields) — 한쪽만 채우면 저장 버튼을 막는다.
  const pageRangeInvalid =
    Boolean(selectedWorkbook) &&
    ((pageFrom === "") !== (pageTo === "") ||
      (pageFromNum != null && pageToNum != null && pageFromNum > pageToNum) ||
      (totalPages != null && pageToNum != null && pageToNum > totalPages));

  // 문제집 select 정렬(임무 지시 후속, 2026-09-02) — 과목 필터는 그대로 두고(전
  // 과목 노출) 위에서 고른 과목과 같은 문제집만 앞으로 당긴다. Array#sort는
  // 안정 정렬(ES2019+)이라 같은 그룹 안에서는 원래 순서(등록 오래된 순)가 유지된다.
  const selectedSubjectId = subject ? resolveSubjectId(subject) : null;
  const sortedWorkbooks = selectedSubjectId
    ? [...workbooks].sort((a, b) => {
        const aMatch = a.subject === selectedSubjectId ? 0 : 1;
        const bMatch = b.subject === selectedSubjectId ? 0 : 1;
        return aMatch - bMatch;
      })
    : workbooks;

  // 문제집을 연결한 과제는 완전히 단일 날짜(선택한 그 날)만 허용한다(임무 지시
  // 정정, 2026-09-02) — "이번 주만"의 7일 복제도 막는다. 선택지 자체를 "선택한
  // 날짜에만" 하나로 좁히고 select를 통째로 비활성해 값을 바꿀 수 없게 한다.
  // 내부 값은 그대로 "오늘만"을 쓴다 — StudyPlanRail/WeeklyPlan의 단일 날짜
  // 분기(`schedule === "오늘만"`)를 그대로 재사용하기 위해서다.
  const scheduleOptions = selectedWorkbook
    ? [{ value: "오늘만", label: "선택한 날짜에만" }]
    : SCHEDULE_OPTIONS;

  const isWeekdayRepeat = schedule === WEEKDAY_REPEAT_SCHEDULE;
  const weekdaysInvalid = isWeekdayRepeat && weekdays.length === 0;

  const canSubmit =
    Boolean(subject) &&
    !weekdaysInvalid &&
    taskText.trim().length > 0 &&
    !submitting &&
    !pageRangeInvalid;

  function resetForm() {
    setSubject(null);
    setTaskText("");
    setDuration(DEFAULT_DURATION);
    setSchedule(DEFAULT_SCHEDULE);
    setWeekdays([]);
    setSubmitting(false);
    setWorkbookId("");
    setPageFrom("");
    setPageTo("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function buildPayload(): AddTaskModalSubmitPayload {
    return {
      subject,
      taskText,
      duration,
      schedule,
      ...(isWeekdayRepeat ? { weekdays } : {}),
      ...(selectedWorkbook
        ? {
            workbookId: selectedWorkbook.id,
            ...(pageFromNum != null && pageToNum != null
              ? { pageFrom: pageFromNum, pageTo: pageToNum }
              : {}),
          }
        : {}),
    };
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    const payload = buildPayload();

    if (!onSubmit) {
      // onSubmit 미지정 호출부 방어선 — 정상 경로에선 도달하지 않는다(모든 호출부가 배선 완료).
      console.log("[AddTaskModal] submit (no onSubmit handler)", payload);
      handleClose();
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(payload);
      handleClose();
    } catch (error) {
      console.error("[AddTaskModal] onSubmit 실패:", error);
      setSubmitting(false);
    }
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="과제 추가"
      subtitle={`${day} 학습 계획에 추가할 과제를 입력하세요`}
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel={submitting ? "추가하는 중…" : "과제 추가하기"}
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      <div>
        <p className="mb-6.75 text-app-label font-semibold text-ink-strong">
          과목<span className="ml-1 text-error">*</span>
        </p>
        <SegmentedChipGroup
          ariaLabel="과목"
          options={SUBJECT_OPTIONS}
          value={subject ?? ""}
          onChange={setSubject}
        />
      </div>

      <ModalField
        label="할 일"
        variant="text"
        value={taskText}
        onChange={(event) => setTaskText(event.target.value)}
        placeholder="예) 미적분 3단원 문제 30개"
        required
      />

      <div className="grid grid-cols-2 gap-2">
        <ModalField
          label="예상 소요 시간"
          variant="select"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          options={DURATION_OPTIONS}
        />
        <ModalField
          label="일정"
          variant="select"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          options={scheduleOptions}
          disabled={Boolean(selectedWorkbook)}
          {...(selectedWorkbook
            ? { hint: "문제집 연결 과제는 해당 날짜에만 추가됩니다" }
            : {})}
        />
      </div>

      {isWeekdayRepeat && (
        <div>
          <div className="flex gap-1.5">
            {WEEKDAY_CHIP_LABELS.map((label, index) => {
              const selected = weekdays.includes(index);
              return (
                // biome-ignore lint/a11y/useSemanticElements: SegmentedChipGroup과 같은 칩 버튼 톤을 쓰는 다중선택이라 button + role="checkbox"로 둔다.
                <button
                  key={label}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() =>
                    setWeekdays((prev) =>
                      (prev.includes(index)
                        ? prev.filter((day) => day !== index)
                        : [...prev, index]
                      ).sort((a, b) => a - b),
                    )
                  }
                  className={`h-9.75 min-w-0 flex-1 rounded-lg border text-app-label font-medium transition-colors ${
                    selected
                      ? "border-accent bg-surface-03 font-bold text-accent"
                      : "border-[#E3E3E3] bg-white text-ink-sub"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {weekdaysInvalid && (
            <p className="mt-1.5 text-app-label text-error">
              요일을 1개 이상 선택해 주세요
            </p>
          )}
        </div>
      )}

      {/* 문제집 연결(선택, QA 행286-B) — "나의 노력"에 등록된 읽는 중인 문제집만
          고를 수 있다(완독한 책은 진도를 더 전진시킬 이유가 없어 목록에서 뺀다).
          시안에 없는 신규 필드라 기존 select 2종과 같은 ModalField 톤으로 맞춘다.
          목록은 위에서 고른 과목이 앞으로 오게 정렬한다(sortedWorkbooks). */}
      <ModalField
        label="문제집 연결 (선택)"
        variant="select"
        value={workbookId}
        onChange={(event) => {
          const nextWorkbookId = event.target.value;
          setWorkbookId(nextWorkbookId);
          setPageFrom("");
          setPageTo("");
          // 문제집을 연결하면 일정을 완전히 단일 날짜로 고정한다(임무 지시 정정,
          // 2026-09-02) — 위 scheduleOptions가 select 자체를 비활성하는 것과 짝.
          // 연결을 해제하면(nextWorkbookId === "") 다시 기본값으로 되돌린다.
          setSchedule(nextWorkbookId ? "오늘만" : DEFAULT_SCHEDULE);
        }}
        options={[
          { value: "", label: "연결 안 함" },
          ...sortedWorkbooks.map((book) => ({
            value: String(book.id),
            label: book.title,
          })),
        ]}
      />

      {selectedWorkbook && (
        <div className="grid grid-cols-2 gap-2">
          <ModalField
            label="시작 페이지"
            variant="number"
            value={pageFrom}
            onChange={(event) => setPageFrom(event.target.value)}
            placeholder="예) 10"
            min={1}
            max={totalPages ?? undefined}
          />
          <ModalField
            label="끝 페이지"
            variant="number"
            value={pageTo}
            onChange={(event) => setPageTo(event.target.value)}
            placeholder="예) 20"
            min={1}
            max={totalPages ?? undefined}
          />
        </div>
      )}
    </AppModal>
  );
}
