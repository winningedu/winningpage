import { useState } from "react";
import { tenantSaveErrorMessage } from "@/components/admin/tenantSaveError";
import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";

// 스쿨멘토 본사의 학생 기관 이동(사 결정 r4 4번, 결정 102). 소속만이 아니라 학적(학년, 그룹, 반, 번호)도
// 대상 기관에 만들어야 학생이 새 기관 콘솔에 보이므로 POST /api/admin/tenants/move-student 를 부른다.
// 반은 비워도 된다. 비우면 학생이 마이페이지에서 반을 입력한다.

const GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"];

export interface MoveTarget {
  id: string;
  name: string;
  orgType: string | null;
  isCatchAll: boolean;
}

interface MoveStudentFormProps {
  profileId: string;
  tenant: MoveTarget;
  onMoved: () => void;
  onCancel: () => void;
}

export default function MoveStudentForm({
  profileId,
  tenant,
  onMoved,
  onCancel,
}: MoveStudentFormProps) {
  const [grade, setGrade] = useState("");
  const [groupName, setGroupName] = useState("");
  const [className, setClassName] = useState("");
  const [number, setNumber] = useState("");
  const [moving, setMoving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 기타 기관은 학급을 정하지 않는다(결정 77, 98.9). 학교가 아닌 기관만 그룹이 있다.
  const showClassFields = !tenant.isCatchAll;
  const showGroup = showClassFields && tenant.orgType !== "학교";

  async function submit() {
    if (!grade || moving) return;
    setMoving(true);
    setErrorMessage("");

    try {
      const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
      const body: Record<string, unknown> = {
        profileId,
        tenantId: tenant.id,
        grade,
      };
      if (showGroup && groupName.trim()) body.groupName = groupName.trim();
      if (showClassFields && className.trim())
        body.className = className.trim();
      // 숫자가 아니면 문자열 그대로 보내 서버가 400 으로 거절하게 한다(NaN 은 JSON 에서 null 이 되어 조용히 사라진다).
      if (showClassFields && number.trim()) {
        const trimmed = number.trim();
        body.number = /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
      }

      const response = await fetch("/api/admin/tenants/move-student", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        const error = result?.error as
          | { code?: string; message?: string }
          | undefined;
        setErrorMessage(
          error?.code === "PHONE_TAKEN"
            ? tenantSaveErrorMessage({ code: "23505", message: "" })
            : error?.message || `HTTP ${response.status}`,
        );
        return;
      }

      onMoved();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "학생을 옮기지 못했어요.",
      );
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="mt-2 space-y-3 border border-gray-300 bg-gray-50 p-3">
      <p className="text-sm font-black text-gray-700">
        {tenant.name}(으)로 옮기기
      </p>
      <Field label="학년">
        <Select value={grade} onChange={setGrade}>
          <option value="">학년 선택</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
      </Field>
      {showGroup ? (
        <Field label="그룹">
          <TextInput value={groupName} onChange={setGroupName} />
        </Field>
      ) : null}
      {showClassFields ? (
        <>
          <Field label="반">
            <TextInput value={className} onChange={setClassName} />
          </Field>
          <Field label="번호">
            <TextInput value={number} onChange={setNumber} />
          </Field>
          <p className="text-xs font-bold text-gray-500">
            반을 비우면 학생이 마이페이지에서 반을 입력해요.
          </p>
        </>
      ) : null}
      {errorMessage ? (
        <p className="text-xs font-black text-red-600">{errorMessage}</p>
      ) : null}
      <div className="flex gap-2">
        <ActionButton onClick={submit} disabled={!grade || moving}>
          {moving ? "옮기는 중..." : "옮기기"}
        </ActionButton>
        <ActionButton variant="light" onClick={onCancel}>
          취소
        </ActionButton>
      </div>
    </div>
  );
}
