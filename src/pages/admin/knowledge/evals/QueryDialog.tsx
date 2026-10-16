import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ActionButton,
  Field,
  Textarea,
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  type GoldenQuery,
  saveGoldenQuery,
  searchKnowledgeResources,
} from "./api";
import {
  EMPTY_GOLDEN_DRAFT,
  type ExpectedResource,
  type GoldenDraft,
  type KnowledgeType,
  toGoldenRow,
} from "./form";

function draftFrom(
  target: GoldenQuery | null,
  titles: Record<string, string>,
): GoldenDraft {
  if (!target) return EMPTY_GOLDEN_DRAFT;
  return {
    grade: target.grade,
    subject: target.subject,
    career: target.career ?? "",
    selectedTopic: target.selected_topic ?? "",
    assessmentInfo: target.assessment_info ?? "",
    note: target.note ?? "",
    expected: target.expected_resource_ids.map((id) => ({
      id,
      title: titles[id] ?? id,
    })),
  };
}

export default function QueryDialog({
  knowledgeType,
  target,
  titles,
  onClose,
  onSaved,
}: {
  knowledgeType: KnowledgeType;
  target: GoldenQuery | null;
  titles: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<GoldenDraft>(() =>
    draftFrom(target, titles),
  );
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ExpectedResource[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Omit<GoldenDraft, "expected">) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  async function search() {
    const result = await searchKnowledgeResources(knowledgeType, term);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setResults(result.data);
  }

  function addExpected(resource: ExpectedResource) {
    setDraft((prev) =>
      prev.expected.some((item) => item.id === resource.id)
        ? prev
        : { ...prev, expected: [...prev.expected, resource] },
    );
  }

  function removeExpected(id: string) {
    setDraft((prev) => ({
      ...prev,
      expected: prev.expected.filter((item) => item.id !== id),
    }));
  }

  async function submit() {
    if (busy) return;
    const parsed = toGoldenRow(knowledgeType, draft);
    if (!parsed.ok) {
      setMessage(parsed.message);
      return;
    }
    setBusy(true);
    const result = await saveGoldenQuery(target?.id ?? null, parsed.row);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[44rem]">
        <DialogHeader>
          <DialogTitle>{target ? "질의 편집" : "질의 추가"}</DialogTitle>
          <DialogDescription>
            학생이 입력하는 값과 같은 칸입니다. 기대 자료는 이 질의에 나와야 할
            지식 항목입니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <Field label="학년">
            <TextInput
              value={draft.grade}
              onChange={set("grade")}
              placeholder="고2"
            />
          </Field>
          <Field label="과목">
            <TextInput value={draft.subject} onChange={set("subject")} />
          </Field>
          <Field label="진로">
            <TextInput value={draft.career} onChange={set("career")} />
          </Field>
        </div>
        <Field label="주제">
          <TextInput
            value={draft.selectedTopic}
            onChange={set("selectedTopic")}
          />
        </Field>
        <Field label="수행평가 안내문">
          <Textarea
            value={draft.assessmentInfo}
            onChange={set("assessmentInfo")}
          />
        </Field>
        <Field label="메모">
          <TextInput value={draft.note} onChange={set("note")} />
        </Field>

        <div>
          <div className="mb-1 text-xs font-black text-gray-500">기대 자료</div>
          <ul className="mb-2 space-y-1">
            {draft.expected.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between border border-gray-200 px-3 py-2 text-sm font-bold"
              >
                <span>{item.title}</span>
                <ActionButton
                  variant="light"
                  onClick={() => removeExpected(item.id)}
                >
                  빼기
                </ActionButton>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <TextInput
              value={term}
              onChange={setTerm}
              placeholder="자료 제목 검색"
            />
            <ActionButton type="submit" variant="light">
              검색
            </ActionButton>
          </form>
          {results && (
            <ScrollArea className="mt-2 max-h-[14rem]">
              {results.length === 0 ? (
                <div className="py-4 text-center text-sm text-gray-400">
                  검색 결과가 없습니다.
                </div>
              ) : (
                <ul className="space-y-1">
                  {results.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between px-3 py-1 text-sm"
                    >
                      <span>{item.title}</span>
                      <ActionButton
                        variant="light"
                        onClick={() => addExpected(item)}
                      >
                        추가
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          )}
        </div>

        {message && (
          <div className="text-sm font-bold text-red-600">{message}</div>
        )}
        <div className="flex justify-end gap-2">
          <ActionButton variant="light" onClick={onClose}>
            취소
          </ActionButton>
          <ActionButton onClick={submit} disabled={busy}>
            저장
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
