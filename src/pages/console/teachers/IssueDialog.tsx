// W16b 신규 계정 발급. 담임교사용은 교사 정보에 있고 계정이 없는 선생님을 골라 발급하고(교 #129),
// 학교 전체 관리자용은 이름과 전화번호(필수)로 발급한다(결정 9). 발급 뒤에는 안내 파일을 한 번 내려받는다.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { consoleRequest, errorMessage } from "../api";
import FilterSelect from "../FilterSelect";
import Notice from "../Notice";
import TextField from "../TextField";
import { useGradeLabel } from "../useConsoleMe";
import IssuedPanel from "./IssuedPanel";
import type { IssuedRow } from "./issuedFile";
import { classText } from "./roster";
import TeacherDialog, {
  CancelButton,
  ConfirmButton,
  DialogFooter,
} from "./TeacherDialog";

export const UNISSUED_KEY = ["console", "teachers", "unissued"] as const;
const FAILED_MESSAGE = "계정을 발급하지 못했어요. 잠시 뒤 다시 시도해 주세요";

interface Unissued {
  id: string;
  name: string;
  phoneLast4: string;
  classes: { grade: string; groupName: string | null; name: string }[];
}

interface IssueResponse {
  teacherId: string;
  loginId: string;
  tempPassword?: string;
}

interface IssueDialogProps {
  /** W14 행의 발급 버튼에서 열면 그 선생님을 미리 고른다. */
  teacherId?: string;
  onIssued: () => void;
  onClose: () => void;
}

const KINDS = [
  { value: "homeroom", label: "담임교사용" },
  { value: "admin", label: "학교 전체 관리자용" },
];

export default function IssueDialog({
  teacherId = "",
  onIssued,
  onClose,
}: IssueDialogProps) {
  const gradeLabel = useGradeLabel();
  const [kind, setKind] = useState("homeroom");
  const [picked, setPicked] = useState(teacherId);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedRow[] | null>(null);

  const unissued = useQuery({
    queryKey: UNISSUED_KEY,
    queryFn: async () => {
      const res = await consoleRequest("/api/console/teachers/unissued");
      if (res.status !== 200) throw new Error(`unissued ${res.status}`);
      return (res.body as { items: Unissued[] }).items;
    },
    retry: false,
  });
  const admin = kind === "admin";
  const teacher = unissued.data?.find((t) => t.id === picked);
  const ready = admin ? name.trim() !== "" && phone.trim() !== "" : !!teacher;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await consoleRequest("/api/console/teachers/issue", {
      method: "POST",
      body: admin
        ? { role: "school_admin", name: name.trim(), phone: phone.trim() }
        : { teacherId: picked },
    });
    setBusy(false);
    const body = res.body as IssueResponse | null;
    if (res.status !== 200 || !body?.tempPassword) {
      setError(errorMessage(res.body) ?? FAILED_MESSAGE);
      return;
    }
    const first = teacher?.classes[0];
    setIssued([
      {
        name: admin ? name.trim() : (teacher?.name ?? ""),
        phoneLast4: (admin ? phone : (teacher?.phoneLast4 ?? ""))
          .replace(/\D/g, "")
          .slice(-4),
        grade: first ? gradeLabel(first.grade) : "",
        className: first ? `${first.name}반` : "",
        loginId: body.loginId,
        tempPassword: body.tempPassword,
      },
    ]);
    onIssued();
  };

  if (issued) {
    return (
      <TeacherDialog title="발급을 마쳤어요" onClose={onClose}>
        <IssuedPanel rows={issued} onClose={onClose} />
      </TeacherDialog>
    );
  }

  return (
    <TeacherDialog title="신규 계정 발급" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <FilterSelect
          variant="stacked"
          label="계정 종류"
          value={kind}
          options={KINDS}
          onChange={(value) => {
            setKind(value);
            setError(null);
          }}
        />
        {admin ? (
          <>
            <TextField
              label="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="전화번호"
              inputMode="tel"
              value={phone}
              placeholder="010-0000-0000"
              onChange={(e) => setPhone(e.target.value)}
            />
          </>
        ) : (
          <FilterSelect
            variant="stacked"
            label="선생님"
            value={picked}
            disabled={!unissued.data}
            options={[
              { value: "", label: "선택" },
              ...(unissued.data ?? []).map((t) => ({
                value: t.id,
                label: `${t.name}${t.classes[0] ? ` (${classText(t.classes[0], gradeLabel)})` : ""} 뒷번호 ${t.phoneLast4}`,
              })),
            ]}
            onChange={setPicked}
          />
        )}
        <Notice tone="Info">
          {admin
            ? "전화번호는 비밀번호 찾기 때 본인 확인에 쓰여요"
            : "교사 정보에 등록됐고 계정이 없는 선생님만 고를 수 있어요"}
        </Notice>
        {unissued.isError && !admin && (
          <Notice tone="Danger">
            선생님 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
          </Notice>
        )}
        {error && <Notice tone="Danger">{error}</Notice>}
      </div>
      <DialogFooter>
        <CancelButton onClick={onClose} />
        <ConfirmButton disabled={!ready || busy} onClick={() => void submit()}>
          발급
        </ConfirmButton>
      </DialogFooter>
    </TeacherDialog>
  );
}
