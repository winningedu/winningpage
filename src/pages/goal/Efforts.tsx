import { useEffect, useEffectEvent, useState } from "react";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import AddWorkbookModal from "@/components/goal/modals/AddWorkbookModal";
import EffortSubjectCard from "@/components/goal/plan/EffortSubjectCard";
import AddSubjectModal from "@/components/goal/study/AddSubjectModal";
import {
  DEFAULT_TIMER_SUBJECTS,
  TIMER_SUBJECT_CATALOG,
} from "@/components/goal/studyRecordOptions";
import {
  getSubjectLabel,
  WORKBOOK_SUBJECT_IDS,
} from "@/components/goal/subjectTokens";
import {
  addGoalTimerSubject,
  createGoalWorkbook,
  deleteGoalWorkbook,
  fetchGoalPlanTasks,
  fetchGoalTimer,
  fetchGoalWorkbooks,
  shelveGoalWorkbook,
  updateGoalWorkbook,
} from "@/lib/goalApi";
import { kstYMD } from "@/lib/goalPlanUtils";

// 나의 노력 — Figma 4026:6046(디자이너 시안 재구현).
// 실데이터 배선(mockEfforts 제거) — src/data/goalPlanMock.js의 mockEfforts/mockEffortsEmpty는
// 더 이상 이 화면이 쓰지 않는다(디자인 참고용으로만 파일에 남겨둔다, 소비처 재확인 후 정리는
// 이번 범위 밖).
//
// 콘텐츠 폭(리뷰 반영, 2026-09-02): 전에는 문서 실측(1368px)이 GoalPageHeader 기본값
// (goal-content, 83.75rem/1340px)보다 넓다는 이유로 이 화면만 `goal-dashboard`
// (93rem/1488px)를 따로 썼다. 하지만 형제 서브페이지(Grades/WeeklyPlan/Timer 등)는
// 전부 goal-content라 이 화면만 눈에 띄게 넓어 일관성이 깨졌다(디자인 리뷰 지적) —
// 28px 차이는 목록형 카드 그리드에서 체감 이득이 크지 않아 형제 화면과 통일하는
// 쪽을 택한다. 본문 좌우 패딩도 형제 화면의 px-12 고정 대신 좁은 화면 여백을 남기는
// px-4 md:px-12로 맞춘다.

// QA 행361 — "+ 과목 추가하기"는 예전엔 문제집 등록 모달(AddWorkbookModal)을 여는 스텁이었다
// (part-10 §253에 별도 모달이 없어 임시로 재사용). 2026-08-31 머지된 열공 타이머(#25)의 과목
// 추가 모달(AddSubjectModal + addGoalTimerSubject, QA B9)이 생기면서 "과목을 추가한다"는
// 진짜 동선이 생겼다 — 이 헤더 버튼을 그쪽으로 옮긴다. 카드 목록도 더 이상 4개 고정이 아니라
// 열공 타이머와 같은 노출 과목 목록(GET /api/goal/timer visibleSubjects)을 그대로 따른다 —
// "타이머에 보이는 과목 = 나의노력에 보이는 과목"으로 두 화면의 과목 개념을 하나로 합친다
// (전에는 이 화면만 별도로 4과목 하드코딩이라 타이머에서 5번째 과목을 추가해도 여기 카드가
// 안 늘어났다). 문제집 등록(카드별 "+ 문제집 추가")은 그대로 AddWorkbookModal을 쓴다 — 그
// 동선은 이번 변경과 무관하다.

// 완독 행 페이드아웃(.book-row-out, src/index.css)과 짝을 이루는 지연 — 행이
// 사라지는 애니메이션이 보일 시간을 서버 응답과 병렬로 확보한다.
const SHELVE_ROW_EXIT_MS = 350;
// 책 드롭 애니메이션(.book-drop 0.6s, src/index.css)이 끝난 뒤 droppingBookId를
// 비우기까지의 지연 — 애니메이션 지속시간(600ms)보다 여유를 두어(300ms 버퍼)
// 느린 프레임에서도 애니메이션 도중 클래스가 빠지지 않게 한다.
const SHELVE_DROP_RESET_MS = 900;

// api/_lib/goal/repo.ts buildWorkbookPayload() 반환 shape.
type Workbook = {
  id: string | number;
  subject: string;
  title: string;
  // goalApi.ts의 GoalWorkbook과 동일하게 null 가능(서버 실값) — 이 파일에서는 상태 저장과
  // 필터링(subject/status)에만 쓰여 null이어도 안전하다.
  totalPages: number | null;
  currentPage: number | null;
  // api/_lib/goal/repo.ts computeWorkbookStatus() 반환값 그대로("in_progress"가 아니라
  // "reading" — 이전 주석이 실제 서버 값과 어긋나 있었다).
  status: "reading" | "done" | string;
  // "책장에 꽂기" 수동 전이(Figma 4026:6046) — null이면 status='done'이어도 아직
  // BookStack으로 안 옮겨진 상태. 카드 그리드는 이제 status가 아니라 이 필드로
  // "공부 중인 책"과 "완독 책장"을 나눈다.
  shelvedAt: string | null;
};

// 오늘 이 문제집에 연결된 계획 과제(QA 행286-B) — EffortWorkbookRow가 제목+상태만
// 보여주는 소형 목록에 쓴다.
type ConnectedTask = {
  id: string | number;
  title: string;
  status: "pending" | "done" | "fail";
};

export default function Efforts() {
  const [modalOpen, setModalOpen] = useState(false);
  const [presetSubject, setPresetSubject] = useState<string | null>(null);
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  // "완독! 책장에 꽂기" 직후 스택에 드롭 애니메이션을 걸 책 id. 1회성이라 잠시 뒤 비운다.
  const [droppingBookId, setDroppingBookId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  // 노출 과목 목록 — GET /api/goal/timer visibleSubjects(열공 타이머와 동일 소스, QA
  // 행361). 로딩 중엔 Timer.tsx와 같은 기본 4과목으로 잠깐 보여준다.
  const [visibleSubjects, setVisibleSubjects] = useState<string[]>(
    DEFAULT_TIMER_SUBJECTS,
  );
  // 오늘 날짜 기준 workbook_id → 연결된 과제 목록. 연결이 없는 문제집은 이 맵에
  // 아예 키가 없다(EffortWorkbookRow가 조회 실패해도 폴백 문구 없이 그냥 안 보임).
  const [connectedTasksByWorkbookId, setConnectedTasksByWorkbookId] = useState<
    Map<number, ConnectedTask[]>
  >(new Map());

  async function loadWorkbooks() {
    const outcome = await fetchGoalWorkbooks();
    if (outcome.kind === "success") {
      setWorkbooks(outcome.workbooks);
      setLoadError(false);
      return;
    }
    // no-session/not-allowed는 RequireGoalAccess가 라우트 진입 전에 이미 걸러낸다
    // (App.jsx:198/318 — 이 페이지는 그 게이트 안쪽에서만 렌더된다). 여기 도달했다면
    // 세션 만료 등 방어적 상황이라 재시도 안내만 하고 화면을 비우지 않는다.
    console.error("[Efforts] 문제집 목록 조회 실패:", outcome);
    setLoadError(true);
  }

  async function loadVisibleSubjects() {
    const result = await fetchGoalTimer();
    if (result.kind === "success" && result.summary?.visibleSubjects?.length) {
      setVisibleSubjects(result.summary.visibleSubjects);
    }
  }

  // 오늘 하루치 계획 과제 중 workbook_id가 걸린 것만 문제집별로 묶는다(QA 행286-B).
  // 실패해도 조용히 넘어간다 — 이 목록은 보조 정보라 loadError처럼 화면을 막지 않는다.
  async function loadConnectedTasks() {
    const today = kstYMD();
    const result = await fetchGoalPlanTasks({ from: today, to: today });
    if (result.kind !== "success") {
      console.error("[Efforts] 오늘 연결된 계획 과제 조회 실패:", result);
      return;
    }
    const grouped = new Map<number, ConnectedTask[]>();
    for (const task of result.tasks) {
      if (task.workbookId == null) continue;
      const list = grouped.get(task.workbookId) ?? [];
      list.push({ id: task.id, title: task.title, status: task.status });
      grouped.set(task.workbookId, list);
    }
    setConnectedTasksByWorkbookId(grouped);
  }

  const onMountLoadWorkbooks = useEffectEvent(() => {
    loadWorkbooks();
    loadVisibleSubjects();
    loadConnectedTasks();
  });

  useEffect(() => {
    onMountLoadWorkbooks();
  }, []);

  const canAddMoreSubjects =
    visibleSubjects.length < TIMER_SUBJECT_CATALOG.length;

  // "나의 노력" 카드는 열공 타이머의 8종 노출 목록이 아니라 goal_workbooks가 실제로
  // 지원하는 5종(WORKBOOK_SUBJECT_IDS)만 그린다 — goal_plan_tasks/goal_subject_targets/
  // goal_timer_sessions 세 테이블만 8종으로 넓어졌고(QA B9) goal_workbooks_subject_check는
  // 그대로 5종이라, 8종 그리드를 그대로 쓰면 6~8번째 카드에서 "+ 문제집 추가" 시 서버가
  // 400을 돌려주는 잠재 결함이 있었다(QA 행298 비고). "+ 과목 추가하기" 버튼(canAddMoreSubjects
  // 등)은 여전히 타이머 8종 카탈로그를 그대로 따른다 — 타이머 노출 여부와 별개로 워크북 카드는
  // 이 5종을 넘지 않는다.
  const cardSubjects = visibleSubjects.filter((id) =>
    WORKBOOK_SUBJECT_IDS.includes(id),
  );

  // AddSubjectModal의 onAdd 계약(Timer.tsx와 동일) — 성공하면 노출 목록을 다시
  // 불러와 카드 그리드를 즉시 갱신한다.
  async function handleAddSubject(subject: string) {
    const result = await addGoalTimerSubject(subject);
    if (result.kind !== "success") {
      throw new Error(`add-subject-failed:${result.kind}`);
    }
    await loadVisibleSubjects();
  }

  function openModal(subjectLabel: string | null) {
    setPresetSubject(subjectLabel ?? null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setPresetSubject(null);
  }

  // AddWorkbookModal은 이제 신규 등록에만 쓴다(편집은 EffortWorkbookRow 인라인 입력으로
  // 이동, 팀장 지시 — 시안에 별도 수정 모달이 없다). false를 돌려주면 모달이 닫히지
  // 않는다(제출 실패 시 입력을 잃지 않도록).
  async function handleModalSubmit({
    subject,
    title,
    currentPage,
    totalPage,
  }: {
    subject: string;
    title: string;
    currentPage: number;
    totalPage: number;
  }) {
    const outcome = await createGoalWorkbook({
      subject,
      title,
      totalPages: totalPage,
      currentPage,
    });

    if (outcome.kind !== "success") {
      console.error("[Efforts] 문제집 등록 실패:", outcome);
      return false;
    }

    await loadWorkbooks();
    return true;
  }

  // EffortWorkbookRow의 onUpdate 계약 — 제목/현재·전체 페이지 인라인 편집(blur/Enter)이
  // 여기로 온다.
  async function handleUpdateWorkbook(
    id: string | number,
    patch: { title?: string; currentPage?: number; totalPages?: number },
  ) {
    const outcome = await updateGoalWorkbook({
      // GoalWorkbook.id는 항상 DB 숫자 PK다 — 행이 재사용 목적으로 넓게 잡은
      // string|number 타입만 여기서 좁힌다.
      id: id as number,
      ...patch,
    });

    if (outcome.kind !== "success") {
      console.error("[Efforts] 문제집 수정 실패:", outcome);
      return false;
    }

    await loadWorkbooks();
    return true;
  }

  // EffortWorkbookRow의 onDelete 계약 — 삭제도 이제 카드 인라인 ×에서 온다(QA 행321).
  async function handleDeleteWorkbook(id: string | number) {
    const outcome = await deleteGoalWorkbook(id as number);
    if (outcome.kind !== "success") {
      console.error("[Efforts] 문제집 삭제 실패:", outcome);
      return false;
    }

    await loadWorkbooks();
    return true;
  }

  // 행의 사라지는 애니메이션(.book-row-out, SHELVE_ROW_EXIT_MS)이 보일 최소 시간을
  // 확보하는 헬퍼 — 데이터 요청(shelveGoalWorkbook)과는 별개 관심사라 분리한다.
  function waitForRowExit() {
    return new Promise((resolve) =>
      window.setTimeout(resolve, SHELVE_ROW_EXIT_MS),
    );
  }

  // EffortWorkbookRow의 onShelve 계약 — "완독! 책장에 꽂기" 버튼(달성률 100%에서만
  // 노출)이 호출한다. 서버가 status='done'이 아니면 400(validation-error)을 준다.
  async function handleShelveWorkbook(id: string | number) {
    // 응답이 빨라도 행이 툭 사라지지 않도록 애니메이션 대기와 서버 요청을 병렬로 건다.
    const [outcome] = await Promise.all([
      shelveGoalWorkbook(id as number),
      waitForRowExit(),
    ]);
    if (outcome.kind !== "success") {
      console.error("[Efforts] 책장에 꽂기 실패:", outcome);
      return false;
    }

    setDroppingBookId(Number(id));
    await loadWorkbooks();
    window.setTimeout(() => {
      setDroppingBookId((current) => (current === Number(id) ? null : current));
    }, SHELVE_DROP_RESET_MS);
    return true;
  }

  // 완독 N권 카운터는 status가 아니라 shelvedAt 기준이다 — status='done'이지만 아직
  // 책장에 안 꽂은 책은 세지 않는다(위 Workbook 타입 주석 참고).
  const totalCompleted = workbooks.filter(
    (book) => book.shelvedAt !== null,
  ).length;

  return (
    <>
      <GoalPageHeader
        title="나의 노력"
        meta={<CountBadge count={totalCompleted} />}
        subcopy="완독한 책들이 차곡차곡 쌓여갑니다. 성적이 아닌 실행 자체를 봅니다."
        actions={
          // `+ 과목 추가하기` — 열공 타이머(#25)와 같은 AddSubjectModal을 연다(QA 행361).
          // 카탈로그 8종을 이미 다 노출 중이면 더 고를 게 없어 숨긴다(Timer.tsx
          // canAddMoreSubjects와 동일 조건).
          canAddMoreSubjects && (
            <button
              type="button"
              onClick={() => setAddSubjectOpen(true)}
              className="text-app-label font-medium text-ink-sub underline-offset-2 hover:text-ink-strong hover:underline"
            >
              + 과목 추가하기
            </button>
          )
        }
        maxWidthClassName="max-w-goal-content"
      />

      <div className="max-w-goal-content px-4 pb-24 md:px-12">
        {loadError && (
          <p className="mb-4 text-app-body text-ink-sub">
            문제집 목록을 불러오지 못했습니다. 새로고침해 주세요.
          </p>
        )}

        {/* items-stretch(그리드 기본값)로 같은 행 카드끼리 높이를 맞춘다 — 카드 자체는
            더 이상 고정 높이가 아니라(EffortSubjectCard 주석 참고) 내용이 많은 카드가
            그 행의 다른 카드도 함께 늘린다. */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14.5rem,1fr))] items-stretch gap-6">
          {cardSubjects.map((id) => {
            const label = getSubjectLabel(id);
            const subjectBooks = workbooks.filter(
              (book) => book.subject === id,
            );
            // 완독 책장(BookStack) = shelvedAt이 채워진 행만. status='done'인데 아직
            // 안 꽂았으면 아래 registeredBooks 쪽에 완독 버튼과 함께 남는다.
            const shelvedBooks = subjectBooks.filter(
              (book) => book.shelvedAt !== null,
            );
            const registeredBooks = subjectBooks.filter(
              (book) => book.shelvedAt === null,
            );

            return (
              <EffortSubjectCard
                key={id}
                subject={label}
                completed={shelvedBooks.length}
                books={registeredBooks}
                completedBooks={shelvedBooks}
                droppingBookId={droppingBookId}
                connectedTasksByWorkbookId={connectedTasksByWorkbookId}
                onAddBook={() => openModal(label)}
                onUpdateBook={handleUpdateWorkbook}
                onDeleteBook={handleDeleteWorkbook}
                onShelveBook={handleShelveWorkbook}
              />
            );
          })}
        </div>
      </div>

      <AddSubjectModal
        open={addSubjectOpen}
        onClose={() => setAddSubjectOpen(false)}
        visibleSubjects={visibleSubjects}
        onAdd={handleAddSubject}
      />

      <AddWorkbookModal
        open={modalOpen}
        onClose={closeModal}
        initialSubject={presetSubject}
        onSubmit={handleModalSubmit}
      />
    </>
  );
}

// 완독 카운트 뱃지 — 인스턴스 내부 텍스트라 정확한 HEX가 없어 근사 연보라 톤(추정,
// part-10 §219 "연보라 필 + 보라 텍스트(추정)")을 쓴다. 색은 로컬 hex가 아니라
// src/index.css `--color-goal-badge-purple-*` 토큰(리뷰 반영 — 이 화면만 로컬
// hex로 흩어져 있던 걸 다른 goal 색 토큰들과 같은 방식으로 통일한다).
function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-8 items-center justify-center rounded-full bg-goal-badge-purple-bg px-3 text-app-label font-semibold text-goal-badge-purple-text">
      총 {count}권 완독
    </span>
  );
}
