import { useEffect, useEffectEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import GoalEmptyState from "@/components/goal/GoalEmptyState";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import AddScheduleFullModal from "@/components/goal/modals/AddScheduleFullModal";
import ScheduleListCard from "@/components/goal/plan/ScheduleListCard";
import {
  formatScheduleDday,
  formatScheduleMeta,
} from "@/lib/goal/scheduleDday";
import { fetchGoalSchedules } from "@/lib/goalApi";

// 중요일정(#41 목록 정본 / #40 등록·수정 모달 정본, 530×624) — docs/figma-goal/part-14.md.
// GET /api/goal/schedules 실데이터로 배선(중요일정 D 백엔드 배선 UoW) — mockSchedules는
// 더 이상 쓰지 않는다.

// api/_lib/goal/repo.ts buildSchedulePayload() 반환 shape.
type Schedule = {
  id: string | number;
  title: string;
  category: string;
  dueDate: string;
  memo?: string | null;
};

type DisplaySchedule = Schedule & { dday: string; meta: string };

/** GET 응답(id/title/category/dueDate/memo) → 카드가 요구하는 표시 shape(dday/meta 계산 포함). */
function toDisplaySchedule(schedule: Schedule, now: Date): DisplaySchedule {
  return {
    ...schedule,
    dday: formatScheduleDday(schedule.dueDate, now),
    meta: formatScheduleMeta(schedule.dueDate, schedule.memo),
  };
}

type EditingSchedule = {
  id?: string | number;
  scheduleType?: string | null;
  title?: string;
  dueDate?: string;
  memo?: string | null;
};

export default function Schedules() {
  const location = useLocation();
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EditingSchedule | null>(null); // null=신규 등록, 값 있으면 수정 프리필
  // null=로딩 중, 배열=로드 완료(빈 배열 포함). loadError는 로딩 실패 시에만 메시지를 담는다.
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let alive = true;

    fetchGoalSchedules().then((result) => {
      if (!alive) return;

      if (result.kind === "success") {
        setSchedules(result.schedules);
        return;
      }

      // 방어적 분기 — 이 페이지는 RequireGoalAccess가 이미 로그인·이용권·온보딩 완료를
      // 보장한 뒤에만 렌더되므로(App.jsx), 정상 경로에선 no-session/not-allowed가 나오지
      // 않는다. 그래도 세션 경쟁 상태·서버 오류는 남아 있어 빈 목록이 아니라 오류로 알린다.
      setSchedules([]);
      setLoadError("중요일정을 불러오지 못했습니다. 새로고침해 주세요.");
    });

    return () => {
      alive = false;
    };
  }, []);

  // ScheduleRail("+")이 navigate(..., { state: { openCreate: true } })로 진입시킨 경우 —
  // 마운트 시 1회만 소비하고 즉시 history를 replace해 지운다. 지우지 않으면 뒤로가기로
  // 이 페이지에 돌아올 때마다(브라우저가 location.state를 유지한다) 모달이 또 열린다.
  const onMountConsumeOpenCreate = useEffectEvent(() => {
    if (location.state?.openCreate) {
      openCreate();
      navigate(location.pathname, { replace: true, state: null });
    }
  });

  useEffect(() => {
    onMountConsumeOpenCreate();
  }, []);

  const displaySchedules = (schedules || []).map((schedule) =>
    toDisplaySchedule(schedule, new Date()),
  );
  const hasSchedules = displaySchedules.length > 0;

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(schedule: Schedule) {
    // AddScheduleFullModal의 initial 규약: id가 있으면 수정 모드. scheduleType은 카테고리
    // 코드(schedule.category)를 그대로 넘긴다 — SegmentedChipGroup value가 코드다.
    setEditing({
      id: schedule.id,
      scheduleType: schedule.category,
      title: schedule.title,
      dueDate: schedule.dueDate,
      // exactOptionalPropertyTypes: 명시적 undefined를 못 받는 optional 필드라 null로 맞춘다.
      memo: schedule.memo ?? null,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  // 저장(등록/수정) 성공 — 목록을 다시 불러오지 않고 반환된 행으로 로컬 갱신한다.
  function handleSaved(savedSchedule?: Schedule) {
    if (!savedSchedule) return;
    setSchedules((prev) => {
      const list = prev || [];
      const exists = list.some((item) => item.id === savedSchedule.id);
      const next = exists
        ? list.map((item) =>
            item.id === savedSchedule.id ? savedSchedule : item,
          )
        : [...list, savedSchedule];
      return [...next].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    });
  }

  function handleDeleted(id: string | number) {
    setSchedules((prev) => (prev || []).filter((item) => item.id !== id));
  }

  return (
    <>
      <GoalPageHeader
        title="중요일정"
        subcopy="시험·수행평가·제출 마감을 등록하면 D-day로 알려드려요."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="h-9.75 rounded-lg bg-[#2E2A26] px-4 text-app-label font-semibold text-white transition-colors hover:opacity-90"
          >
            일정 등록
          </button>
        }
      />

      <div className="max-w-goal-content px-4 pb-24 md:px-12">
        {loadError && (
          <p className="mb-4 text-app-label text-error">{loadError}</p>
        )}

        {/* 카드 리스트는 시안 실측 폭 1116px(69.75rem)을 그대로 따른다 — 헤더는 앱 표준
            1340px(GoalPageHeader 기본값)을 유지하고, 이 리스트만 지시받은 폭으로 좁힌다
            (00-INDEX.md가 여러 화면에서 "1340으로 통일 권장"이라 문서 스스로 밝힌 방식). */}
        {schedules === null ? (
          <p className="text-app-label text-ink-sub">불러오는 중입니다…</p>
        ) : hasSchedules ? (
          <ul className="flex max-w-279 flex-col gap-5">
            {displaySchedules.map((schedule) => (
              <li key={schedule.id}>
                <ScheduleListCard
                  schedule={schedule}
                  onEdit={() => openEdit(schedule)}
                />
              </li>
            ))}
          </ul>
        ) : (
          // 빈 상태(0건) 시안이 없다(part-14 §231) — GoalEmptyState로 근사 구현. // (추정)
          <GoalEmptyState
            message="+ 버튼을 눌러 중요일정을 등록하세요"
            onAdd={openCreate}
          />
        )}
      </div>

      <AddScheduleFullModal
        open={modalOpen}
        onClose={closeModal}
        initial={editing}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </>
  );
}
