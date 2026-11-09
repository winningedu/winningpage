// W14 학생 가입 연결 미리보기(교 #119, 결정 6). 학생 한 명의 이름, 학년그룹, 그룹, 반, 번호로 가입 결과를 시험한다.
// 결과는 이미 가입, 번호 사용 중, 정상 연결 세 가지이고 없는 학급은 따로 알린다. 아무것도 저장하지 않는다.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { consoleRequest } from "../api";
import FilterSelect from "../FilterSelect";
import TextField from "../TextField";
import { GRADES, useGroups } from "./ClassRowFields";

type Result =
  | { result: "ok" | "already_signed_up" | "no_class"; homeroomName?: string }
  | { result: "number_taken"; homeroomName?: string; holderName: string };

const FAILED_MESSAGE =
  "연결 결과를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요";

function messageOf(r: Result): string {
  switch (r.result) {
    case "ok":
      return `정상 연결돼요. ${r.homeroomName ?? "담임"} 선생님 반으로 이어져요`;
    case "already_signed_up":
      return "이미 가입한 학생이에요";
    case "number_taken":
      return `번호 사용 중이에요. ${r.holderName} 학생이 쓰고 있어요. 다른 번호로 가입하도록 안내해 주세요`;
    case "no_class":
      return "등록되지 않은 학급이에요. 학년그룹과 반을 확인해 주세요";
  }
}

export default function ConnectPreviewPanel() {
  const groups = useGroups();
  const [values, setValues] = useState({
    name: "",
    grade: "",
    groupId: "",
    className: "",
    number: "",
  });
  const [outcome, setOutcome] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const change = (patch: Partial<typeof values>) =>
    setValues((prev) => ({ ...prev, ...patch }));
  const ready =
    values.name.trim() !== "" &&
    values.grade !== "" &&
    values.className.trim() !== "" &&
    values.number.trim() !== "";

  const check = async () => {
    setBusy(true);
    setOutcome(null);
    setFailed(false);
    const query = new URLSearchParams({
      name: values.name.trim(),
      grade: values.grade,
      ...(values.groupId ? { groupId: values.groupId } : {}),
      className: values.className.trim(),
      number: values.number.trim(),
    });
    const res = await consoleRequest(
      `/api/console/teachers/connect-preview?${query}`,
    );
    setBusy(false);
    if (res.status !== 200) {
      setFailed(true);
      return;
    }
    setOutcome(messageOf(res.body as Result));
  };

  return (
    <section
      aria-label="학생 가입 연결 미리보기"
      className="mb-6 flex flex-col gap-3 rounded-lg bg-surface-muted p-4"
    >
      <p className="text-app-label text-ink-sub">
        학생 한 명의 값을 넣어 가입했을 때 어떻게 이어지는지 미리 확인해요
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label="이름"
          value={values.name}
          onChange={(e) => change({ name: e.target.value })}
        />
        <FilterSelect
          variant="stacked"
          label="학년그룹"
          value={values.grade}
          options={[
            { value: "", label: "선택" },
            ...GRADES.map((g) => ({ value: g, label: g })),
          ]}
          onChange={(grade) => change({ grade })}
        />
        {(groups.data?.length ?? 0) > 0 && (
          <FilterSelect
            variant="stacked"
            label="그룹"
            value={values.groupId}
            options={[
              { value: "", label: "없음" },
              ...(groups.data ?? []).map((g) => ({
                value: g.id,
                label: g.name,
              })),
            ]}
            onChange={(groupId) => change({ groupId })}
          />
        )}
        <TextField
          label="반"
          value={values.className}
          onChange={(e) => change({ className: e.target.value })}
        />
        <TextField
          label="번호"
          inputMode="numeric"
          value={values.number}
          onChange={(e) => change({ number: e.target.value })}
        />
        <Button
          type="button"
          disabled={!ready || busy}
          onClick={() => void check()}
          className="h-10 rounded-lg px-5 text-app-label font-semibold disabled:opacity-40"
        >
          확인
        </Button>
      </div>
      {outcome && (
        <p
          role="status"
          className="text-app-label font-semibold text-ink-strong"
        >
          {outcome}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-app-label text-ink-danger">
          {FAILED_MESSAGE}
        </p>
      )}
    </section>
  );
}
