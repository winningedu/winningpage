import { RefreshCw, Search, UserPlus } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import {
  ADMIN_MEMBER_STATUS_OPTIONS,
  ADMIN_PERMISSION_LEVEL_OPTIONS,
} from "@/pages/admin/configs/adminSettings";
import {
  AdminApiError,
  reportAdminError,
} from "@/pages/admin/shared/adminErrors";
import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import { toastSuccess, toastWarning } from "@/pages/admin/shared/adminToast";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { useAdminDetailBack } from "@/pages/admin/shared/useAdminDetailBack";

// ---------------------------------------------------------------------------
// 관리자 관리(adminMembers) — 직원 목록 · 상세 · 초대.
//
// 와이어프레임(Figma 4572:7064 / 4572:7133 / 4572:7162):
//   목록  번호 | 직원명 | 부서 | 이메일 | 전화번호 | 가입일 | 더보기
//   상세  탭 2개 — 「직원 정보」 / 「개별 권한 설정」
//
// 「개별 권한 설정」은 권한 묶음을 덮어쓰는 사람 단위 예외다. 클라이언트 요구
// ("이름별로 대표그룹을 설정하여 주고, 개별적으로 부분별 메뉴도 추가 혹은 제외를
// 선택할 수 있게")의 뒷부분이 정확히 이 화면이다.
//
// 합산 규칙이 화면에 드러나야 오해가 없다 — 그래서 상세 하단에 **최종 권한**을
// 함께 보여준다(fn_admin_effective_permissions). 묶음이 준 것과 개별로 더한 것을
// 각각 보여주면 "그래서 이 사람이 지금 뭘 볼 수 있는데?"에 답할 수 없다.
//
// 초대는 서버 라우트(api/admin/invite-member)를 부른다 — Supabase Auth 초대는
// service_role 전용이라 브라우저에서 못 한다.
// ---------------------------------------------------------------------------

interface DirectoryRow {
  profile_id: string;
  role_id?: string | null;
  department?: string | null;
  status: string;
  invited_at?: string | null;
  activated_at?: string | null;
  role_name?: string | null;
  role_is_super?: boolean | null;
  member_name?: string | null;
  member_email?: string | null;
  member_phone?: string | null;
  joined_at?: string | null;
}

interface RoleRow {
  id: string;
  name: string;
  is_super: boolean;
}

interface ResourceRow {
  key: string;
  group_title: string;
  label: string;
}

type LevelValue = "edit" | "view" | "none";

const LEVEL_CHOICES: { value: LevelValue | ""; label: string }[] = [
  ...ADMIN_PERMISSION_LEVEL_OPTIONS.map((option) =>
    typeof option === "object"
      ? { value: option.value as LevelValue, label: option.label }
      : { value: option as LevelValue, label: String(option) },
  ),
  { value: "", label: "미지정" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
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

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR");
}

interface AdminMembersAdminProps {
  config: { title: string; searchPlaceholder: string; [key: string]: unknown };
}

export default function AdminMembersAdmin({ config }: AdminMembersAdminProps) {
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");

  const [selected, setSelected] = useState<DirectoryRow | null>(null);
  const [tab, setTab] = useState<"info" | "perm">("info");
  const [roleDraft, setRoleDraft] = useState("");
  const [deptDraft, setDeptDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [overrides, setOverrides] = useState<Record<string, LevelValue>>({});
  const [effective, setEffective] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviteDept, setInviteDept] = useState("");
  const [inviting, setInviting] = useState(false);

  async function loadAll() {
    setLoading(true);

    const [dirRes, roleRes, resourceRes] = await Promise.all([
      supabase
        .from("admin_member_directory")
        .select("*")
        .order("invited_at", { ascending: false }),
      supabase.from("admin_roles").select("id, name, is_super").order("name"),
      supabase
        .from("admin_resources")
        .select("key, group_title, label")
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    setLoading(false);

    const error = dirRes.error || roleRes.error || resourceRes.error;
    if (error) {
      reportAdminError(`${config.title} 조회 실패`, error);
      return;
    }

    setRows((dirRes.data as DirectoryRow[]) || []);
    setRoles((roleRes.data as RoleRow[]) || []);
    setResources((resourceRes.data as ResourceRow[]) || []);
  }

  const onMountLoad = useEffectEvent(() => {
    loadAll();
  });

  useEffect(() => {
    onMountLoad();
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      `${row.member_name || ""} ${row.department || ""} ${row.member_email || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, ResourceRow[]>();
    for (const resource of resources) {
      const list = map.get(resource.group_title) || [];
      list.push(resource);
      map.set(resource.group_title, list);
    }
    return map;
  }, [resources]);

  async function openDetail(row: DirectoryRow) {
    setSelected(row);
    setTab("info");
    setRoleDraft(row.role_id || "");
    setDeptDraft(row.department || "");
    setStatusDraft(row.status);

    const [overrideRes, effectiveRes] = await Promise.all([
      supabase
        .from("admin_member_permissions")
        .select("resource_key, level")
        .eq("profile_id", row.profile_id),
      supabase.rpc("fn_admin_effective_permissions", {
        p_profile_id: row.profile_id,
      }),
    ]);

    const next: Record<string, LevelValue> = {};
    for (const item of overrideRes.data || []) {
      next[String(item.resource_key)] = item.level as LevelValue;
    }
    setOverrides(next);

    const eff: Record<string, string> = {};
    for (const item of effectiveRes.data || []) {
      eff[String(item.resource_key)] = String(item.level);
    }
    setEffective(eff);
  }

  // QA 317 — 상세에서 뒤로가기가 목록으로 돌아오게 한다(상세가 라우트가 아니라
  // state 여서, 그냥 두면 직전에 들른 다른 메뉴로 튄다).
  useAdminDetailBack(Boolean(selected), closeDetail);

  function closeDetail() {
    setSelected(null);
    setOverrides({});
    setEffective({});
  }

  async function saveInfo() {
    if (!selected || saving) return;
    setSaving(true);

    const { error } = await supabase
      .from("admin_members")
      .update({
        role_id: roleDraft || null,
        department: deptDraft.trim() || null,
        status: statusDraft,
      })
      .eq("profile_id", selected.profile_id);

    setSaving(false);

    if (error) {
      // WC059(마지막 최고 관리자 보호)가 여기로 올라온다. adminErrors 의 WC059 매핑이 한국어 안내로 바꾼다.
      reportAdminError("저장 실패", error);
      return;
    }

    await loadAll();
    toastSuccess("저장했습니다.");
  }

  async function savePermissions() {
    if (!selected || saving) return;
    setSaving(true);

    // 권한 묶음 편집과 같은 방식 — 지우고 다시 넣는다(최대 48행).
    const { error: deleteError } = await supabase
      .from("admin_member_permissions")
      .delete()
      .eq("profile_id", selected.profile_id);

    if (deleteError) {
      setSaving(false);
      reportAdminError("저장 실패", deleteError);
      return;
    }

    const inserts = Object.entries(overrides).map(([resource_key, level]) => ({
      profile_id: selected.profile_id,
      resource_key,
      level,
    }));

    if (inserts.length > 0) {
      const { error } = await supabase
        .from("admin_member_permissions")
        .insert(inserts);
      if (error) {
        setSaving(false);
        reportAdminError("저장 실패", error);
        return;
      }
    }

    setSaving(false);
    await openDetail(selected);
    toastSuccess("개별 권한을 저장했습니다.");
  }

  // confirmExisting — 기존 서비스 회원을 관리자로 올릴 때 서버가 한 번 되묻고,
  // 사용자가 확인하면 같은 요청을 이 플래그와 함께 다시 보낸다. 오타 하나로
  // 고객 계정이 관리자가 되는 걸 막는 지점이다(api/admin/invite-member 참고).
  async function postInvite(confirmExisting: boolean) {
    const accessToken = await getFreshSupabaseAccessTokenOrSignOut();

    const response = await fetch("/api/admin/invite-member", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        roleId: inviteRole,
        department: inviteDept.trim(),
        confirmExisting,
      }),
    });

    // 우리 JSON 이 아닌 본문(HTML 등)은 detail 없이 빈 객체로 둔다.
    const result = await response.json().catch(() => ({}));

    return { response, result };
  }

  async function sendInvite() {
    if (inviting) return;

    // 이름을 필수로 받는다 — 초대로 만든 계정은 profiles.name 이 비고, 그러면
    // 직원 목록의 「직원명」이 '-' 로 남는다. 헤더도 이름 유무로 로그인 상태를
    // 판정해서 그 사람에게는 헤더가 통째로 비로그인처럼 보인다(서버 라우트의 ⚠️ 참고).
    if (!inviteEmail.trim() || !inviteName.trim() || !inviteRole) {
      toastWarning("이름, 이메일, 권한 묶음을 모두 입력해 주세요.");
      return;
    }

    setInviting(true);

    try {
      let { response, result } = await postInvite(false);

      if (!response.ok && result?.needsConfirm) {
        const label = result.existingName
          ? `${result.existingName}(${result.existingMemberType})`
          : result.existingMemberType;
        if (
          !(await confirmAdmin({
            title:
              "이 계정은 관리자가 되면 전 회원 정보를 볼 수 있게 됩니다. 계속하시겠습니까?",
            description: `${result.detail}\n\n대상: ${label}`,
            confirmLabel: "계속",
            destructive: true,
          }))
        ) {
          return;
        }
        ({ response, result } = await postInvite(true));
      }

      if (!response.ok) {
        throw result?.detail
          ? new AdminApiError(result.detail)
          : new Error(`HTTP ${response.status}`);
      }

      // ⚠️ 메일이 나가는 건 신규 계정을 만든 경우뿐이다(서버가 emailed 로 알려준다).
      //   이미 가입돼 있던 계정을 관리자로 올릴 때는 Supabase 가 보내줄 수 있는
      //   메일 경로가 없어서 통지가 안 나간다 — 예전에는 이 경우에도 "초대 메일을
      //   보냈습니다"라고 띄웠는데, 실제로는 아무것도 안 갔다(api/admin/invite-member
      //   의 ⚠️ 주석). 등록은 됐으므로 실패가 아니라, 알리는 건 사람 몫이라고 말한다.
      // 안내 메일이 안 나가는 경우는 사람이 알려야 하므로 닫을 때까지 남긴다.
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
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteDept("");
      await loadAll();
    } catch (error) {
      reportAdminError("초대 실패", error as Error);
    } finally {
      setInviting(false);
    }
  }

  if (selected) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#111827]">
            {selected.member_name || selected.member_email || "관리자"} 상세
          </h1>
          <ActionButton variant="light" onClick={closeDetail}>
            목록으로
          </ActionButton>
        </div>

        <div className="mb-4 flex gap-2">
          {[
            { key: "info", label: "직원 정보" },
            { key: "perm", label: "개별 권한 설정" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key as "info" | "perm")}
              className={`h-9 border px-5 text-sm font-black transition ${
                tab === item.key
                  ? "border-primary bg-primary text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "info" ? (
          <>
            <div className="mb-4 bg-white shadow-sm">
              {[
                ["이름", selected.member_name || "-"],
                ["이메일", selected.member_email || "-"],
                ["전화번호", selected.member_phone || "-"],
                ["가입일", formatDate(selected.joined_at)],
                ["초대일", formatDate(selected.invited_at)],
                ["활성화일", formatDate(selected.activated_at)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4] last:border-b-0"
                >
                  <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
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
                      typeof option === "object"
                        ? option.value
                        : String(option);
                    const label =
                      typeof option === "object"
                        ? option.label
                        : String(option);
                    return (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    );
                  })}
                </Select>
              </Field>
              <ActionButton onClick={saveInfo} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </ActionButton>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-bold text-[#7A4A12]">
              개별 권한은 권한 묶음을 덮어씁니다. <b>접근 불가</b>는 묶음이 준
              권한까지 잠그고(차단이 항상 우선), <b>미지정</b>은 아무 말도 하지
              않는 것이라 묶음이 준 권한이 그대로 남습니다.
            </div>

            <div className="mb-4 flex justify-end">
              <ActionButton onClick={savePermissions} disabled={saving}>
                {saving ? "저장 중..." : "개별 권한 저장"}
              </ActionButton>
            </div>

            <div className="bg-white shadow-sm">
              <div className="grid grid-cols-[1fr_repeat(4,110px)_120px] border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-sm font-black">
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
                  <div className="border-b border-[#edf0f4] bg-[#f4f6f8] px-5 py-2 text-sm font-black">
                    {groupTitle}
                  </div>
                  {items.map((resource) => (
                    <div
                      key={resource.key}
                      className="grid grid-cols-[1fr_repeat(4,110px)_120px] items-center border-b border-[#edf0f4] px-5 py-2"
                    >
                      <div className="text-sm">{resource.label}</div>
                      {LEVEL_CHOICES.map((choice) => (
                        <div key={choice.value} className="text-center">
                          <input
                            type="radio"
                            name={`ov-${resource.key}`}
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
                      <div className="text-center text-xs font-bold text-gray-600">
                        {/* 최종 권한에 행이 없으면 접근 불가다(규칙 3: default deny) —
                            "권한 없음"이 아니라 "아무 항목도 받지 못했다"는 뜻이다. */}
                        {LEVEL_LABEL[effective[resource.key] ?? ""] ||
                          "접근 불가"}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={loadAll}
            className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
          >
            <RefreshCw size={14} />
            초기화
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={config.searchPlaceholder}
                className="h-9 w-[280px] border border-gray-400 px-3 text-sm outline-hidden"
              />
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 border border-l-0 border-gray-500 bg-white px-4 text-sm font-bold"
              >
                <Search size={14} />
                검색
              </button>
            </div>
            <ActionButton
              onClick={() => {
                setInviteRole(roles.find((r) => !r.is_super)?.id || "");
                setInviteOpen(true);
              }}
            >
              <UserPlus size={14} />
              관리자 초대
            </ActionButton>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
      </div>

      {inviteOpen && (
        <div className="mb-4 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-black">관리자 초대</h2>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="이름">
              <TextInput value={inviteName} onChange={setInviteName} />
            </Field>
            <Field label="이메일">
              <TextInput value={inviteEmail} onChange={setInviteEmail} />
            </Field>
            <Field label="권한 묶음">
              <Select value={inviteRole} onChange={setInviteRole}>
                <option value="">(선택)</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="부서">
              <TextInput value={inviteDept} onChange={setInviteDept} />
            </Field>
            <ActionButton onClick={sendInvite} disabled={inviting}>
              {inviting ? "보내는 중..." : "초대 메일 보내기"}
            </ActionButton>
            <ActionButton variant="light" onClick={() => setInviteOpen(false)}>
              취소
            </ActionButton>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <ScrollArea axis="x" className="bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[#edf0f4] bg-[#fafafa] text-left">
                <th className="w-16 px-4 py-3 font-black">번호</th>
                <th className="px-4 py-3 font-black">직원명</th>
                <th className="px-4 py-3 font-black">부서</th>
                <th className="px-4 py-3 font-black">이메일</th>
                <th className="px-4 py-3 font-black">권한 묶음</th>
                <th className="px-4 py-3 font-black">상태</th>
                <th className="px-4 py-3 font-black">가입일</th>
                <th className="w-24 px-4 py-3 font-black">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={row.profile_id} className="border-b border-[#edf0f4]">
                  <td className="px-4 py-3">{index + 1}</td>
                  <td className="px-4 py-3 font-bold">
                    {row.member_name || "-"}
                  </td>
                  <td className="px-4 py-3">{row.department || "-"}</td>
                  <td className="px-4 py-3">{row.member_email || "-"}</td>
                  <td className="px-4 py-3">
                    {row.role_name || "-"}
                    {row.role_is_super && (
                      <span className="ml-2 border border-primary px-2 py-0.5 text-xs font-bold text-primary">
                        최고
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {STATUS_LABEL[row.status] || row.status}
                  </td>
                  <td className="px-4 py-3">{formatDate(row.joined_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openDetail(row)}
                      className="border border-gray-400 px-3 py-1 text-xs font-bold"
                    >
                      더보기
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center font-bold text-gray-500"
                  >
                    등록된 관리자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}
