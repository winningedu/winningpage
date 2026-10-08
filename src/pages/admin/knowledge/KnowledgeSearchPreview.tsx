// 위닝 수행 주제 DB, 위닝 수행 자료 DB 목록 상단의 검색 테스트.
// 학생 요청과 같은 조건으로 검색을 돌려, 어떤 카드가 몇 위로 잡히고 threshold 를
// 넘는지, 실제 프롬프트에 들어가는지를 보여 준다. 판단은 서버(api/_lib/knowledge/preview.ts)가 한다.
// 기본은 학생 요청의 1차 경로인 하이브리드(뜻 검색과 단어 검색 결합)이고, 폴백 경로인
// 벡터 검색으로 바꿔 비교할 수 있다.

import { Fragment, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SearchPreviewMode } from "../../../../api/_lib/knowledge/preview.js";
import {
  type KnowledgeSearchPreviewResult,
  postKnowledgeSearchPreview,
} from "./knowledgeBulkApi";

const BUTTON_CLASS =
  "h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50";

const INPUT_CLASS =
  "h-9 w-full border border-gray-400 bg-white px-3 text-sm outline-hidden";

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

function formatRank(rank: number | null | undefined): string {
  return typeof rank === "number" ? String(rank) : "없음";
}

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

export default function KnowledgeSearchPreview({
  config,
}: {
  config: PreviewConfig;
}) {
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
  const [result, setResult] = useState<KnowledgeSearchPreviewResult | null>(
    null,
  );

  function change(key: keyof PreviewForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function runSearch() {
    setBusy(true);
    setMessage("");
    try {
      setResult(
        await postKnowledgeSearchPreview({
          knowledgeType,
          ...form,
          includeOtherSubjects,
          mode,
        }),
      );
    } catch (error) {
      setResult(null);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const isHybridResult = result?.mode === "hybrid";
  // 벡터 결과만 유사도 내림차순이라 threshold 경계선이 한 줄로 그어진다.
  const boundary =
    result && !isHybridResult
      ? result.items.findIndex((item) => !item.passesThreshold)
      : -1;
  const columnCount = isHybridResult ? 9 : 7;

  return (
    <div className="mb-6 flex items-center justify-between gap-3 bg-white p-4 text-sm shadow-sm">
      <div>
        <div className="font-black">검색 테스트</div>
        <p className="mt-1 text-xs font-bold text-gray-500">
          학생 요청과 같은 조건으로 검색해 카드 순위와 실제 주입 여부를
          확인합니다.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={BUTTON_CLASS}
      >
        검색 테스트
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-[64rem]">
          <DialogHeader>
            <DialogTitle>{config.title} 검색 테스트</DialogTitle>
            <DialogDescription>{MODE_DESCRIPTIONS[mode]}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-4 gap-3 text-xs font-bold">
            <label className="flex flex-col gap-1">
              학년
              <select
                value={form.grade}
                onChange={(e) => change("grade", e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">지정 안 함</option>
                {GRADE_OPTIONS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              교과군 또는 과목
              <input
                value={form.subject}
                onChange={(e) => change("subject", e.target.value)}
                placeholder="예: 물리학"
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1">
              희망 진로
              <input
                value={form.career}
                onChange={(e) => change("career", e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1">
              주제
              <input
                value={form.selectedTopic}
                onChange={(e) => change("selectedTopic", e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="col-span-4 flex flex-col gap-1">
              수행평가 안내문
              <textarea
                value={form.assessmentInfo}
                onChange={(e) => change("assessmentInfo", e.target.value)}
                rows={3}
                className="w-full resize-y border border-gray-400 px-3 py-2 text-sm outline-hidden"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-4">
              <fieldset className="inline-flex items-center gap-3 text-xs font-bold">
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
                      checked={mode === option.value}
                      onChange={() => setMode(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <label className="inline-flex items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={includeOtherSubjects}
                  onChange={(e) => setIncludeOtherSubjects(e.target.checked)}
                />
                다른 교과군 카드도 포함
              </label>
            </div>
            <button
              type="button"
              onClick={runSearch}
              disabled={busy}
              className="h-9 bg-[#2348ff] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "검색 중" : "검색"}
            </button>
          </div>

          {message && (
            <p className="border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
              {message}
            </p>
          )}

          {result && (
            <div className="max-h-[24rem] overflow-y-auto border border-gray-200 text-xs">
              <p className="bg-gray-50 px-2 py-1 font-bold text-gray-600">
                {isHybridResult ? "하이브리드" : "벡터만"}, threshold{" "}
                {result.threshold}, 결과 {result.items.length}건
              </p>
              {isHybridResult && (
                <p className="bg-gray-50 px-2 pb-1 font-bold break-all text-gray-500">
                  단어 질의: {result.keywordQuery || "없음(뜻 검색만 반영)"}
                </p>
              )}
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="w-[3rem] px-2 py-1">순위</th>
                    <th className="px-2 py-1">자료명</th>
                    <th className="w-[5rem] px-2 py-1">학년</th>
                    <th className="w-[6rem] px-2 py-1">교과군</th>
                    <th className="w-[6rem] px-2 py-1">유사도</th>
                    {isHybridResult && (
                      <>
                        <th className="w-[7rem] px-2 py-1">뜻, 단어 순위</th>
                        <th className="w-[6rem] px-2 py-1">RRF 점수</th>
                      </>
                    )}
                    <th className="w-[6rem] px-2 py-1">threshold</th>
                    <th className="w-[6rem] px-2 py-1">실제 주입</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={columnCount}
                        className="px-2 py-6 text-center"
                      >
                        검색된 카드가 없습니다. 임베딩이 끝난 사용 중 카드만
                        검색됩니다.
                      </td>
                    </tr>
                  )}
                  {result.items.map((item, index) => (
                    <Fragment key={item.id}>
                      {index === boundary && (
                        <tr className="border-t-2 border-red-400">
                          <td
                            colSpan={columnCount}
                            className="bg-red-50 px-2 py-1 font-black text-red-600"
                          >
                            여기부터 threshold 미달
                          </td>
                        </tr>
                      )}
                      <tr
                        className={`border-t border-gray-100 ${(isHybridResult ? item.wouldBeInjected : item.passesThreshold) ? "" : "text-gray-400"}`}
                      >
                        <td className="px-2 py-1">{item.rank}</td>
                        <td className="px-2 py-1">{item.title}</td>
                        <td className="px-2 py-1">{item.grade}</td>
                        <td className="px-2 py-1">{item.subject}</td>
                        <td className="px-2 py-1 tabular-nums">
                          {item.similarity.toFixed(4)}
                        </td>
                        {isHybridResult && (
                          <>
                            <td className="px-2 py-1 tabular-nums">
                              {formatRank(item.semanticRank)},{" "}
                              {formatRank(item.keywordRank)}
                            </td>
                            <td className="px-2 py-1 tabular-nums">
                              {typeof item.rrfScore === "number"
                                ? item.rrfScore.toFixed(5)
                                : ""}
                            </td>
                          </>
                        )}
                        <td className="px-2 py-1">
                          {item.passesThreshold ? "통과" : "미달"}
                        </td>
                        <td className="px-2 py-1 font-bold">
                          {item.wouldBeInjected ? "주입" : "제외"}
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
