import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/http/client";
import {
  ADMIN_MEMBER_STATUS_OPTIONS,
  ADMIN_PERMISSION_LEVEL_OPTIONS,
} from "@/pages/admin/configs/adminSettings";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import { toastSuccess } from "@/pages/admin/shared/adminToast";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { useUnsavedGuard } from "@/pages/admin/shared/useUnsavedGuard";
import {
  type DirectoryRow,
  fetchStaffDetail,
  fetchStaffList,
  type Level,
  type PermissionItem,
  patchStaff,
  putStaffPermissions,
  type Resource,
  type RoleOption,
  staffKeys,
} from "./api";
import { LEVEL_CHOICES, type LevelDraft, sameDraft, toDraft } from "./levels";

export const MEMBERS_PATH = "/admin/adminMembers";

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  ADMIN_MEMBER_STATUS_OPTIONS.map((option) =>
    typeof option === "object"
      ? [option.value, option.label]
      : [String(option), String(option)],
  ),
);

const LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  ADMIN_PERMISSION_LEVEL_OPTIONS.map((option) =>
    typeof option === "object"
      ? [option.value, option.label]
      : [String(option), String(option)],
  ),
);

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR");
}

type Tab = "info" | "perm";
interface Props {
  config: { title: string };
}

// 주소의 :profileId 로 상세와 선택지를 불러온다(새로고침해도 같은 화면이 열린다).
export function MemberDetailRoute({ config }: Props) {
  const { profileId = "", tab } = useParams();
  const detail = useQuery({
    queryKey: staffKeys.detail(profileId),
    queryFn: ({ signal }) => fetchStaffDetail(profileId, signal),
  });
  // 권한 묶음과 메뉴 목록은 목록과 같은 응답이다.
  const options = useQuery({
    queryKey: staffKeys.list,
    queryFn: ({ signal }) => fetchStaffList(signal),
  });

  const error = detail.error ?? options.error;
  const notFound = error instanceof ApiError && error.status === 404;

  useEffect(() => {
    if (error && !notFound)
      reportAdminError(`${config.title} 조회 실패`, error);
  }, [error, notFound, config.title]);

  if (tab && tab !== "perm") {
    return <Navigate to={`${MEMBERS_PATH}/${profileId}`} replace />;
  }

  if (!error && (detail.isPending || options.isPending)) {
    return (
      <div
        role="status"
        className="bg-white p-12 text-center text-sm font-medium text-muted-foreground shadow-sm"
      >
        데이터를 불러오는 중입니다.
      </div>
    );
  }

  if (!detail.data || !options.data) {
    return (
      <div className="bg-white p-12 text-center text-sm font-medium text-muted-foreground shadow-sm">
        <p>
          {notFound
            ? "관리자를 찾을 수 없습니다."
            : "관리자 정보를 불러오지 못했습니다."}
        </p>
        <Link
          to={MEMBERS_PATH}
          className="mt-4 inline-block font-semibold text-foreground underline"
        >
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <MemberDetail
      key={detail.data.member.profile_id}
      member={detail.data.member}
      overrides={detail.data.overrides}
      effective={detail.data.effective}
      roles={options.data.roles}
      resources={options.data.resources}
      tab={tab === "perm" ? "perm" : "info"}
    />
  );
}

interface DetailProps {
  member: DirectoryRow;
  overrides: PermissionItem[];
  effective: PermissionItem[];
  roles: RoleOption[];
  resources: Resource[];
  tab: Tab;
}

function MemberDetail({
  member,
  overrides: loadedOverrides,
  effective: loadedEffective,
  roles,
  resources,
  tab,
}: DetailProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [roleDraft, setRoleDraft] = useState(member.role_id || "");
  const [deptDraft, setDeptDraft] = useState(member.department || "");
  const [statusDraft, setStatusDraft] = useState(member.status);
  const [overrides, setOverrides] = useState<LevelDraft>(() =>
    toDraft(loadedOverrides),
  );
  const effective = useMemo(() => toDraft(loadedEffective), [loadedEffective]);

  const grouped = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const resource of resources) {
      const list = map.get(resource.group_title) || [];
      list.push(resource);
      map.set(resource.group_title, list);
    }
    return map;
  }, [resources]);

  const base = `${MEMBERS_PATH}/${member.profile_id}`;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: staffKeys.all });

  const saveInfo = useMutation({
    mutationFn: () =>
      patchStaff(member.profile_id, {
        roleId: roleDraft || null,
        department: deptDraft.trim() || null,
        status: statusDraft,
      }),
    onSuccess: async () => {
      await refresh();
      toastSuccess("저장했습니다.");
    },
    // 마지막 최고 관리자 보호(LAST_SUPER_ADMIN)도 서버가 쓴 안내가 그대로 올라온다.
    onError: (error) => reportAdminError("저장 실패", error),
  });

  // 지우고 다시 넣는 일은 서버가 한 요청으로 처리한다(최대 48행).
  const savePermissions = useMutation({
    mutationFn: () =>
      putStaffPermissions(
        member.profile_id,
        Object.entries(overrides).map(([resourceKey, level]) => ({
          resourceKey,
          level,
        })),
      ),
    onSuccess: async () => {
      await refresh();
      toastSuccess("개별 권한을 저장했습니다.");
    },
    onError: (error) => reportAdminError("저장 실패", error),
  });

  // 고친 폼이 있으면 이 관리자 화면을 나갈 때 묻는다. 같은 관리자의 탭 이동은 막지 않는다.
  const dirty =
    roleDraft !== (member.role_id ?? "") ||
    deptDraft.trim() !== (member.department ?? "") ||
    statusDraft !== member.status ||
    !sameDraft(overrides, toDraft(loadedOverrides));
  useUnsavedGuard(
    dirty,
    (next) => next.pathname === base || next.pathname.startsWith(`${base}/`),
  );

  const saving = saveInfo.isPending || savePermissions.isPending;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          {member.member_name || member.member_email || "관리자"} 상세
        </h1>
        <ActionButton variant="light" onClick={() => navigate(MEMBERS_PATH)}>
          목록으로
        </ActionButton>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate(value === "perm" ? `${base}/perm` : base)
        }
      >
        <TabsList variant="line" className="mb-2">
          <TabsTrigger value="info" className="px-4">
            직원 정보
          </TabsTrigger>
          <TabsTrigger value="perm" className="px-4">
            개별 권한 설정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="mb-4 bg-white shadow-sm">
            {[
              ["이름", member.member_name || "-"],
              ["이메일", member.member_email || "-"],
              ["전화번호", member.member_phone || "-"],
              ["가입일", formatDate(member.joined_at)],
              ["초대일", formatDate(member.invited_at)],
              ["활성화일", formatDate(member.activated_at)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[13.75rem_1fr] border-b last:border-b-0"
              >
                <div className="bg-muted px-5 py-3 text-sm font-semibold">
                  {label}
                </div>
                <div className="px-5 py-3 text-sm">{value}</div>
              </div>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3 bg-white p-6 shadow-sm">
            <Field label="권한 묶음">
              <Select value={roleDraft} onChange={setRoleDraft}>
                <option value="">(없음)</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="부서">
              <TextInput value={deptDraft} onChange={setDeptDraft} />
            </Field>
            <Field label="상태">
              <Select value={statusDraft} onChange={setStatusDraft}>
                {ADMIN_MEMBER_STATUS_OPTIONS.map((option) => {
                  const value =
                    typeof option === "object" ? option.value : String(option);
                  const label =
                    typeof option === "object" ? option.label : String(option);
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </Select>
            </Field>
            <ActionButton onClick={() => saveInfo.mutate()} disabled={saving}>
              {saveInfo.isPending ? "저장 중..." : "저장"}
            </ActionButton>
          </div>
        </TabsContent>

        <TabsContent value="perm">
          <div className="mb-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-medium text-[#7A4A12]">
            개별 권한은 권한 묶음을 덮어씁니다. <b>접근 불가</b>는 묶음이 준
            권한까지 잠그고(차단이 항상 우선), <b>미지정</b>은 아무 말도 하지
            않는 것이라 묶음이 준 권한이 그대로 남습니다.
          </div>

          <div className="mb-4 flex justify-end">
            <ActionButton
              onClick={() => savePermissions.mutate()}
              disabled={saving}
            >
              {savePermissions.isPending ? "저장 중..." : "개별 권한 저장"}
            </ActionButton>
          </div>

          <div className="bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_repeat(4,6.875rem)_7.5rem] border-b bg-muted px-5 py-3 text-sm font-semibold">
              <div>메뉴</div>
              {LEVEL_CHOICES.map((choice) => (
                <div key={choice.value} className="text-center">
                  {choice.label}
                </div>
              ))}
              <div className="text-center">최종 권한</div>
            </div>

            {[...grouped.entries()].map(([groupTitle, items]) => (
              <div key={groupTitle}>
                <div className="border-b bg-muted/50 px-5 py-2 text-sm font-semibold">
                  {groupTitle}
                </div>
                {items.map((resource) => (
                  <div
                    key={resource.key}
                    className="grid grid-cols-[1fr_repeat(4,6.875rem)_7.5rem] items-center border-b px-5 py-2"
                  >
                    <div className="text-sm">{resource.label}</div>
                    {LEVEL_CHOICES.map((choice) => (
                      <div key={choice.value} className="text-center">
                        <input
                          type="radio"
                          name={`ov-${resource.key}`}
                          aria-label={`${resource.label} ${choice.label}`}
                          className="accent-primary"
                          checked={
                            (overrides[resource.key] ?? "") === choice.value
                          }
                          onChange={() =>
                            setOverrides((prev) => {
                              const next = { ...prev };
                              if (choice.value === "")
                                delete next[resource.key];
                              else next[resource.key] = choice.value;
                              return next;
                            })
                          }
                        />
                      </div>
                    ))}
                    <div className="text-center text-xs font-medium text-muted-foreground">
                      {/* 최종 권한에 행이 없으면 접근 불가다(규칙 3: default deny).
                          "권한 없음"이 아니라 "아무 항목도 받지 못했다"는 뜻이다. */}
                      {LEVEL_LABEL[effective[resource.key] ?? ""] ||
                        "접근 불가"}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
