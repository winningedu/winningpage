import { useState } from "react";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { KIND_OPTIONS, SERVICE_OPTIONS, STATUS_OPTIONS } from "./format";
import type { AiTelemetryFilters, AiTelemetryTab } from "./query";

// 입력 중인 값(draft)만 들고, 조회를 눌러야 onSubmit 으로 올린다. 적용된 값이 바뀌면 부모가 key 로 다시 만든다.
export default function FilterForm({
  tab,
  applied,
  onSubmit,
}: {
  tab: AiTelemetryTab;
  applied: AiTelemetryFilters;
  onSubmit: (filters: AiTelemetryFilters) => void;
}) {
  const [draft, setDraft] = useState(applied);
  const patch = (change: Partial<AiTelemetryFilters>) =>
    setDraft((prev) => ({ ...prev, ...change }));

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft);
      }}
    >
      <div className="w-[10rem]">
        <Field label="시작일">
          <TextInput
            value={draft.from}
            onChange={(from) => patch({ from })}
            placeholder="YYYY-MM-DD"
          />
        </Field>
      </div>
      <div className="w-[10rem]">
        <Field label="종료일">
          <TextInput
            value={draft.to}
            onChange={(to) => patch({ to })}
            placeholder="YYYY-MM-DD"
          />
        </Field>
      </div>
      {tab !== "citations" && (
        <div className="w-[10rem]">
          <Field label="서비스">
            <Select
              value={draft.service}
              onChange={(service) => patch({ service })}
            >
              <option value="">전체</option>
              {SERVICE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {tab === "calls" && (
        <>
          <div className="w-[12rem]">
            <Field label="기능">
              <TextInput
                value={draft.feature}
                onChange={(feature) => patch({ feature })}
              />
            </Field>
          </div>
          <div className="w-[8rem]">
            <Field label="상태">
              <Select
                value={draft.status}
                onChange={(status) => patch({ status })}
              >
                <option value="">전체</option>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-[8rem]">
            <Field label="종류">
              <Select value={draft.kind} onChange={(kind) => patch({ kind })}>
                <option value="">전체</option>
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex h-10 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="accent-primary"
              checked={draft.retriedOnly}
              onChange={(e) => patch({ retriedOnly: e.target.checked })}
            />
            재요청만
          </label>
        </>
      )}
      <ActionButton type="submit">조회</ActionButton>
    </form>
  );
}
