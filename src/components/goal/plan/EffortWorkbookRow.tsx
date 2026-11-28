import { X } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  getBookDarkTextClass,
  getBookLightBgClass,
} from "@/components/goal/subjectTokens";
import { computeAchievementRate } from "@/lib/goal/workbookProgress";

// 「공부 중인 책」 인셋 박스 안의 문제집 1권 인라인 편집 행 — Figma 4026:6046.
// 제목/현재·전체 페이지를 인라인 입력(dashed)으로 바로 편집하고 blur/Enter에 저장한다
// (시안에 별도 수정 모달이 없다 — 팀장 지시: AddWorkbookModal은 이제 신규 등록에만
// 쓴다). 삭제는 시안에 없어 제목 행 우측 작은 ×로 넣고, 기존 인라인 2단계 확인
// 패턴(CouponAdmin.tsx voidingId)을 그대로 준용한다. 달성률 100%면 "완독! 책장에
// 꽂기" 버튼이 나타난다 — 서버가 자동으로 책장에 옮기지 않고 이 버튼을 눌러야
// shelved_at이 채워진다(수동 전이, supabase/migrations/
// 20260902043539_goal_workbooks_shelved_at.sql).

export type EffortBook = {
  id: string | number;
  title: string;
  currentPage: number | null;
  totalPages: number | null;
};

type ConnectedPlanTask = {
  id: string | number;
  title: string;
  status: "pending" | "done" | "fail";
};

const CONNECTED_TASK_GLYPH: Record<ConnectedPlanTask["status"], string> = {
  done: "✓",
  fail: "✕",
  pending: "대기",
};

type EffortWorkbookRowProps = {
  book: EffortBook;
  // 과목 id(korean/math/english/science/etc) — 진행바 채움/완독 버튼 색 계산용.
  subject: string;
  // 오늘 이 책에 연결된 계획 과제(QA 행286-B) — 없거나 undefined면 목록을 아예
  // 렌더하지 않는다(폴백 문구 없음, [[no-fallback-constants]]).
  connectedTasks?: ConnectedPlanTask[];
  onUpdate: (
    id: string | number,
    patch: { title?: string; currentPage?: number },
  ) => Promise<boolean>;
  onDelete: (id: string | number) => Promise<boolean>;
  onShelve: (id: string | number) => Promise<boolean>;
};

/** 키 입력이 멈춘 뒤 자동 저장까지의 지연. */
const AUTOSAVE_DELAY_MS = 600;
/** "저장됨" 표시가 다시 idle로 돌아가기까지 유지되는 시간. */
const SAVED_LABEL_HOLD_MS = 1500;

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_STATE_LABEL: Record<Exclude<SaveState, "idle">, string> = {
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장 실패 — 다시 시도",
};

type Patch = { title?: string; currentPage?: number };

export default function EffortWorkbookRow({
  book,
  subject,
  connectedTasks,
  onUpdate,
  onDelete,
  onShelve,
}: EffortWorkbookRowProps) {
  const [title, setTitle] = useState(book.title);
  const [currentPage, setCurrentPage] = useState(String(book.currentPage ?? 0));
  // 전체 페이지는 등록 시 확정되고 이후 수정 불가(사용자 확정 2026-09-02) —
  // 입력이 아니라 표시만 한다. 현재 페이지는 0~전체 범위로 잠근다.
  const totalPages = book.totalPages ?? 0;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shelving, setShelving] = useState(false);

  // 자동저장 상태(FF HIGH 반영) — 별도 저장 버튼이 없어 "언제 저장되지?"가 없도록
  // 달성률 옆에 상태 텍스트를 둔다.
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // 디바운스 타이머 id — blur/Enter가 "즉시 flush"할 대상. 이 컴포넌트는 title/
  // currentPage 두 필드를 갖지만 저장 경로는 이 타이머 하나로 통일한다(전에는
  // 필드별 useEffect 두 개 + blur의 commitTitle/commitPages 두 함수까지 총 네
  // 경로가 있어 같은 값을 두 번 저장하는 이중 저장 경로였다).
  const saveTimerRef = useRef<number | null>(null);
  const savedResetTimerRef = useRef<number | null>(null);
  // 저장 요청이 진행 중일 때 값이 또 바뀌면 새 요청을 바로 쏘지 않고 이 플래그만
  // 세운다 — 진행 중 요청이 끝난 뒤 최신값으로 한 번만 더 저장한다(요청 중복 방지).
  const savingRef = useRef(false);
  const retryPendingRef = useRef(false);

  // 서버 재조회로 같은 책의 제목/진도가 바뀌면(다른 탭에서 수정 등) 로컬 초안을 다시
  // 채운다. book.id는 의존성에 넣지 않는다 — 이 컴포넌트는 EffortSubjectCard에서
  // key={book.id}로 렌더되므로 다른 책으로 바뀌는 경우는 항상 재마운트고, 같은
  // 인스턴스가 살아있는 동안은 book.id가 바뀔 일이 없다(biome
  // lint/correctness/useExhaustiveDependencies 지적 반영).
  useEffect(() => {
    setTitle(book.title);
    setCurrentPage(String(book.currentPage ?? 0));
    setConfirmingDelete(false);
  }, [book.title, book.currentPage]);

  // 언마운트 시 대기 중인 타이머를 정리한다.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current != null)
        window.clearTimeout(saveTimerRef.current);
      if (savedResetTimerRef.current != null)
        window.clearTimeout(savedResetTimerRef.current);
    };
  }, []);

  const rate = computeAchievementRate(Number(currentPage) || 0, totalPages);
  // "완독! 책장에 꽂기"는 달성률 표시값(내림)이 아니라 실제 페이지 비교로 판정한다 —
  // 서버 status(current >= total)와 같은 기준. 입력 중인(아직 blur 안 한) 값도
  // 포함해 마지막 쪽을 치는 순간 버튼이 뜬다; 저장은 handleShelve가 꽂기 전에 한다.
  const typedCurrent = Math.min(
    Math.max(Number(currentPage) || 0, 0),
    totalPages,
  );
  const isComplete = totalPages > 0 && typedCurrent >= totalPages;

  function clampCurrentPage(raw: string) {
    if (raw === "") return "";
    const value = Math.floor(Number(raw));
    if (!Number.isFinite(value)) return "";
    return String(Math.min(Math.max(value, 0), totalPages));
  }
  const lightBg = getBookLightBgClass(subject);
  const darkText = getBookDarkTextClass(subject);

  // 로컬 초안(title/currentPage)을 book(마지막으로 서버에 확인된 값)과 비교해
  // 실제로 바뀐 필드만 담는다. null이면 저장할 게 없다.
  function buildPatch(): Patch | null {
    const patch: Patch = {};
    const trimmedTitle = title.trim();
    if (trimmedTitle && trimmedTitle !== book.title) patch.title = trimmedTitle;
    if (currentPage !== "") {
      const next = Math.min(Math.max(Number(currentPage) || 0, 0), totalPages);
      if (next !== (book.currentPage ?? 0)) patch.currentPage = next;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  }

  // 실제 저장 실행 — useEffectEvent로 감싸 디바운스 타이머가 나중에(600ms 뒤) 발동할
  // 때도, handleShelve가 즉시 호출할 때도 항상 "그 시점의 최신" title/currentPage/
  // book을 본다(리렌더마다 새로 만들어지는 buildPatch를 그대로 참조해도 안전 —
  // Effect Event는 호출 시점 최신 렌더의 함수 본문을 실행한다).
  const performSave = useEffectEvent(async (): Promise<boolean> => {
    const patch = buildPatch();
    if (!patch) {
      setSaveState("idle");
      return true;
    }
    if (savingRef.current) {
      retryPendingRef.current = true;
      return true;
    }
    savingRef.current = true;
    setSaveState("saving");
    const ok = await onUpdate(book.id, patch);
    savingRef.current = false;
    if (!ok) {
      setSaveState("error");
      setTitle(book.title);
      setCurrentPage(String(book.currentPage ?? 0));
      retryPendingRef.current = false;
      return false;
    }
    if (retryPendingRef.current) {
      retryPendingRef.current = false;
      return performSave();
    }
    setSaveState("saved");
    if (savedResetTimerRef.current != null)
      window.clearTimeout(savedResetTimerRef.current);
    savedResetTimerRef.current = window.setTimeout(
      () => setSaveState("idle"),
      SAVED_LABEL_HOLD_MS,
    );
    return true;
  });

  // 디바운스 스케줄링 — title/currentPage(또는 그 비교 기준인 book.*)가 바뀔 때만
  // 재등록한다. buildPatch를 deps에 넣지 않는다 — 매 렌더 새로 만들어지는 함수라
  // 넣으면 저장과 무관한 리렌더(saveState 전환 등)에도 타이머가 리셋돼 디바운스가
  // 깨진다. 그래서 실제 비교값(dirty 여부)만 이 안에서 다시 계산한다(buildPatch와
  // 로직은 같되 위치만 인라인 — 의도적 중복).
  useEffect(() => {
    const trimmedTitle = title.trim();
    const titleDirty = trimmedTitle !== "" && trimmedTitle !== book.title;
    const pageDirty =
      currentPage !== "" &&
      Math.min(Math.max(Number(currentPage) || 0, 0), totalPages) !==
        (book.currentPage ?? 0);
    if (!titleDirty && !pageDirty) return;

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void performSave();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [title, currentPage, book.title, book.currentPage, totalPages]);

  // blur/Enter 전용 경로 — 별도 commit 함수 없이 "대기 중인 타이머가 있으면 지금
  // 당겨서 저장"만 한다. 대기 중인 타이머가 없으면(값이 안 바뀜) 아무 것도 안 한다.
  function flushPendingSave() {
    if (saveTimerRef.current == null) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    void performSave();
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  async function handleConfirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(book.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleShelve() {
    if (shelving) return;
    setShelving(true);
    try {
      // 대기 중인 자동저장 타이머가 있으면 흡수한다 — 아래에서 곧바로 최신
      // currentPage를 저장하므로 타이머가 나중에 또 쏘면 같은 값을 두 번 보내는
      // 중복 요청이 된다(FF HIGH).
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // 입력만 하고 blur 전에 바로 꽂기를 누른 경우 — 서버는 저장된 current_page로
      // status를 판정하므로 미저장 페이지를 먼저 반영한 뒤 꽂는다.
      if (typedCurrent !== (book.currentPage ?? 0)) {
        const saved = await performSave();
        if (!saved) return;
      }
      await onShelve(book.id);
    } finally {
      setShelving(false);
    }
  }

  const saveLabel = saveState === "idle" ? null : SAVE_STATE_LABEL[saveState];

  return (
    <div
      className={`flex w-full flex-col gap-1.5${shelving ? " book-row-out" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          aria-label="문제집 이름"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={flushPendingSave}
          onKeyDown={blurOnEnter}
          className="h-7 w-full min-w-0 rounded-md border border-dashed border-line bg-goal-card px-2 text-app-card-title text-ink-strong focus:border-ink-strong focus-visible:ring-2 focus-visible:ring-ink-strong/40 focus:outline-hidden"
        />

        {confirmingDelete ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="text-app-caption font-semibold text-error transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {deleting ? "삭제 중" : "삭제"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="text-app-caption font-medium text-ink-sub transition-colors hover:text-ink-strong disabled:opacity-50"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label="문제집 삭제"
            className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-sub transition-colors hover:text-error"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="number"
          aria-label="현재 페이지"
          min={0}
          max={totalPages}
          value={currentPage}
          onChange={(event) =>
            setCurrentPage(clampCurrentPage(event.target.value))
          }
          onBlur={flushPendingSave}
          onKeyDown={blurOnEnter}
          className="h-7 w-[7ch] min-w-16 rounded-md border border-dashed border-line bg-goal-card px-2 text-app-card-title text-ink-strong focus:border-ink-strong focus-visible:ring-2 focus-visible:ring-ink-strong/40 focus:outline-hidden"
        />
        <span className="text-app-card-title font-medium text-ink-natural">
          /
        </span>
        <output
          aria-label="전체 페이지"
          className="flex h-7 w-[7ch] min-w-16 items-center rounded-md border border-surface-01 bg-goal-activePill px-2 text-app-card-title text-ink-sub"
        >
          {totalPages}
        </output>
        <span className="ml-auto flex items-center gap-1.5 text-app-caption">
          {saveLabel && (
            <span
              aria-live="polite"
              className={saveState === "error" ? "text-error" : "text-ink-sub"}
            >
              {saveLabel}
            </span>
          )}
          {/* 대비 보강(WCAG AA, 2026-09-02) — 부모 span이 text-[0.75rem](12px)라
              ink-natural(#808080, 3.8:1)은 0.875rem 이하 텍스트 기준 미달이다.
              ink-sub(#6b6b6b, 5.7:1)로 교체(값 자체가 아니라 이 화면의 쓰임만 바꾼다). */}
          <span className="text-ink-sub">{rate}%</span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="달성률"
        aria-valuenow={rate}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-3 w-full overflow-hidden rounded-full bg-goal-activePill"
      >
        <div
          className={`h-full rounded-full ${lightBg}`}
          style={{ width: `${rate}%` }}
        />
      </div>

      {/* 오늘 연결된 계획 과제 소형 목록(QA 행286-B) — 없으면 아무것도 렌더하지
          않는다("준비 중" 등 폴백 문구 없음). */}
      {connectedTasks && connectedTasks.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {connectedTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-1.5 text-app-badge text-ink-sub"
            >
              <span
                aria-hidden="true"
                className={
                  task.status === "done"
                    ? "text-[#4CAF6D]"
                    : task.status === "fail"
                      ? "text-error"
                      : "text-ink-sub"
                }
              >
                {CONNECTED_TASK_GLYPH[task.status]}
              </span>
              <span className="truncate">{task.title}</span>
            </li>
          ))}
        </ul>
      )}

      {isComplete && (
        <button
          type="button"
          onClick={handleShelve}
          disabled={shelving}
          className={`flex h-9 w-full items-center justify-center rounded-md text-app-card-title font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${lightBg} ${darkText}`}
        >
          {shelving ? "책장에 꽂는 중…" : "완독! 책장에 꽂기"}
        </button>
      )}
    </div>
  );
}
