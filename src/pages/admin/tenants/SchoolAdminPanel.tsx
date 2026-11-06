import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  fetchSchoolAdmins,
  type IssuedSchoolAdmin,
  issueSchoolAdmin,
  type SchoolAdminList,
} from "./api";

// ---------------------------------------------------------------------------
// 기관 상세의 학교 관리자 탭(사 #159, 결정 102.6). 목록은 읽기만 하고(주소, 발급일, 등록취소일),
// 취소와 재발급은 본사 대행으로 한다. 발급 결과의 임시 비밀번호는 모달에서 한 번만 보여 주고
// 닫으면 상태에서 지운다(서버도 응답에 한 번만 싣는다).
// ---------------------------------------------------------------------------

interface SchoolAdminPanelProps {
  tenantId: string;
  tenantName: string;
}

interface IssueForm {
  name: string;
  phone: string;
  landline: string;
  email: string;
  position: string;
}

const EMPTY_FORM: IssueForm = {
  name: "",
  phone: "",
  landline: "",
  email: "",
  position: "",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR");
}

export default function SchoolAdminPanel({
  tenantId,
  tenantName,
}: SchoolAdminPanelProps) {
  const [list, setList] = useState<SchoolAdminList | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<IssueForm>(EMPTY_FORM);
  const [issuing, setIssuing] = useState(false);
  const [formError, setFormError] = useState("");
  const [issued, setIssued] = useState<IssuedSchoolAdmin | null>(null);

  const load = useCallback(async () => {
    const result = await fetchSchoolAdmins(tenantId);
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setLoadError("");
    setList(result.data);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  function setField(key: keyof IssueForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function issue() {
    if (issuing) return;
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name || !phone) {
      setFormError("이름과 전화번호를 입력해 주세요.");
      return;
    }
    setFormError("");
    setIssuing(true);
    const landline = form.landline.trim();
    const email = form.email.trim();
    const position = form.position.trim();
    const result = await issueSchoolAdmin({
      tenantId,
      name,
      phone,
      ...(landline ? { landline } : {}),
      ...(email ? { email } : {}),
      ...(position ? { position } : {}),
    });
    setIssuing(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setForm(EMPTY_FORM);
    setIssued(result.data);
    await load();
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div>
      {issued && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="학교 관리자 발급 결과"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="w-full max-w-md bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-black">
              학교 관리자를 발급했습니다
            </h2>
            <div className="mb-1 text-sm font-bold text-gray-500">아이디</div>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex-1 border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-lg font-black tracking-widest">
                {issued.loginId}
              </span>
              <ActionButton
                variant="light"
                onClick={() => copy(issued.loginId)}
              >
                <Copy size={14} />
                복사
              </ActionButton>
            </div>
            {issued.tempPassword ? (
              <>
                <div className="mb-1 text-sm font-bold text-gray-500">
                  임시 비밀번호
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex-1 border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-lg font-black tracking-widest">
                    {issued.tempPassword}
                  </span>
                  <ActionButton
                    variant="light"
                    onClick={() => copy(issued.tempPassword as string)}
                  >
                    <Copy size={14} />
                    복사
                  </ActionButton>
                </div>
                <p className="mb-4 text-xs font-bold text-red-600">
                  임시 비밀번호는 지금 한 번만 볼 수 있어요. 닫으면 다시 볼 수
                  없어요.
                </p>
              </>
            ) : (
              <p className="mb-4 text-xs font-bold text-gray-500">
                이미 계정이 있어 새 임시 비밀번호는 없어요.
              </p>
            )}
            <ActionButton onClick={() => setIssued(null)}>확인</ActionButton>
          </div>
        </div>
      )}

      <div className="mb-6 bg-white p-6 shadow-sm">
        <div className="mb-3 text-sm font-bold text-gray-500">
          학교 관리자 목록
        </div>
        {loadError && (
          <div className="mb-3 text-sm font-bold text-red-600">{loadError}</div>
        )}
        <table className="w-full min-w-[45rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              <th className="px-3 py-3 text-left">이름</th>
              <th className="px-3 py-3 text-left">직책</th>
              <th className="px-3 py-3 text-left">아이디</th>
              <th className="px-3 py-3 text-left">전화번호</th>
              <th className="px-3 py-3 text-left">일반전화</th>
              <th className="px-3 py-3 text-left">담당 이메일</th>
              <th className="px-3 py-3 text-left">주소</th>
              <th className="px-3 py-3 text-left">발급일</th>
              <th className="px-3 py-3 text-left">등록취소일</th>
            </tr>
          </thead>
          <tbody>
            {!list || list.admins.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400">
                  발급한 학교 관리자가 없습니다.
                </td>
              </tr>
            ) : (
              list.admins.map((admin) => (
                <tr key={admin.id} className="border-b border-gray-100">
                  <td className="px-3 py-3 font-bold">{admin.name}</td>
                  <td className="px-3 py-3">{admin.position ?? "-"}</td>
                  <td className="px-3 py-3 font-mono text-[0.8125rem]">
                    {admin.loginId ?? "-"}
                  </td>
                  <td className="px-3 py-3">{admin.phone}</td>
                  <td className="px-3 py-3">{admin.landline ?? "-"}</td>
                  <td className="px-3 py-3">{admin.email ?? "-"}</td>
                  <td className="px-3 py-3">{list.address ?? "-"}</td>
                  <td className="px-3 py-3">{formatDate(admin.issuedAt)}</td>
                  <td className="px-3 py-3">{formatDate(admin.canceledAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="mt-3 text-xs font-bold text-gray-500">
          취소와 재발급은 본사 대행으로 해 주세요.
        </p>
      </div>

      <div className="bg-white p-6 shadow-sm">
        <div className="mb-3 text-sm font-bold text-gray-500">
          학교 관리자 발급
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="학교">
            <input
              value={tenantName}
              readOnly
              className="h-10 w-full border border-gray-300 bg-gray-50 px-3 text-sm font-bold"
            />
          </Field>
          <Field label="이름">
            <TextInput
              value={form.name}
              onChange={(value) => setField("name", value)}
            />
          </Field>
          <Field label="전화번호">
            <TextInput
              value={form.phone}
              onChange={(value) => setField("phone", value)}
            />
          </Field>
          <Field label="일반전화">
            <TextInput
              value={form.landline}
              onChange={(value) => setField("landline", value)}
            />
          </Field>
          <Field label="담당 이메일">
            <TextInput
              value={form.email}
              onChange={(value) => setField("email", value)}
            />
          </Field>
          <Field label="직책">
            <TextInput
              value={form.position}
              onChange={(value) => setField("position", value)}
            />
          </Field>
          <ActionButton onClick={issue} disabled={issuing}>
            {issuing ? "발급 중..." : "발급"}
          </ActionButton>
        </div>
        {formError && (
          <div className="mt-3 text-sm font-bold text-red-600">{formError}</div>
        )}
      </div>
    </div>
  );
}
