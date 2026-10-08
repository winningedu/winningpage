import { useState } from "react";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { type PricingResponse, putPricing } from "./api";
import { formatDate, NO_DATA } from "./format";
import {
  emptyPricingRow,
  fromPricing,
  MODEL_PLACEHOLDERS,
  type PricingRow,
  toPricingBody,
} from "./pricingForm";

export default function PricingTab({ initial }: { initial: PricingResponse }) {
  const [rows, setRows] = useState<PricingRow[]>(() =>
    initial.pricing && Object.keys(initial.pricing).length > 0
      ? fromPricing(initial.pricing)
      : [emptyPricingRow()],
  );
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function patch(index: number, change: Partial<PricingRow>) {
    setSaved(false);
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...change } : r)),
    );
  }

  async function save() {
    if (busy) return;
    const body = toPricingBody(rows);
    if (!body.ok) {
      setError(body.message);
      setSaved(false);
      return;
    }
    setBusy(true);
    setError("");
    const result = await putPricing(body.pricing);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setSaved(false);
      return;
    }
    setRows(fromPricing(result.data.pricing));
    setUpdatedAt(new Date().toISOString());
    setSaved(true);
  }

  return (
    <div className="bg-white p-6 shadow-sm">
      <div className="mb-4 text-sm font-bold text-gray-500">
        모델별 단가(USD per 1M 토큰). 마지막 저장{" "}
        {formatDate(updatedAt) || NO_DATA}
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          // 행은 순서가 곧 정체성이고 중간 삽입이 없어 index 키를 쓴다.
          // biome-ignore lint/suspicious/noArrayIndexKey: 행 정체성이 순서뿐이다
          <div key={index} className="flex items-end gap-3">
            <div className="w-[16rem]">
              <Field label={index === 0 ? "모델명" : ""}>
                <TextInput
                  value={row.model}
                  onChange={(model) => patch(index, { model })}
                  placeholder={MODEL_PLACEHOLDERS[index] ?? ""}
                />
              </Field>
            </div>
            <div className="w-[10rem]">
              <Field label={index === 0 ? "입력" : ""}>
                <TextInput
                  value={row.input}
                  onChange={(input) => patch(index, { input })}
                />
              </Field>
            </div>
            <div className="w-[10rem]">
              <Field label={index === 0 ? "캐시 입력" : ""}>
                <TextInput
                  value={row.cachedInput}
                  onChange={(cachedInput) => patch(index, { cachedInput })}
                />
              </Field>
            </div>
            <div className="w-[10rem]">
              <Field label={index === 0 ? "출력" : ""}>
                <TextInput
                  value={row.output}
                  onChange={(output) => patch(index, { output })}
                />
              </Field>
            </div>
            <ActionButton
              variant="light"
              onClick={() => {
                setSaved(false);
                setRows((prev) => prev.filter((_, i) => i !== index));
              }}
            >
              삭제
            </ActionButton>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-4 border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-4 border border-green-300 bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
          단가를 저장했습니다.
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <ActionButton
          variant="light"
          onClick={() => setRows((prev) => [...prev, emptyPricingRow()])}
        >
          행 추가
        </ActionButton>
        <ActionButton onClick={save} disabled={busy}>
          {busy ? "저장 중..." : "저장"}
        </ActionButton>
      </div>
    </div>
  );
}
