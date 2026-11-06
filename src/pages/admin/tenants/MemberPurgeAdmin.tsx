import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  fetchMemberPurgePreview,
  type PurgePreview,
  type PurgeResult,
  runMemberPurge,
} from "./api";
import { deletionDdayText, todayKst } from "./tenantContract";

// ---------------------------------------------------------------------------
// 계약 종료 회원 삭제(사 #162, #176, 결정 102.1, 102.3, 102.4). 기관을 고르면 미리보기(가린 이름, 학년, 반, 번호,
// 유료 전환 보호 표시)를 읽는다. 삭제는 고른 학생 번호만 서버에 보내고, 서버가 실행 때 보호를 다시 본다.
// ---------------------------------------------------------------------------

interface ContractTenant {
  id: string;
  code: string;
  name: string;
  contract_end_date: string;
}

export default function MemberPurgeAdmin() {
  const [tenants, setTenants] = useState<ContractTenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [preview, setPreview] = useState<PurgePreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PurgeResult | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("tenants")
      .select("id, code, name, contract_end_date")
      .not("contract_end_date", "is", null)
      .order("name")
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setError("기관 목록을 불러오지 못했어요.");
          return;
        }
        setTenants((data ?? []) as ContractTenant[]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadPreview(id: string) {
    setPreview(null);
    setSelected(new Set());
    if (!id) return;
    const loaded = await fetchMemberPurgePreview(id);
    if (!loaded.ok) {
      setError(loaded.message);
      return;
    }
    setPreview(loaded.data);
    setSelected(
      new Set(
        loaded.data.students.filter((s) => !s.protected).map((s) => s.id),
      ),
    );
  }

  async function choose(id: string) {
    setTenantId(id);
    setError("");
    setResult(null);
    await loadPreview(id);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const tenantName = tenants.find((t) => t.id === tenantId)?.name ?? "";

  async function run() {
    if (running) return;
    setRunning(true);
    setError("");
    const purged = await runMemberPurge({
      tenantId,
      targetIds: [...selected],
    });
    setRunning(false);
    setConfirming(false);
    setTypedName("");
    if (!purged.ok) {
      setError(purged.message);
      return;
    }
    setResult(purged.data);
    await loadPreview(tenantId);
  }

  const ddayText = preview
    ? deletionDdayText({
        contractEnd: preview.contractEnd,
        graceEnds: preview.graceEnd,
        defaultGraceDays: null,
        today: todayKst(),
      })
    : null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-black">계약 종료 회원 삭제</h1>
      <div className="mb-6 max-w-sm bg-white p-6 shadow-sm">
        <Field label="기관">
          <Select value={tenantId} onChange={choose}>
            <option value="">기관을 고르세요</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.code})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && (
        <div className="mb-4 text-sm font-bold text-red-600">{error}</div>
      )}
      {result && (
        <div className="mb-4 text-sm font-bold text-green-700">
          {`삭제 ${result.deleted}명, 제외(유료 전환) ${result.excluded}명, 제외(직접) ${result.skipped}명`}
        </div>
      )}
      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="계약 종료 회원 삭제 확인"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="w-full max-w-md bg-white p-6 shadow-lg">
            <p className="mb-4 text-sm font-black text-red-600">
              {`삭제한 회원정보는 되돌릴 수 없어요. ${selected.size}명을 삭제할까요?`}
            </p>
            <Field label="기관 이름 입력">
              <TextInput
                value={typedName}
                onChange={setTypedName}
                placeholder={tenantName}
              />
            </Field>
            <div className="mt-4 flex gap-2">
              <ActionButton
                variant="danger"
                disabled={typedName !== tenantName || running}
                onClick={run}
              >
                삭제
              </ActionButton>
              <ActionButton
                variant="light"
                onClick={() => {
                  setConfirming(false);
                  setTypedName("");
                }}
              >
                취소
              </ActionButton>
            </div>
          </div>
        </div>
      )}
      {preview && (
        <div className="bg-white p-6 shadow-sm">
          <dl className="mb-4 flex flex-wrap gap-8 text-sm">
            <div>
              <dt className="text-xs font-black text-gray-500">계약 종료일</dt>
              <dd className="font-bold">{preview.contractEnd ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-black text-gray-500">유예 종료일</dt>
              <dd className="font-bold">{preview.graceEnd ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-black text-gray-500">삭제 가능일</dt>
              <dd className="font-bold">{ddayText ?? "-"}</dd>
            </div>
          </dl>
          <div className="mb-4">
            <ActionButton
              variant="danger"
              disabled={selected.size === 0}
              onClick={() => setConfirming(true)}
            >
              삭제 실행
            </ActionButton>
          </div>
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-gray-300">
                <th className="px-3 py-3 text-left">선택</th>
                <th className="px-3 py-3 text-left">이름</th>
                <th className="px-3 py-3 text-left">학년</th>
                <th className="px-3 py-3 text-left">반</th>
                <th className="px-3 py-3 text-left">번호</th>
                <th className="px-3 py-3 text-left">구분</th>
              </tr>
            </thead>
            <tbody>
              {preview.students.map((student) => (
                <tr key={student.id} className="border-b border-gray-100">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`${student.name} 선택`}
                      checked={selected.has(student.id)}
                      disabled={student.protected}
                      onChange={() => toggle(student.id)}
                    />
                  </td>
                  <td className="px-3 py-3 font-bold">{student.name}</td>
                  <td className="px-3 py-3">{student.grade ?? "-"}</td>
                  <td className="px-3 py-3">{student.classLabel ?? "-"}</td>
                  <td className="px-3 py-3">{student.number ?? "-"}</td>
                  <td className="px-3 py-3">
                    {student.protected ? "제외(유료 전환)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
