import { ChevronDown, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toastSuccess, toastWarning } from "@/pages/admin/shared/adminToast";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";
import {
  ActionButton,
  boolValue,
  Field,
  getNextSortOrder,
  normalizeProgramIds,
  ProgramSelector,
  Select,
  Textarea,
  TextInput,
  Toggle,
} from "@/pages/admin/shared/formFields";
import { useCanEditSection } from "@/pages/admin/shared/sectionEditAccess";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import {
  type DiagnosisWrite,
  reportDiagnosisError,
  useDiagnosisLists,
  useDiagnosisWrite,
  useLoadErrorToast,
} from "./api";

// DB 로우 shape을 이 파일 안에서 로컬로 정의한다(learning_diagnosis_* 테이블, 새 전역 타입 파일 없음).
// id 컬럼은 uuid(sql/00_base_schema.sql learning_diagnosis_*) — supabase-js가 string으로 반환한다.
type DiagnosisId = string;
// DB는 CHECK(input_type in 'single'|'multiple')이지만 formFields.Select의 onChange가
// string을 돌려주므로 여기서는 string으로 느슨하게 받는다(TextInput/Select와 동일한 관례).
interface DiagnosisQuestion {
  id: DiagnosisId;
  title: string;
  description?: string;
  input_type: string;
  is_required: boolean;
  is_active: boolean;
  // TextInput onChange가 문자열을 그대로 돌려주고(원본 로직: Number 변환은 저장 시점에만),
  // 편집 중에는 로컬 state에 문자열이 그대로 실릴 수 있다 — DB 원본은 number.
  sort_order: number | string;
  [key: string]: unknown;
}

interface DiagnosisQuestionDraft {
  title: string;
  description: string;
  input_type: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number | string;
}

interface DiagnosisOption {
  id: DiagnosisId;
  question_id: DiagnosisId;
  label: string;
  program_ids: string[];
  is_active: boolean;
  // TextInput onChange가 문자열을 그대로 돌려주고(원본 로직: Number 변환은 저장 시점에만),
  // 편집 중에는 로컬 state에 문자열이 그대로 실릴 수 있다 — DB 원본은 number.
  sort_order: number | string;
  [key: string]: unknown;
}

interface DiagnosisProgram {
  id: DiagnosisId;
  title: string;
  badge: string;
  description: string;
  primary_button_text: string;
  primary_button_link: string;
  secondary_button_text: string;
  secondary_button_link: string;
  icon: string;
  is_active: boolean;
  // TextInput onChange가 문자열을 그대로 돌려주고(원본 로직: Number 변환은 저장 시점에만),
  // 편집 중에는 로컬 state에 문자열이 그대로 실릴 수 있다 — DB 원본은 number.
  sort_order: number | string;
  [key: string]: unknown;
}

interface DiagnosisProgramDraft {
  title: string;
  badge: string;
  description: string;
  primary_button_text: string;
  primary_button_link: string;
  secondary_button_text: string;
  secondary_button_link: string;
  icon: string;
  is_active: boolean;
  sort_order: number | string;
}

const QUESTION_EMPTY: DiagnosisQuestionDraft = {
  title: "",
  description: "",
  input_type: "single",
  is_required: true,
  is_active: true,
  sort_order: 1,
};

const PROGRAM_EMPTY: DiagnosisProgramDraft = {
  title: "",
  badge: "추천 서비스",
  description: "",
  primary_button_text: "서비스 확인하기",
  primary_button_link: "",
  secondary_button_text: "",
  secondary_button_link: "",
  icon: "target",
  is_active: true,
  sort_order: 1,
};

export default function LearningDiagnosisAdmin() {
  // view 권한이면 추가, 저장, 삭제 버튼을 그리지 않는다.
  const canEdit = useCanEditSection();
  const lists = useDiagnosisLists();
  const write = useDiagnosisWrite();
  const saving = write.isPending;
  const [questions, setQuestions] = useState<DiagnosisQuestion[]>([]);
  const [options, setOptions] = useState<DiagnosisOption[]>([]);
  const [programs, setPrograms] = useState<DiagnosisProgram[]>([]);
  const [openQuestions, setOpenQuestions] = useState<Set<DiagnosisId>>(
    () => new Set(),
  );
  const [newQuestion, setNewQuestion] =
    useState<DiagnosisQuestionDraft>(QUESTION_EMPTY);
  const [newProgram, setNewProgram] =
    useState<DiagnosisProgramDraft>(PROGRAM_EMPTY);
  const isFirstLoad = useRef(true);

  const questionsQuery = lists.questions;
  const optionsQuery = lists.options;
  const programsQuery = lists.programs;
  const loading =
    questionsQuery.isPending ||
    optionsQuery.isPending ||
    programsQuery.isPending;
  useLoadErrorToast(
    questionsQuery.error ?? optionsQuery.error ?? programsQuery.error,
  );

  const optionsByQuestion = useMemo(() => {
    const grouped: Record<string, DiagnosisOption[]> = {};
    options.forEach((option) => {
      const key = option.question_id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(option);
    });
    Object.values(grouped).forEach((list) => {
      list.sort(
        (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0),
      );
    });
    return grouped;
  }, [options]);

  // 서버에서 받을 때마다 로컬 편집본을 서버 값으로 되돌린다(예전 loadAll 과 같다).
  const applyLoaded = useEffectEvent(() => {
    if (!questionsQuery.data || !optionsQuery.data || !programsQuery.data)
      return;

    // 생성 타입은 description/is_required/is_active/sort_order 등을 전부
    // nullable로 내보내지만(NOT NULL 아님, DEFAULT는 있음) 이 화면은 로컬
    // DiagnosisQuestion/DiagnosisOption/DiagnosisProgram을 non-null로 두고
    // 전부 아래처럼 `|| ""`/`??` 로 다뤄왔다 — 받은 시점에 한 번만 같은 규칙으로 null을 좁힌다.
    const nextQuestions: DiagnosisQuestion[] = questionsQuery.data.items.map(
      (row) => ({
        ...row,
        description: row.description ?? "",
        is_required: row.is_required ?? false,
        is_active: row.is_active ?? false,
        sort_order: row.sort_order ?? 0,
      }),
    );
    const nextOptions: DiagnosisOption[] = optionsQuery.data.items.map(
      (option) => ({
        ...option,
        question_id: option.question_id ?? "",
        label: option.label ?? "",
        is_active: option.is_active ?? false,
        sort_order: option.sort_order ?? 0,
        program_ids: normalizeProgramIds(option.program_ids),
      }),
    );
    const nextPrograms: DiagnosisProgram[] = programsQuery.data.items.map(
      (row) => ({
        ...row,
        badge: row.badge ?? "",
        description: row.description ?? "",
        primary_button_text: row.primary_button_text ?? "",
        primary_button_link: row.primary_button_link ?? "",
        secondary_button_text: row.secondary_button_text ?? "",
        secondary_button_link: row.secondary_button_link ?? "",
        icon: row.icon ?? "",
        is_active: row.is_active ?? false,
        sort_order: row.sort_order ?? 0,
      }),
    );

    setQuestions(nextQuestions);
    setOptions(nextOptions);
    setPrograms(nextPrograms);
    // 처음 받을 때만 모두 펼친다. 이후엔 관리자가 접고 편 상태를 둔다.
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      setOpenQuestions(new Set(nextQuestions.map((question) => question.id)));
    }

    setNewQuestion((prev) => {
      if (String(prev.title || "").trim()) return prev;

      return {
        ...prev,
        sort_order: getNextSortOrder(nextQuestions),
      };
    });

    setNewProgram((prev) => {
      if (String(prev.title || "").trim()) return prev;

      return {
        ...prev,
        sort_order: getNextSortOrder(nextPrograms),
      };
    });
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: 받은 시각이 바뀔 때만 로컬 편집본을 서버 값으로 되돌린다
  useEffect(() => {
    applyLoaded();
  }, [
    questionsQuery.dataUpdatedAt,
    optionsQuery.dataUpdatedAt,
    programsQuery.dataUpdatedAt,
  ]);

  // 쓰기 한 번. 실패하면 공통 문구만 알리고 false 를 돌려준다.
  async function send(label: string, request: DiagnosisWrite) {
    try {
      await write.mutateAsync(request);
      return true;
    } catch (error) {
      reportDiagnosisError(label, error);
      return false;
    }
  }

  function updateQuestionLocal(
    id: DiagnosisId,
    patch: Partial<DiagnosisQuestion>,
  ) {
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    );
  }

  function updateOptionLocal(id: DiagnosisId, patch: Partial<DiagnosisOption>) {
    setOptions((prev) =>
      prev.map((option) =>
        option.id === id ? { ...option, ...patch } : option,
      ),
    );
  }

  function updateProgramLocal(
    id: DiagnosisId,
    patch: Partial<DiagnosisProgram>,
  ) {
    setPrograms((prev) =>
      prev.map((program) =>
        program.id === id ? { ...program, ...patch } : program,
      ),
    );
  }

  function toggleQuestion(id: DiagnosisId) {
    setOpenQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createQuestion() {
    const title = newQuestion.title.trim();

    if (!title) {
      toastWarning("질문 내용을 입력하세요.");
      return;
    }

    const nextSortOrder = getNextSortOrder(questions);
    const sortOrder = Number(newQuestion.sort_order || 0) || nextSortOrder;

    const ok = await send("질문 등록 실패", {
      method: "post",
      path: "questions",
      json: {
        title,
        description: newQuestion.description || "",
        input_type:
          newQuestion.input_type === "multiple" ? "multiple" : "single",
        is_required: boolValue(newQuestion.is_required),
        is_active: boolValue(newQuestion.is_active),
        sort_order: sortOrder,
      },
    });
    if (!ok) return;

    setNewQuestion({
      ...QUESTION_EMPTY,
      sort_order: getNextSortOrder([...questions, { sort_order: sortOrder }]),
    });
  }

  async function saveQuestion(question: DiagnosisQuestion) {
    if (!String(question.title || "").trim()) {
      toastWarning("질문 내용을 입력하세요.");
      return;
    }

    const ok = await send("질문 저장 실패", {
      method: "patch",
      path: `questions/${question.id}`,
      json: {
        title: question.title,
        description: question.description || "",
        input_type: question.input_type === "multiple" ? "multiple" : "single",
        is_required: boolValue(question.is_required),
        is_active: boolValue(question.is_active),
        sort_order: Number(question.sort_order || 1),
      },
    });
    if (ok) toastSuccess("질문 저장 완료");
  }

  async function deleteQuestion(question: DiagnosisQuestion) {
    if (
      !(await confirmAdmin({
        title:
          "질문을 삭제하면 질문 안의 답변도 함께 삭제됩니다. 삭제하시겠습니까?",
        confirmLabel: "삭제",
        destructive: true,
      }))
    )
      return;

    await send("질문 삭제 실패", {
      method: "delete",
      path: `questions/${question.id}`,
    });
  }

  async function createOption(questionId: DiagnosisId) {
    const questionOptions = optionsByQuestion[questionId] || [];
    // 빈 답변을 먼저 만들고 관리자가 채운다. 서버가 옛 option_text 컬럼을 label 로 채운다.
    await send("답변 추가 실패", {
      method: "post",
      path: "options",
      json: {
        question_id: questionId,
        label: "",
        program_ids: [],
        is_active: true,
        sort_order: questionOptions.length + 1,
      },
    });
  }

  async function saveOption(option: DiagnosisOption) {
    if (!String(option.label || "").trim()) {
      toastWarning("답변 내용을 입력하세요.");
      return;
    }

    const ok = await send("답변 저장 실패", {
      method: "patch",
      path: `options/${option.id}`,
      json: {
        label: option.label,
        program_ids: normalizeProgramIds(option.program_ids),
        is_active: boolValue(option.is_active),
        sort_order: Number(option.sort_order || 1),
      },
    });
    if (ok) toastSuccess("답변 저장 완료");
  }

  async function deleteOption(option: DiagnosisOption) {
    if (
      !(await confirmAdmin({
        title: "이 답변을 삭제하시겠습니까?",
        confirmLabel: "삭제",
        destructive: true,
      }))
    )
      return;

    await send("답변 삭제 실패", {
      method: "delete",
      path: `options/${option.id}`,
    });
  }

  async function createProgram() {
    const title = newProgram.title.trim();
    if (!title) {
      toastWarning("프로그램명을 입력하세요.");
      return;
    }

    const ok = await send("추천 프로그램 등록 실패", {
      method: "post",
      path: "programs",
      json: {
        title,
        badge: newProgram.badge,
        description: newProgram.description,
        primary_button_text: newProgram.primary_button_text,
        primary_button_link: newProgram.primary_button_link,
        secondary_button_text: newProgram.secondary_button_text,
        secondary_button_link: newProgram.secondary_button_link,
        icon: newProgram.icon,
        is_active: boolValue(newProgram.is_active),
        sort_order: Number(newProgram.sort_order || 1),
      },
    });
    if (ok) {
      setNewProgram({ ...PROGRAM_EMPTY, sort_order: programs.length + 2 });
    }
  }

  async function saveProgram(program: DiagnosisProgram) {
    if (!String(program.title || "").trim()) {
      toastWarning("프로그램명을 입력하세요.");
      return;
    }

    const ok = await send("추천 프로그램 저장 실패", {
      method: "patch",
      path: `programs/${program.id}`,
      json: {
        title: program.title,
        badge: program.badge || "",
        description: program.description || "",
        primary_button_text: program.primary_button_text || "",
        primary_button_link: program.primary_button_link || "",
        secondary_button_text: program.secondary_button_text || "",
        secondary_button_link: program.secondary_button_link || "",
        icon: program.icon || "target",
        is_active: boolValue(program.is_active),
        sort_order: Number(program.sort_order || 1),
      },
    });
    if (ok) toastSuccess("추천 프로그램 저장 완료");
  }

  async function deleteProgram(program: DiagnosisProgram) {
    if (
      !(await confirmAdmin({
        title:
          "추천 프로그램을 삭제하면 기존 답변과의 연결도 결과에서 제외됩니다. 삭제하시겠습니까?",
        confirmLabel: "삭제",
        destructive: true,
      }))
    )
      return;

    await send("추천 프로그램 삭제 실패", {
      method: "delete",
      path: `programs/${program.id}`,
    });
  }

  return (
    <div className="space-y-6">
      <div className="bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">학습진단 관리</h1>
            <p className="mt-1 text-sm font-medium text-destructive">
              질문 내용, 답변 내용, 중복 선택 여부, 답변별 추천 프로그램을 이
              화면에서 수정합니다.
            </p>
          </div>

          <ActionButton onClick={() => void lists.refetchAll()} variant="light">
            <RefreshCw size={14} />
            새로고침
          </ActionButton>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-6 shadow-sm">
          <AdminTableSkeleton
            columns={4}
            label="학습진단 데이터를 불러오는 중입니다."
          />
        </div>
      ) : (
        <>
          <section className="bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">추천 프로그램 관리</h2>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  답변을 선택했을 때 결과 화면에 노출될 프로그램 카드입니다.
                </p>
              </div>
            </div>

            {canEdit && (
              <div className="mb-6 rounded-sm border border-[#B88737]/30 bg-[#FFF8E8] p-4">
                <h3 className="mb-3 text-sm font-semibold text-[#7A4A12]">
                  새 추천 프로그램 추가
                </h3>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Field label="프로그램명">
                    <TextInput
                      value={newProgram.title}
                      onChange={(value) =>
                        setNewProgram((prev) => ({ ...prev, title: value }))
                      }
                      placeholder="예: 위닝 수행평가 서비스"
                    />
                  </Field>
                  <Field label="상단 배지">
                    <TextInput
                      value={newProgram.badge}
                      onChange={(value) =>
                        setNewProgram((prev) => ({ ...prev, badge: value }))
                      }
                      placeholder="예: 추천 서비스 01"
                    />
                  </Field>
                  <Field label="추천 문구">
                    <Textarea
                      value={newProgram.description}
                      onChange={(value) =>
                        setNewProgram((prev) => ({
                          ...prev,
                          description: value,
                        }))
                      }
                      rows={4}
                    />
                  </Field>
                  <div className="grid gap-3">
                    <Field label="서비스 버튼명">
                      <TextInput
                        value={newProgram.primary_button_text}
                        onChange={(value) =>
                          setNewProgram((prev) => ({
                            ...prev,
                            primary_button_text: value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="서비스 링크">
                      <TextInput
                        value={newProgram.primary_button_link}
                        onChange={(value) =>
                          setNewProgram((prev) => ({
                            ...prev,
                            primary_button_link: value,
                          }))
                        }
                        placeholder="/page/services-ai-performance"
                      />
                    </Field>
                    <Field label="순서">
                      <TextInput
                        value={String(newProgram.sort_order)}
                        onChange={(value) =>
                          setNewProgram((prev) => ({
                            ...prev,
                            sort_order: value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <ActionButton onClick={createProgram} disabled={saving}>
                    <Plus size={14} />
                    추천 프로그램 추가
                  </ActionButton>
                </div>
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              {programs.map((program) => (
                <div key={program.id} className="border border-border p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="프로그램명">
                      <TextInput
                        value={program.title}
                        onChange={(value) =>
                          updateProgramLocal(program.id, { title: value })
                        }
                      />
                    </Field>
                    <Field label="상단 배지">
                      <TextInput
                        value={program.badge}
                        onChange={(value) =>
                          updateProgramLocal(program.id, { badge: value })
                        }
                      />
                    </Field>
                    <Field label="추천 문구">
                      <Textarea
                        value={program.description}
                        onChange={(value) =>
                          updateProgramLocal(program.id, { description: value })
                        }
                        rows={5}
                      />
                    </Field>
                    <div className="grid gap-3">
                      <Field label="서비스 버튼명">
                        <TextInput
                          value={program.primary_button_text}
                          onChange={(value) =>
                            updateProgramLocal(program.id, {
                              primary_button_text: value,
                            })
                          }
                        />
                      </Field>
                      <Field label="서비스 링크">
                        <TextInput
                          value={program.primary_button_link}
                          onChange={(value) =>
                            updateProgramLocal(program.id, {
                              primary_button_link: value,
                            })
                          }
                        />
                      </Field>
                      <Field label="보조 버튼명">
                        <TextInput
                          value={program.secondary_button_text}
                          onChange={(value) =>
                            updateProgramLocal(program.id, {
                              secondary_button_text: value,
                            })
                          }
                        />
                      </Field>
                      <Field label="보조 링크">
                        <TextInput
                          value={program.secondary_button_link}
                          onChange={(value) =>
                            updateProgramLocal(program.id, {
                              secondary_button_link: value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="아이콘">
                      <Select
                        value={program.icon}
                        onChange={(value) =>
                          updateProgramLocal(program.id, { icon: value })
                        }
                      >
                        <option value="target">목표관리</option>
                        <option value="book">수행평가</option>
                        <option value="chart">분석</option>
                        <option value="route">방향설정</option>
                      </Select>
                    </Field>
                    <Field label="순서">
                      <TextInput
                        value={String(program.sort_order)}
                        onChange={(value) =>
                          updateProgramLocal(program.id, { sort_order: value })
                        }
                      />
                    </Field>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <Toggle
                      checked={program.is_active}
                      onChange={(value) =>
                        updateProgramLocal(program.id, { is_active: value })
                      }
                      label="사용"
                    />
                    {canEdit && (
                      <div className="flex gap-2">
                        <ActionButton
                          onClick={() => saveProgram(program)}
                          disabled={saving}
                        >
                          저장
                        </ActionButton>
                        <ActionButton
                          onClick={() => deleteProgram(program)}
                          variant="danger"
                        >
                          <Trash2 size={14} />
                          삭제
                        </ActionButton>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-semibold">질문과 답변 관리</h2>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                질문 내용은 자유롭게 바꿀 수 있고, 각 질문 안에서 답변을 바로
                추가·수정합니다.
              </p>
            </div>

            {canEdit && (
              <div className="mb-6 rounded-sm border border-[#B88737]/30 bg-[#FFF8E8] p-4">
                <h3 className="mb-3 text-sm font-semibold text-[#7A4A12]">
                  새 질문 추가
                </h3>
                <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr_0.5fr]">
                  <Field label="질문 내용">
                    <TextInput
                      value={newQuestion.title}
                      onChange={(value) =>
                        setNewQuestion((prev) => ({ ...prev, title: value }))
                      }
                      placeholder="예: 현재 가장 큰 학습 고민은 무엇인가요?"
                    />
                  </Field>
                  <Field label="선택 방식">
                    <Select
                      value={newQuestion.input_type}
                      onChange={(value) =>
                        setNewQuestion((prev) => ({
                          ...prev,
                          input_type: value,
                        }))
                      }
                    >
                      <option value="single">단일 선택</option>
                      <option value="multiple">중복 선택</option>
                    </Select>
                  </Field>
                  <Field label="순서">
                    <TextInput
                      value={String(newQuestion.sort_order)}
                      onChange={(value) =>
                        setNewQuestion((prev) => ({
                          ...prev,
                          sort_order: value,
                        }))
                      }
                    />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="질문 설명">
                    <Textarea
                      value={newQuestion.description}
                      onChange={(value) =>
                        setNewQuestion((prev) => ({
                          ...prev,
                          description: value,
                        }))
                      }
                      rows={2}
                    />
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-4">
                    <Toggle
                      checked={newQuestion.is_required}
                      onChange={(value) =>
                        setNewQuestion((prev) => ({
                          ...prev,
                          is_required: value,
                        }))
                      }
                      label="필수 질문"
                    />
                    <Toggle
                      checked={newQuestion.is_active}
                      onChange={(value) =>
                        setNewQuestion((prev) => ({
                          ...prev,
                          is_active: value,
                        }))
                      }
                      label="사용"
                    />
                  </div>
                  <ActionButton onClick={createQuestion} disabled={saving}>
                    <Plus size={14} />
                    질문 추가
                  </ActionButton>
                </div>
              </div>
            )}

            <div className="space-y-5">
              {questions.map((question, questionIndex) => {
                const questionOptions = optionsByQuestion[question.id] || [];
                const isOpen = openQuestions.has(question.id);

                return (
                  <article key={question.id} className="border border-border">
                    <button
                      type="button"
                      onClick={() => toggleQuestion(question.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between bg-muted px-5 py-4 text-left"
                    >
                      <div>
                        <p className="text-xs font-semibold text-primary">
                          QUESTION {String(questionIndex + 1).padStart(2, "0")}
                          <span className="ml-2 text-muted-foreground">
                            정렬순서 {Number(question.sort_order || 0)}
                          </span>
                        </p>
                        <h3 className="mt-1 text-base font-semibold text-foreground">
                          {question.title || "질문 내용 없음"}
                        </h3>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          {question.input_type === "multiple"
                            ? "중복 선택"
                            : "단일 선택"}{" "}
                          · {question.is_required ? "필수" : "선택"} · 답변{" "}
                          {questionOptions.length}개
                        </p>
                      </div>
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className={`transition ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isOpen && (
                      <div className="p-5">
                        <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr_0.5fr]">
                          <Field label="질문 내용">
                            <TextInput
                              value={question.title}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, {
                                  title: value,
                                })
                              }
                            />
                          </Field>
                          <Field label="선택 방식">
                            <Select
                              value={question.input_type}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, {
                                  input_type: value,
                                })
                              }
                            >
                              <option value="single">단일 선택</option>
                              <option value="multiple">중복 선택</option>
                            </Select>
                          </Field>
                          <Field label="순서">
                            <TextInput
                              value={String(question.sort_order)}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, {
                                  sort_order: value,
                                })
                              }
                            />
                          </Field>
                        </div>
                        <div className="mt-3">
                          <Field label="질문 설명">
                            <Textarea
                              value={question.description ?? null}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, {
                                  description: value,
                                })
                              }
                              rows={2}
                            />
                          </Field>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
                          <div className="flex gap-4">
                            <Toggle
                              checked={question.is_required}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, {
                                  is_required: value,
                                })
                              }
                              label="필수 질문"
                            />
                            <Toggle
                              checked={question.is_active}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, {
                                  is_active: value,
                                })
                              }
                              label="사용"
                            />
                          </div>
                          {canEdit && (
                            <div className="flex gap-2">
                              <ActionButton
                                onClick={() => saveQuestion(question)}
                                disabled={saving}
                              >
                                질문 저장
                              </ActionButton>
                              <ActionButton
                                onClick={() => deleteQuestion(question)}
                                variant="danger"
                              >
                                <Trash2 size={14} />
                                질문 삭제
                              </ActionButton>
                            </div>
                          )}
                        </div>

                        <div className="mt-5">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-sm font-semibold">답변 목록</h4>
                            {canEdit && (
                              <ActionButton
                                onClick={() => createOption(question.id)}
                                variant="light"
                              >
                                <Plus size={14} />
                                답변 추가
                              </ActionButton>
                            )}
                          </div>

                          <div className="space-y-3">
                            {questionOptions.map((option) => (
                              <div
                                key={option.id}
                                className="rounded-sm border border-border p-4"
                              >
                                <div className="grid gap-3 lg:grid-cols-[1fr_120px]">
                                  <Field label="답변 내용">
                                    <TextInput
                                      value={option.label}
                                      onChange={(value) =>
                                        updateOptionLocal(option.id, {
                                          label: value,
                                        })
                                      }
                                      placeholder="답변 내용을 입력하세요"
                                    />
                                  </Field>
                                  <Field label="순서">
                                    <TextInput
                                      value={String(option.sort_order)}
                                      onChange={(value) =>
                                        updateOptionLocal(option.id, {
                                          sort_order: value,
                                        })
                                      }
                                    />
                                  </Field>
                                </div>

                                <fieldset className="mt-3 min-w-0">
                                  <legend className="mb-1 text-xs font-medium text-muted-foreground">
                                    이 답변 선택 시 노출할 추천 프로그램
                                  </legend>
                                  <ProgramSelector
                                    programs={programs}
                                    value={option.program_ids}
                                    onChange={(value) =>
                                      updateOptionLocal(option.id, {
                                        program_ids: value,
                                      })
                                    }
                                  />
                                </fieldset>

                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                  <Toggle
                                    checked={option.is_active}
                                    onChange={(value) =>
                                      updateOptionLocal(option.id, {
                                        is_active: value,
                                      })
                                    }
                                    label="사용"
                                  />
                                  {canEdit && (
                                    <div className="flex gap-2">
                                      <ActionButton
                                        onClick={() => saveOption(option)}
                                        disabled={saving}
                                      >
                                        답변 저장
                                      </ActionButton>
                                      <ActionButton
                                        onClick={() => deleteOption(option)}
                                        variant="danger"
                                      >
                                        <Trash2 size={14} />
                                        삭제
                                      </ActionButton>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}

                            {questionOptions.length === 0 && (
                              <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm font-medium text-muted-foreground">
                                아직 등록된 답변이 없습니다. 답변 추가를 눌러
                                선택지를 만드세요.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
