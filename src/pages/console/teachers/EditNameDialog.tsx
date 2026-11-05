// W14c 이름 수정. 이름만 고치고 아이디, 전화번호, 담당 학급은 그대로다(교 #117 10/30 답변).
// 담당 학급 변경과 추가는 W16 교사 계정 관리에서 한다.

import { useState } from "react";
import { consoleRequest, errorMessage } from "../api";
import Notice from "../Notice";
import TextField from "../TextField";
import TeacherDialog, {
  CancelButton,
  ConfirmButton,
  DialogFooter,
} from "./TeacherDialog";

const FAILED_MESSAGE = "이름을 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요";

interface EditNameDialogProps {
  teacher: { id: string; name: string };
  onSaved: () => void;
  onClose: () => void;
}

export default function EditNameDialog({
  teacher,
  onSaved,
  onClose,
}: EditNameDialogProps) {
  const [name, setName] = useState(teacher.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await consoleRequest("/api/console/teachers/name", {
      method: "PATCH",
      body: { teacherId: teacher.id, name: trimmed },
    });
    setBusy(false);
    if (res.status !== 200) {
      setError(errorMessage(res.body) ?? FAILED_MESSAGE);
      return;
    }
    onSaved();
  };

  return (
    <TeacherDialog title="이름 수정" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <TextField
          label="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Notice tone="Info">
          이름만 고칠 수 있어요. 아이디와 전화번호, 이미 등록된 학생의 학급은
          그대로예요
        </Notice>
        {error && <Notice tone="Danger">{error}</Notice>}
      </div>
      <DialogFooter>
        <CancelButton onClick={onClose} />
        <ConfirmButton
          disabled={trimmed === "" || trimmed === teacher.name || busy}
          onClick={() => void save()}
        >
          저장
        </ConfirmButton>
      </DialogFooter>
    </TeacherDialog>
  );
}
