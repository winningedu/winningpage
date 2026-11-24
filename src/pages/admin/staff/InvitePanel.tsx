import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { ApiError } from "@/lib/http/client";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import { toastSuccess, toastWarning } from "@/pages/admin/shared/adminToast";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  type InviteResult,
  postInvite,
  type RoleOption,
  staffKeys,
} from "./api";

// 서버가 기존 서비스 회원을 되물을 때 problem 확장 멤버로 보내는 값.
const existingMemberSchema = z.object({
  existingMemberType: z.string(),
  existingName: z.string().nullish(),
});

function existingMemberOf(error: unknown) {
  if (
    !(error instanceof ApiError) ||
    error.status !== 409 ||
    error.code !== "NEEDS_CONFIRM"
  )
    return null;
  const parsed = existingMemberSchema.safeParse(error.problem);
  return parsed.success ? { ...parsed.data, detail: error.detail } : null;
}

interface InvitePanelProps {
  roles: RoleOption[];
  onClose: () => void;
}

// 초대는 서버 라우트(api/admin/invite-member)를 부른다. Supabase Auth 초대는
// service_role 전용이라 브라우저에서 못 한다.
export function InvitePanel({ roles, onClose }: InvitePanelProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(
    roles.find((role) => !role.is_super)?.id || "",
  );
  const [department, setDepartment] = useState("");

  // confirmExisting: 기존 서비스 회원을 관리자로 올릴 때 서버가 한 번 되묻고, 사용자가
  // 확인하면 같은 요청을 이 플래그와 함께 다시 보낸다. 오타 하나로 고객 계정이
  // 관리자가 되는 걸 막는 지점이다(api/admin/invite-member 참고).
  const invite = useMutation({
    mutationFn: async (): Promise<InviteResult | null> => {
      const dept = department.trim();
      const body = {
        email: email.trim(),
        name: name.trim(),
        roleId,
        ...(dept ? { department: dept } : {}),
      };
      try {
        return await postInvite({ ...body, confirmExisting: false });
      } catch (error) {
        const existing = existingMemberOf(error);
        if (!existing) throw error;
        const label = existing.existingName
          ? `${existing.existingName}(${existing.existingMemberType})`
          : existing.existingMemberType;
        if (
          !(await confirmAdmin({
            title:
              "이 계정은 관리자가 되면 전 회원 정보를 볼 수 있게 됩니다. 계속하시겠습니까?",
            description: `${existing.detail}\n\n대상: ${label}`,
            confirmLabel: "계속",
            destructive: true,
          }))
        )
          return null;
        return await postInvite({ ...body, confirmExisting: true });
      }
    },
    onSuccess: async (result) => {
      if (!result) return;
      // 메일이 나가는 건 신규 계정을 만든 경우뿐이다(서버가 emailed 로 알려준다).
      // 이미 가입돼 있던 계정을 관리자로 올릴 때는 Supabase 가 보내줄 수 있는
      // 메일 경로가 없어 통지가 안 나간다. 등록은 됐으므로 실패가 아니라,
      // 알리는 건 사람 몫이라고 말한다. 안내 메일이 안 나가는 경우는 닫을 때까지 남긴다.
      if (result.emailed) {
        toastSuccess(
          "초대 메일을 보냈습니다.",
          "받은 사람이 링크를 눌러 비밀번호를 설정하면 활성화됩니다.",
        );
      } else {
        toastWarning(
          "관리자로 등록했습니다.",
          "이미 비밀번호가 있는 계정이라 안내 메일은 나가지 않습니다. 등록 사실을 직접 알려주세요.",
        );
      }
      onClose();
      await queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
    onError: (error) => reportAdminError("초대 실패", error),
  });

  function send() {
    if (invite.isPending) return;

    // 이름을 필수로 받는다. 초대로 만든 계정은 profiles.name 이 비고, 그러면
    // 직원 목록의 「직원명」이 '-' 로 남는다. 헤더도 이름 유무로 로그인 상태를
    // 판정해서 그 사람에게는 헤더가 통째로 비로그인처럼 보인다(서버 라우트 참고).
    if (!email.trim() || !name.trim() || !roleId) {
      toastWarning("이름, 이메일, 권한 묶음을 모두 입력해 주세요.");
      return;
    }
    invite.mutate();
  }

  return (
    <div className="mb-4 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">관리자 초대</h2>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="이름">
          <TextInput value={name} onChange={setName} />
        </Field>
        <Field label="이메일">
          <TextInput value={email} onChange={setEmail} />
        </Field>
        <Field label="권한 묶음">
          <Select value={roleId} onChange={setRoleId}>
            <option value="">(선택)</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="부서">
          <TextInput value={department} onChange={setDepartment} />
        </Field>
        <ActionButton onClick={send} disabled={invite.isPending}>
          {invite.isPending ? "보내는 중..." : "초대 메일 보내기"}
        </ActionButton>
        <ActionButton variant="light" onClick={onClose}>
          취소
        </ActionButton>
      </div>
    </div>
  );
}
