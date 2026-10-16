import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { CARD, CARD_HINT, CARD_TITLE } from "./cardStyles";
import ProfileForm from "./ProfileForm";
import { saveStudentProfile } from "./profileApi";
import {
  needsProfileForm,
  type ProfileSavePayload,
  type ProfileValues,
  schoolTypeLabel,
} from "./startLogic";

type Row = { label: string; value: string };

function buildRows(values: ProfileValues): Row[] {
  const gradeSemester = values.grade
    ? values.semester !== null && values.grade.startsWith("고")
      ? `${values.grade} ${values.semester}학기`
      : values.grade
    : null;
  const rows: (Row | null)[] = [
    values.schoolType
      ? { label: "학교 유형", value: schoolTypeLabel(values.schoolType) }
      : null,
    values.admissionYear !== null
      ? {
          label: "고등학교 입학 연도",
          value: `${values.admissionYear}학년도`,
        }
      : null,
    gradeSemester ? { label: "학년과 학기", value: gradeSemester } : null,
    values.career ? { label: "희망 진로", value: values.career } : null,
    values.department ? { label: "희망 학과", value: values.department } : null,
    values.universities.length > 0
      ? { label: "희망 대학", value: values.universities.join(", ") }
      : null,
  ];
  return rows.filter((r): r is Row => r !== null);
}

type ProfileCardProps = {
  values: ProfileValues;
  usedInitial: boolean;
  /** 저장 뒤 부트스트랩을 다시 읽는다. */
  onSaved: () => Promise<void>;
};

export default function ProfileCard({
  values,
  usedInitial,
  onSaved,
}: ProfileCardProps) {
  const { userId } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // 필수 칸이 비어 있으면 요약 없이 처음부터 폼이다(되돌아갈 요약이 없어 취소도 없다).
  const forced = needsProfileForm(values);

  async function save(payload: ProfileSavePayload) {
    if (!userId) return;
    setSaving(true);
    const result = await saveStudentProfile(userId, payload);
    setSaving(false);
    if (!result.ok) {
      toast.error("학생 정보를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      return;
    }
    await onSaved();
    setEditing(false);
    toast.success("학생 정보를 저장했어요.");
  }

  if (forced || editing) {
    return (
      <section className={CARD}>
        <h2 className={CARD_TITLE}>
          {forced ? "학교 정보 입력" : "학생 정보"}
        </h2>
        <p className={CARD_HINT}>
          {forced
            ? "처음 한 번만 적으면 다른 위닝 서비스에서도 함께 써요."
            : "고친 값은 다른 위닝 서비스에서도 함께 써요."}
        </p>
        <ProfileForm
          values={values}
          saving={saving}
          onSubmit={(p) => void save(p)}
          {...(forced ? {} : { onCancel: () => setEditing(false) })}
        />
      </section>
    );
  }

  const rows = buildRows(values);
  return (
    <section className={CARD}>
      <h2 className={CARD_TITLE}>학생 정보</h2>
      {usedInitial && (
        <p className={CARD_HINT}>
          목표관리에서 가져온 값이에요. 고칠 수 있어요.
        </p>
      )}
      <dl className="mt-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 border-b border-line/40 py-2.5 text-app-label last:border-b-0"
          >
            <dt className="text-ink-sub">{row.label}</dt>
            <dd className="text-right font-semibold text-ink-strong">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="mt-3 h-8 px-3 text-app-label"
        onClick={() => setEditing(true)}
      >
        정보 수정
      </Button>
    </section>
  );
}
