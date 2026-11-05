// W14b 개별 등록. 이름과 전화번호는 필수, 학년그룹과 반은 선택이고 여러 줄을 더할 수 있다(교 #115, #219).
// 같은 이름과 전화번호면 새 아이디 없이 반만 더하고(same-person), 이름만 같으면 다른 선생님이다(same-name).
// 전화번호만 같거나 이미 담임이 있는 학급은 서버가 거절하고 그 문구를 창에 보인다(error).

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { consoleRequest, errorMessage } from "../api";
import { gradeLabel } from "../classLabel";
import Notice from "../Notice";
import TextField from "../TextField";
import ClassRowFields, {
  type ClassInput,
  EMPTY_CLASS,
  toClassBody,
  useGroups,
} from "./ClassRowFields";
import IssuedPanel from "./IssuedPanel";
import type { IssuedRow } from "./issuedFile";
import type { TeacherSummary } from "./roster";
import TeacherDialog, {
  CancelButton,
  ConfirmButton,
  DialogFooter,
} from "./TeacherDialog";

const FAILED_MESSAGE = "선생님을 등록하지 못했어요. 잠시 뒤 다시 시도해 주세요";
const CLASS_INCOMPLETE_MESSAGE = "학년그룹과 반을 함께 입력해 주세요";

interface RegisterResponse {
  loginId: string;
  verdict: string;
  tempPassword?: string;
}

interface RegisterDialogProps {
  /** 같은 이름 안내를 위한 이미 등록된 선생님들. */
  existing: TeacherSummary[];
  onDone: () => void;
  onClose: () => void;
}

const withBan = (name: string) => (name.endsWith("반") ? name : `${name}반`);

export default function RegisterDialog({
  existing,
  onDone,
  onClose,
}: RegisterDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const nextId = useRef(1);
  const [rows, setRows] = useState<{ id: number; value: ClassInput }[]>([
    { id: 0, value: EMPTY_CLASS },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedRow[] | null>(null);
  const [added, setAdded] = useState(false);
  const groups = useGroups();

  const sameName = existing.some(
    (t) => t.name === name.trim() && name.trim() !== "",
  );

  const submit = async () => {
    const classes = toClassBody(rows.map((r) => r.value));
    if (!classes) {
      setError(CLASS_INCOMPLETE_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await consoleRequest("/api/console/teachers/register", {
      method: "POST",
      body: { name: name.trim(), phone: phone.trim(), classes },
    });
    setBusy(false);
    const body = res.body as RegisterResponse | null;
    if (res.status !== 200 || !body) {
      setError(errorMessage(res.body) ?? FAILED_MESSAGE);
      return;
    }
    onDone();
    if (!body.tempPassword) {
      setAdded(true);
      return;
    }
    setIssued([
      {
        name: name.trim(),
        phoneLast4: phone.replace(/\D/g, "").slice(-4),
        grade: classes.map((c) => gradeLabel(c.grade)).join(", "),
        className: classes.map((c) => withBan(c.name)).join(", "),
        loginId: body.loginId,
        tempPassword: body.tempPassword,
      },
    ]);
  };

  if (issued) {
    return (
      <TeacherDialog title="계정을 만들었어요" onClose={onClose}>
        <IssuedPanel rows={issued} onClose={onClose} />
      </TeacherDialog>
    );
  }
  if (added) {
    return (
      <TeacherDialog title="학급을 더했어요" onClose={onClose}>
        <Notice tone="Info">
          이미 등록된 선생님이라 새 아이디를 만들지 않고 그 아이디에 반만
          더했어요
        </Notice>
        <DialogFooter>
          <CancelButton onClick={onClose}>닫기</CancelButton>
        </DialogFooter>
      </TeacherDialog>
    );
  }

  return (
    <TeacherDialog title="개별 등록" onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
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
        </div>
        {sameName && (
          <Notice tone="Info">
            이름이 같은 선생님이 이미 있어요. 전화번호도 같으면 그 아이디에 반만
            더하고, 다르면 이름이 같은 다른 선생님으로 새 아이디를 만들어요
          </Notice>
        )}
        {rows.map((row) => (
          <ClassRowFields
            key={row.id}
            value={row.value}
            groups={groups.data ?? []}
            onChange={(next) =>
              setRows((prev) =>
                prev.map((r) => (r.id === row.id ? { ...r, value: next } : r)),
              )
            }
          />
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { id: nextId.current++, value: EMPTY_CLASS },
              ])
            }
            className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
          >
            학년그룹-반 추가
          </Button>
        </div>
        <Notice tone="Info">
          학년그룹과 반은 선택이에요. 담임을 맡지 않으면 비워 두고 나중에 계정
          관리에서 배정해요
        </Notice>
        {error && <Notice tone="Danger">{error}</Notice>}
      </div>
      <DialogFooter>
        <CancelButton onClick={onClose} />
        <ConfirmButton
          disabled={name.trim() === "" || phone.trim() === "" || busy}
          onClick={() => void submit()}
        >
          등록
        </ConfirmButton>
      </DialogFooter>
    </TeacherDialog>
  );
}
