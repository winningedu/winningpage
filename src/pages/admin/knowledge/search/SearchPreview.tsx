// 위닝 수행 주제 DB, 위닝 수행 자료 DB 목록 상단의 검색 테스트.
// 학생 요청과 같은 조건으로 검색을 돌려, 어떤 카드가 몇 위로 잡히고 threshold 를
// 넘는지, 실제 프롬프트에 들어가는지를 보여 준다. 판단은 서버(api/_lib/knowledge/preview.ts)가 한다.
// 기본은 학생 요청의 1차 경로인 하이브리드(뜻 검색과 단어 검색 결합)이고, 폴백 경로인
// 벡터 검색으로 바꿔 비교할 수 있다.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  Select,
  Textarea,
  TextInput,
} from "@/pages/admin/shared/formFields";
import type { SearchPreviewMode } from "../../../../../api/_lib/knowledge/preview.js";
import { postSearchPreview, type SearchPreviewResult } from "../api";
import SearchResultTable from "./SearchResultTable";

// 학생 요청의 학년 값과 같은 형식이다. 빈 값이면 학년 필터 없이 검색한다.
const GRADE_OPTIONS = ["고1", "고2", "고3"];

const MODE_OPTIONS: { value: SearchPreviewMode; label: string }[] = [
  { value: "hybrid", label: "하이브리드" },
  { value: "vector", label: "벡터만" },
];

const MODE_DESCRIPTIONS: Record<SearchPreviewMode, string> = {
  hybrid:
    "학생 요청의 1차 경로입니다. 뜻 검색 순위와 단어 검색 순위를 합친 점수 순서로 보여 줍니다. 실제 주입은 앞에서부터 개수와 글자 상한까지이고, 단어로만 걸린 카드는 유사도가 threshold 아래여도 주입됩니다.",
  vector:
    "하이브리드가 실패할 때 쓰는 폴백 경로입니다. threshold 아래 카드도 함께 보여 줍니다. 실제 주입은 threshold 를 넘은 카드 중 앞에서부터 개수와 글자 상한까지입니다.",
};

type PreviewConfig = {
  title: string;
  fixedValues: Record<string, unknown>;
};

type PreviewForm = {
  grade: string;
  subject: string;
  career: string;
  selectedTopic: string;
  assessmentInfo: string;
};

const EMPTY_FORM: PreviewForm = {
  grade: "",
  subject: "",
  career: "",
  selectedTopic: "",
  assessmentInfo: "",
};

export default function SearchPreview({ config }: { config: PreviewConfig }) {
  const knowledgeType = String(config.fixedValues.knowledge_type) as
    | "topic_pattern"
    | "verified_resource";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PreviewForm>(EMPTY_FORM);
  // 기본값은 학생 요청 경로와 같다. 주제 추천은 다른 과목을 포함하고 자료 검색은 뺀다.
  const [includeOtherSubjects, setIncludeOtherSubjects] = useState(
    knowledgeType === "topic_pattern",
  );
  const [mode, setMode] = useState<SearchPreviewMode>("hybrid");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SearchPreviewResult | null>(null);

  function change(key: keyof PreviewForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function runSearch() {
    setBusy(true);
    setMessage("");
    const response = await postSearchPreview({
      knowledgeType,
      ...form,
      includeOtherSubjects,
      mode,
    });
    setBusy(false);
    if (!response.ok) {
      setResult(null);
      setMessage(response.message);
      return;
    }
    setResult(response.data);
  }

  const isHybridResult = result?.mode === "hybrid";

  return (
    <div className="mb-6 flex items-center justify-between gap-3 bg-white p-4 text-sm shadow-sm">
      <div>
        <div className="font-semibold">검색 테스트</div>
        <p className="mt-1 text-xs text-muted-foreground">
          학생 요청과 같은 조건으로 검색해 카드 순위와 실제 주입 여부를
          확인합니다.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => setOpen(true)}
      >
        검색 테스트
      </Button>

      <Dialog
        open={open}
        disablePointerDismissal
        onOpenChange={(next, eventDetails) => {
          if (next) return;
          // 검색 중에 닫으면 응답이 닫힌 화면에 들어온다. 진행 중에는 모든 닫기를 막는다.
          // eventDetails.cancel(): Base UI onOpenChange 취소 API (SensitiveActionGate 와 같은 방식)
          if (busy) {
            eventDetails.cancel();
            return;
          }
          setOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-[64rem]">
          <DialogHeader>
            <DialogTitle>{config.title} 검색 테스트</DialogTitle>
            <DialogDescription>{MODE_DESCRIPTIONS[mode]}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-4 gap-3">
            <Field label="학년">
              <Select value={form.grade} onChange={(v) => change("grade", v)}>
                <option value="">지정 안 함</option>
                {GRADE_OPTIONS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="교과군 또는 과목">
              <TextInput
                value={form.subject}
                onChange={(v) => change("subject", v)}
                placeholder="예: 물리학"
              />
            </Field>
            <Field label="희망 진로">
              <TextInput
                value={form.career}
                onChange={(v) => change("career", v)}
              />
            </Field>
            <Field label="주제">
              <TextInput
                value={form.selectedTopic}
                onChange={(v) => change("selectedTopic", v)}
              />
            </Field>
            <div className="col-span-4">
              <Field label="수행평가 안내문">
                <Textarea
                  value={form.assessmentInfo}
                  onChange={(v) => change("assessmentInfo", v)}
                  rows={3}
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-4">
              <fieldset className="inline-flex items-center gap-3 text-xs font-medium">
                <legend className="sr-only">검색 방식</legend>
                {MODE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="inline-flex items-center gap-1"
                  >
                    <input
                      type="radio"
                      name={`search-preview-mode-${knowledgeType}`}
                      value={option.value}
                      className="accent-primary"
                      checked={mode === option.value}
                      onChange={() => setMode(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <label className="inline-flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={includeOtherSubjects}
                  onChange={(e) => setIncludeOtherSubjects(e.target.checked)}
                />
                다른 교과군 카드도 포함
              </label>
            </div>
            <Button
              type="button"
              size="lg"
              className="font-semibold"
              onClick={runSearch}
              disabled={busy}
            >
              {busy ? "검색 중" : "검색"}
            </Button>
          </div>

          {message && (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              {message}
            </p>
          )}

          {result && (
            <div className="max-h-[24rem] overflow-y-auto border border-border text-xs">
              <p className="bg-muted/50 px-2 py-1 text-muted-foreground">
                {isHybridResult ? "하이브리드" : "벡터만"}, threshold{" "}
                {result.threshold}, 결과 {result.items.length}건
              </p>
              {isHybridResult && (
                <p className="bg-muted/50 px-2 pb-1 break-all text-muted-foreground">
                  단어 질의: {result.keywordQuery || "없음(뜻 검색만 반영)"}
                </p>
              )}
              <SearchResultTable result={result} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
