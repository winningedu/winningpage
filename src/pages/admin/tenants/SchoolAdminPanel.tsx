import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { copyToClipboard } from "@/pages/admin/tenants/copyToClipboard";
import {
  fetchSchoolAdmins,
  type IssuedSchoolAdmin,
  issueSchoolAdmin,
  type SchoolAdminList,
} from "./api";

// ---------------------------------------------------------------------------
// 기관 상세의 전체 관리자 탭(사 #159, 결정 102.6). 목록은 읽기만 하고(주소, 발급일, 등록취소일),
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

  return (
    <div>
      {issued && (
        // 임시 비밀번호는 지금 한 번만 보인다. 확인으로만 닫히도록 닫기 시도를 모두
        // 취소한다(바깥 누름은 AlertDialog 가 기본으로 무시하고, Esc 는 여기서 막는다).
        // eventDetails.cancel(): Base UI 1.9 onOpenChange 취소 API
        <AlertDialog
          open
          onOpenChange={(_open, eventDetails) => eventDetails.cancel()}
        >
          <AlertDialogContent className="data-[size=default]:sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold">
                전체 관리자를 발급했습니다
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div>
              <div className="mb-1 text-sm font-medium text-gray-500">
                아이디
              </div>
              <div className="flex items-center gap-2">
                <span className="flex-1 border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-lg font-semibold tracking-widest">
                  {issued.loginId}
                </span>
                <ActionButton
                  variant="light"
                  onClick={() => copyToClipboard(issued.loginId)}
                >
                  <Copy size={14} />
                  복사
                </ActionButton>
              </div>
            </div>
            {issued.tempPassword ? (
              <>
                <div>
                  <div className="mb-1 text-sm font-medium text-gray-500">
                    임시 비밀번호
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-lg font-semibold tracking-widest">
                      {issued.tempPassword}
                    </span>
                    <ActionButton
                      variant="light"
                      onClick={() =>
                        copyToClipboard(issued.tempPassword as string)
                      }
                    >
                      <Copy size={14} />
                      복사
                    </ActionButton>
                  </div>
                </div>
                <p className="text-xs font-medium text-red-600">
                  임시 비밀번호는 지금 한 번만 볼 수 있어요. 닫으면 다시 볼 수
                  없어요.
                </p>
              </>
            ) : (
              <p className="text-xs font-medium text-gray-500">
                이미 계정이 있어 새 임시 비밀번호는 없어요.
              </p>
            )}
            <AlertDialogFooter>
              <ActionButton onClick={() => setIssued(null)}>확인</ActionButton>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <div className="mb-6 bg-white p-6 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-500">
          전체 관리자 목록
        </div>
        {loadError && (
          <div role="alert" className="mb-3 text-sm font-medium text-red-600">
            {loadError}
          </div>
        )}
        <Table className="min-w-[45rem] border-collapse">
          <TableHeader>
            <TableRow className="border-y border-gray-300 hover:bg-transparent">
              <TableHead
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                이름
              </TableHead>
              <TableHead
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                직책
              </TableHead>
              <TableHead
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                아이디
              </TableHead>
              <TableHead
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                전화번호
              </TableHead>
              <TableHead
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                일반전화
              </TableHead>
              <TableHead
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                담당 이메일
              </TableHead>
              <TableHead
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                주소
              </TableHead>
              <TableHead
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                발급일
              </TableHead>
              <TableHead
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                등록취소일
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!list || list.admins.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-8 text-center text-muted-foreground"
                >
                  발급한 전체 관리자가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              list.admins.map((admin) => (
                <TableRow key={admin.id} className="border-b border-gray-100">
                  <TableCell className="whitespace-normal px-3 py-3 font-medium">
                    {admin.name}
                  </TableCell>
                  <TableCell className="whitespace-normal px-3 py-3">
                    {admin.position ?? "-"}
                  </TableCell>
                  <TableCell className="px-3 py-3 font-mono text-[0.8125rem]">
                    {admin.loginId ?? "-"}
                  </TableCell>
                  <TableCell className="px-3 py-3">{admin.phone}</TableCell>
                  <TableCell className="px-3 py-3">
                    {admin.landline ?? "-"}
                  </TableCell>
                  <TableCell className="whitespace-normal px-3 py-3">
                    {admin.email ?? "-"}
                  </TableCell>
                  <TableCell className="whitespace-normal px-3 py-3">
                    {list.address ?? "-"}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    {formatDate(admin.issuedAt)}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    {formatDate(admin.canceledAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs font-medium text-gray-500">
          취소와 재발급은 본사 대행으로 해 주세요.
        </p>
      </div>

      <div className="bg-white p-6 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-500">
          전체 관리자 발급
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="기관">
            <input
              value={tenantName}
              readOnly
              className="h-10 w-full border border-gray-300 bg-gray-50 px-3 text-sm font-medium"
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
          <div role="alert" className="mt-3 text-sm font-medium text-red-600">
            {formError}
          </div>
        )}
      </div>
    </div>
  );
}
