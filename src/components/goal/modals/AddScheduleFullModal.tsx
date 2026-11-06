import { useEffect, useState } from "react";
import AppModal from "@/components/goal/AppModal";
import ModalField from "@/components/goal/ModalField";
import SegmentedChipGroup from "@/components/goal/SegmentedChipGroup";
import { SCHEDULE_CATEGORIES } from "@/lib/goal/scheduleCategory";
import {
  createGoalSchedule,
  deleteGoalSchedule,
  updateGoalSchedule,
} from "@/lib/goalApi";
import { goalNotAllowedMessage } from "@/lib/tenantBlock";

// 중요일정 등록·수정 모달(624px 버전) — docs/figma-goal/part-14.md #40 (530×624 = 33.125rem ×
// 39rem, **모달 정본** — 화면별 지침 §3 확정 사항). 대시보드 진입용 AddScheduleModal(#19,
// 530×574, modals/AddScheduleModal.jsx — 읽기 전용, 정본 아님)과는 별개 파일이다.
//
// #40은 #19와 필드 구성이 다르다: "일정" 반복 범위 select가 없고(총 4필드: 종류/이름/마감일/메모),
// 메모가 textarea(461×101, part-14 §77)로 더 크다. 마감일도 #19처럼 다른 필드와 2열로 짝짓지
// 않고 168px(10.5rem) 단독 행이다(part-14 §74 "609 마감일 라벨 → 641 날짜입력 168×39" 사이에
// 다른 필드 좌표가 없음).
//
// 공통 부분(과목 칩 그룹 등) 추출을 검토했으나 AddScheduleModal.jsx는 읽기 전용 파일이라
// 리팩터링 대상에서 뺐고, 신규 공용 파일을 만들면 파일 소유권 규칙(modals/ 신규 2파일만 허용)을
// 벗어나 폼 로직을 이 파일 안에 그대로 둔다(작업 보고 "판단이 필요했던 지점" 참고).
//
// 트리거: 중요일정 목록 페이지(Schedules.jsx) 우상단 `일정 등록`(신규) / 카드별 `수정`(값 프리필,
// initial prop — 수정용 시안은 없어 동일 모달 재사용을 추정한 구현, part-14 §164).
//
// scheduleType은 값(value)을 카테고리 **코드**로 쓴다(api/goal/schedules.js 와이어 계약,
// src/lib/goal/scheduleCategory.js 참고) — 라벨은 화면 전용이고 저장·전송은 항상 코드다.
const SCHEDULE_TYPE_OPTIONS = SCHEDULE_CATEGORIES.map(({ code, label }) => ({
  value: code,
  label,
}));

const EMPTY_FORM: {
  scheduleType: string | null;
  title: string;
  dueDate: string;
  memo: string;
} = { scheduleType: null, title: "", dueDate: "", memo: "" };

type ScheduleInitial = {
  id?: number | string;
  scheduleType?: string | null;
  title?: string;
  dueDate?: string;
  // Schedules.tsx의 원본 schedule.memo가 null일 수 있다(API 계약) — 아래 프리필 로직이
  // 이미 `?? EMPTY_FORM.memo`로 방어하고 있어 null도 안전하다.
  memo?: string | null;
};

type AddScheduleFullModalProps = {
  open: boolean;
  onClose: () => void;
  initial?: ScheduleInitial | null;
  onSaved?: (schedule: unknown) => void;
  onDeleted?: (id: number | string) => void;
};

// initial.id가 있으면 수정, 없으면 신규 등록 — Schedules.jsx의 openCreate/openEdit이 이 규약을 만든다.
export default function AddScheduleFullModal({
  open,
  onClose,
  initial = null,
  onSaved,
  onDeleted,
}: AddScheduleFullModalProps) {
  const [scheduleType, setScheduleType] = useState(
    initial?.scheduleType ?? EMPTY_FORM.scheduleType,
  );
  const [title, setTitle] = useState(initial?.title ?? EMPTY_FORM.title);
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ?? EMPTY_FORM.dueDate,
  );
  const [memo, setMemo] = useState(initial?.memo ?? EMPTY_FORM.memo);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isEditing = Boolean(initial?.id);

  // 이 모달은 Schedules.jsx에 상시 마운트돼 `initial`이 최초 null → 값 있는 객체로 나중에 바뀔 수
  // 있다. useState 초기화자는 마운트 시 1회만 실행되므로 그 갱신을 반영하려면 `open`이 true로 바뀔
  // 때마다 폼을 다시 채워야 한다(AddWorkbookModal.jsx의 동일 패턴 준용).
  useEffect(() => {
    if (open) {
      setScheduleType(initial?.scheduleType ?? EMPTY_FORM.scheduleType);
      setTitle(initial?.title ?? EMPTY_FORM.title);
      setDueDate(initial?.dueDate ?? EMPTY_FORM.dueDate);
      setMemo(initial?.memo ?? EMPTY_FORM.memo);
      setErrorMessage("");
    }
  }, [open, initial]);

  const canSubmit =
    Boolean(scheduleType) &&
    title.trim().length > 0 &&
    dueDate.trim().length > 0 &&
    !submitting;

  function resetForm() {
    setScheduleType(initial?.scheduleType ?? EMPTY_FORM.scheduleType);
    setTitle(initial?.title ?? EMPTY_FORM.title);
    setDueDate(initial?.dueDate ?? EMPTY_FORM.dueDate);
    setMemo(initial?.memo ?? EMPTY_FORM.memo);
    setErrorMessage("");
  }

  function handleClose() {
    if (submitting) return;
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage("");

    const payload = {
      title: title.trim(),
      // canSubmit이 이미 scheduleType 존재를 보장한다(가드에서 return).
      category: scheduleType!,
      dueDate,
      memo,
    };
    const result = isEditing
      ? await updateGoalSchedule({
          // isEditing이 true면 initial과 initial.id가 존재함이 보장된다(Boolean(initial?.id)).
          id: initial!.id as number,
          ...payload,
        })
      : await createGoalSchedule(payload);

    setSubmitting(false);

    if (result.kind === "success") {
      onSaved?.(result.schedule);
      resetForm();
      onClose();
      return;
    }

    if (result.kind === "validation-error") {
      setErrorMessage(result.detail || "입력값을 다시 확인해 주세요.");
      return;
    }
    if (result.kind === "not-found") {
      setErrorMessage("이미 삭제된 일정입니다.");
      return;
    }
    if (result.kind === "not-allowed") {
      setErrorMessage(
        goalNotAllowedMessage(
          result.tenantReason,
          "유료결제이후 이용해주세요!",
        ),
      );
      return;
    }
    setErrorMessage("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  // 삭제 UI는 시안에 없다(part-13 §323 "삭제는 수정 모달 내부에 있을 가능성" 추정) — 팀장
  // 지시("기존 UI에 없으면 수정 모달에 삭제 버튼 추가")에 따라 수정 모드에서만 노출한다.
  async function handleDelete() {
    if (!isEditing || submitting) return;
    if (!window.confirm("이 일정을 삭제하시겠습니까?")) return;

    setSubmitting(true);
    setErrorMessage("");
    // isEditing이 true면 initial과 initial.id가 존재함이 보장된다(Boolean(initial?.id)).
    const result = await deleteGoalSchedule({ id: initial!.id as number });
    setSubmitting(false);

    if (result.kind === "success") {
      onDeleted?.(initial!.id!);
      resetForm();
      onClose();
      return;
    }
    if (result.kind === "not-found") {
      // 이미 지워진 행 — 목록 기준으로는 삭제와 같은 결과이므로 성공과 동일하게 처리한다.
      onDeleted?.(initial!.id!);
      resetForm();
      onClose();
      return;
    }
    setErrorMessage("삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={isEditing ? "중요일정 수정" : "중요일정 등록"}
      subtitle="등록하면 D-day와 알림으로 챙겨드려요"
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel={
        submitting ? "저장 중…" : isEditing ? "수정 저장하기" : "일정 저장하기"
      }
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      <div>
        <p className="mb-6.75 text-app-label font-semibold text-ink-strong">
          일정 종류<span className="ml-1 text-error">*</span>
        </p>
        <SegmentedChipGroup
          ariaLabel="일정 종류"
          options={SCHEDULE_TYPE_OPTIONS}
          value={scheduleType ?? ""}
          onChange={setScheduleType}
        />
      </div>

      <ModalField
        label="일정 이름"
        variant="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="예) 한국사 수행평가 제출"
        required
      />

      {/* 시안(#40)은 마감일이 다른 필드와 짝을 이루지 않는 168px 단독 행이다 — #19(마감일+일정
          2열)와의 차이. */}
      <div className="w-42">
        <ModalField
          label="마감일"
          variant="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          required
        />
      </div>

      {/* 메모는 textarea(461×101) — ModalField가 text/number/select/date 4변형만 지원해
          여기서는 직접 구현한다(ModalField와 시각 스펙 동일하게 맞춤). */}
      <div>
        <label
          htmlFor="add-schedule-memo"
          className="mb-6.75 block text-app-label font-semibold text-ink-strong"
        >
          메모 (선택)
        </label>
        <textarea
          id="add-schedule-memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="예) 발표 자료 포함, 조사 범위 등 메모를 남겨두세요"
          rows={4}
          className="h-25.25 w-full resize-none rounded-lg border border-[#E3E3E3] bg-white px-3.5 py-2.5 text-app-body text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent"
        />
      </div>

      {errorMessage && (
        <p className="text-app-label text-error">{errorMessage}</p>
      )}

      {isEditing && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="text-app-label font-medium text-error transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            일정 삭제
          </button>
        </div>
      )}
    </AppModal>
  );
}
