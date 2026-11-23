import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { ADMIN_PERMISSION_LEVEL_OPTIONS } from "@/pages/admin/configs/adminSettings";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import { toastSuccess, toastWarning } from "@/pages/admin/shared/adminToast";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { useAdminDetailBack } from "@/pages/admin/shared/useAdminDetailBack";

// ---------------------------------------------------------------------------
// 관리자 권한 관리(adminRoles) — 권한 묶음 CRUD.
//
// 와이어프레임(Figma 4572:7229 / 4572:7246):
//   목록  번호 | 권한 묶음 이름 | 포함 메뉴 | 관리(수정·삭제) + 검색 + 등록하기
//   편집  권한 묶음 이름 + 메뉴 선택(대분류 | 소분류 | 세부메뉴 × 권한) + 저장·취소
//
// 「대분류 | 소분류 | 세부메뉴」 3단은 이 저장소에서 2단이다 — admin_resources 의
// group_title(대분류: 메인 관리·게시판 관리…)과 key(세부메뉴: popups·banners…)뿐이고,
// 중간 단계에 해당하는 개념이 없다. 3단을 만들려고 없는 계층을 지어내지 않는다
// (기획자가 참고한 화면의 메뉴 구성과 우리 어드민 구성이 다르다). 대신 대분류로
// 접었다 펴는 형태로 그려서 같은 조작감을 낸다.
//
// 접근 수준은 라디오 3종이다. "선택 안 함"은 별도 상태가 아니라 **행이 없는 것**이고,
// 그때 최종 권한은 접근 불가다(규칙 3: default deny). 그래서 UI 에서도 4번째 칸
// "미지정"을 두고, 그걸 고르면 해당 행을 지운다 — 'none'(명시적 차단)과 다르다.
// 둘의 차이는 개별 권한에서 드러난다: 'none' 은 묶음이 준 권한을 이기지만(deny-wins),
// '미지정'은 아무 말도 하지 않는 것이다.
// ---------------------------------------------------------------------------

interface RoleRow {
  id: string;
  name: string;
  description?: string | null;
  is_super: boolean;
  is_system: boolean;
}

interface ResourceRow {
  key: string;
  group_title: string;
  label: string;
  sort_order: number;
}

type LevelValue = "edit" | "view" | "none";
// 화면 상태 — 키가 없으면 '미지정'이다.
type PermissionDraft = Record<string, LevelValue>;

const LEVEL_CHOICES: { value: LevelValue | ""; label: string }[] = [
  ...ADMIN_PERMISSION_LEVEL_OPTIONS.map((option) =>
    typeof option === "object"
      ? { value: option.value as LevelValue, label: option.label }
      : { value: option as LevelValue, label: String(option) },
  ),
  { value: "", label: "미지정" },
];

interface AdminRolesAdminProps {
  config: { title: string; searchPlaceholder: string; [key: string]: unknown };
}

export default function AdminRolesAdmin({ config }: AdminRolesAdminProps) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [permsByRole, setPermsByRole] = useState<
    Record<string, PermissionDraft>
  >({});
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");

  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [permDraft, setPermDraft] = useState<PermissionDraft>({});
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);

    const [roleRes, resourceRes, permRes] = await Promise.all([
      supabase.from("admin_roles").select("*").order("created_at"),
      supabase
        .from("admin_resources")
        .select("key, group_title, label, sort_order")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("admin_role_permissions")
        .select("role_id, resource_key, level"),
    ]);

    setLoading(false);

    const error = roleRes.error || resourceRes.error || permRes.error;
    if (error) {
      reportAdminError(`${config.title} 조회 실패`, error);
      return;
    }

    setRoles((roleRes.data as RoleRow[]) || []);
    setResources((resourceRes.data as ResourceRow[]) || []);

    const grouped: Record<string, PermissionDraft> = {};
    for (const row of permRes.data || []) {
      const roleId = String(row.role_id);
      grouped[roleId] = grouped[roleId] || {};
      grouped[roleId][String(row.resource_key)] = row.level as LevelValue;
    }
    setPermsByRole(grouped);
  }

  const onMountLoad = useEffectEvent(() => {
    loadAll();
  });

  useEffect(() => {
    onMountLoad();
  }, []);

  // 대분류 → 메뉴. admin_resources 는 sort_order 로 이미 정렬돼 있어 삽입 순서가
  // 곧 표시 순서다(Map 은 삽입 순서를 보존한다).
  const grouped = useMemo(() => {
    const map = new Map<string, ResourceRow[]>();
    for (const resource of resources) {
      const list = map.get(resource.group_title) || [];
      list.push(resource);
      map.set(resource.group_title, list);
    }
    return map;
  }, [resources]);

  const filteredRoles = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((role) =>
      `${role.name} ${role.description || ""}`.toLowerCase().includes(q),
    );
  }, [roles, keyword]);

  function openCreate() {
    setEditing({
      id: "",
      name: "",
      description: "",
      is_super: false,
      is_system: false,
    });
    setNameDraft("");
    setDescDraft("");
    setPermDraft({});
  }

  function openEdit(role: RoleRow) {
    setEditing(role);
    setNameDraft(role.name);
    setDescDraft(role.description || "");
    setPermDraft({ ...(permsByRole[role.id] || {}) });
  }

  // QA 317 — 편집 화면에서 뒤로가기가 목록으로 돌아오게 한다.
  useAdminDetailBack(Boolean(editing), closeEdit);

  function closeEdit() {
    setEditing(null);
    setPermDraft({});
  }

  function setLevel(resourceKey: string, level: LevelValue | "") {
    setPermDraft((prev) => {
      const next = { ...prev };
      if (level === "") delete next[resourceKey];
      else next[resourceKey] = level;
      return next;
    });
  }

  // 대분류 한 줄을 한 번에 지정 — 메뉴가 48개라 하나씩 찍으면 실수하기 쉽다.
  function setGroupLevel(groupTitle: string, level: LevelValue | "") {
    const keys = (grouped.get(groupTitle) || []).map((r) => r.key);
    setPermDraft((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        if (level === "") delete next[key];
        else next[key] = level;
      }
      return next;
    });
  }

  async function save() {
    if (!editing || saving) return;

    const name = nameDraft.trim();
    if (!name) {
      toastWarning("권한 묶음 이름을 입력해 주세요.");
      return;
    }

    setSaving(true);

    let roleId = editing.id;

    if (roleId) {
      const { error } = await supabase
        .from("admin_roles")
        .update({ name, description: descDraft.trim() || null })
        .eq("id", roleId);
      if (error) {
        setSaving(false);
        reportAdminError("저장 실패", error);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("admin_roles")
        .insert({ name, description: descDraft.trim() || null })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        // 오류 없이 행이 안 돌아온 경우는 일반 문구 대신 구체적인 문장을 제목으로 쓴다.
        reportAdminError(
          error ? "저장 실패" : "권한 묶음을 만들지 못했습니다.",
          error,
        );
        return;
      }
      roleId = data.id as string;
    }

    // 권한 항목은 "지우고 다시 넣는다". 부분 갱신(upsert + 삭제 목록 계산)보다
    // 단순하고, 화면에 보이는 상태가 곧 저장 결과라는 보장이 명확하다. 행이
    // 최대 48개라 성능 문제가 없다.
    const { error: deleteError } = await supabase
      .from("admin_role_permissions")
      .delete()
      .eq("role_id", roleId);

    if (deleteError) {
      setSaving(false);
      reportAdminError("권한 항목 저장 실패", deleteError);
      return;
    }

    const rows = Object.entries(permDraft).map(([resource_key, level]) => ({
      role_id: roleId,
      resource_key,
      level,
    }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("admin_role_permissions")
        .insert(rows);
      if (insertError) {
        setSaving(false);
        reportAdminError("권한 항목 저장 실패", insertError);
        return;
      }
    }

    setSaving(false);
    closeEdit();
    await loadAll();
    toastSuccess("저장했습니다.");
  }

  async function removeRole(role: RoleRow) {
    if (role.is_system) {
      toastWarning(
        "기본 권한 묶음은 삭제할 수 없습니다.",
        "이 묶음을 지우면 되돌릴 수단이 없습니다.",
      );
      return;
    }
    if (
      !(await confirmAdmin({
        title: `'${role.name}' 묶음을 삭제합니다.`,
        description:
          "이 묶음을 쓰던 관리자는 권한이 사라져 아무 메뉴도 보이지 않게 됩니다. 계속하시겠습니까?",
        confirmLabel: "삭제",
        destructive: true,
      }))
    ) {
      return;
    }

    const { error } = await supabase
      .from("admin_roles")
      .delete()
      .eq("id", role.id);

    if (error) {
      reportAdminError("삭제 실패", error);
      return;
    }
    await loadAll();
  }

  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">
            {editing.id ? "권한 묶음 수정" : "권한 묶음 등록"}
          </h1>
          <div className="flex gap-2">
            <ActionButton variant="light" onClick={closeEdit}>
              취소
            </ActionButton>
            <ActionButton onClick={save} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </ActionButton>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 bg-white p-6 shadow-sm">
          <Field label="권한 묶음 이름">
            <TextInput value={nameDraft} onChange={setNameDraft} />
          </Field>
          <Field label="설명">
            <TextInput value={descDraft} onChange={setDescDraft} />
          </Field>
        </div>

        {editing.is_super && (
          <div className="mb-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-medium text-[#7A4A12]">
            최고 관리자 묶음은 권한 항목을 갖지 않습니다 — 판정이 전 메뉴 수정
            가능으로 단락되기 때문입니다. 새 메뉴가 생겨도 자동으로 포함되므로
            아래에서 무엇을 고르든 저장돼도 판정에 쓰이지 않습니다.
          </div>
        )}

        <div className="bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_repeat(4,110px)] border-b bg-muted px-5 py-3 text-sm font-semibold">
            <div>메뉴</div>
            {LEVEL_CHOICES.map((choice) => (
              <div key={choice.value} className="text-center">
                {choice.label}
              </div>
            ))}
          </div>

          {[...grouped.entries()].map(([groupTitle, items]) => (
            <div key={groupTitle}>
              <div className="grid grid-cols-[1fr_repeat(4,110px)] items-center border-b bg-muted/50 px-5 py-2">
                <div className="text-sm font-semibold">{groupTitle}</div>
                {LEVEL_CHOICES.map((choice) => (
                  <div key={choice.value} className="text-center">
                    <button
                      type="button"
                      onClick={() => setGroupLevel(groupTitle, choice.value)}
                      aria-label={`${groupTitle} ${choice.label} 일괄`}
                      className="text-xs font-medium text-primary underline"
                    >
                      일괄
                    </button>
                  </div>
                ))}
              </div>

              {items.map((resource) => (
                <div
                  key={resource.key}
                  className="grid grid-cols-[1fr_repeat(4,110px)] items-center border-b px-5 py-2 last:border-b-0"
                >
                  <div className="text-sm">
                    {resource.label}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {resource.key}
                    </span>
                  </div>
                  {LEVEL_CHOICES.map((choice) => (
                    <div key={choice.value} className="text-center">
                      <input
                        type="radio"
                        name={`level-${resource.key}`}
                        aria-label={`${resource.label} ${choice.label}`}
                        className="accent-primary"
                        checked={
                          (permDraft[resource.key] ?? "") === choice.value
                        }
                        onChange={() => setLevel(resource.key, choice.value)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <Button type="button" variant="outline" size="lg" onClick={loadAll}>
            <RefreshCw size={14} aria-hidden="true" />
            초기화
          </Button>

          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={config.searchPlaceholder}
                aria-label="권한 묶음 검색"
                className="h-9 w-70 font-medium"
              />
            </div>
            <ActionButton onClick={openCreate}>
              <Plus size={14} aria-hidden="true" />
              등록하기
            </ActionButton>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-semibold">{config.title}</h1>
      </div>

      {loading ? (
        <div
          role="status"
          className="bg-white p-12 text-center text-sm font-medium text-muted-foreground shadow-sm"
        >
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="bg-white shadow-sm">
          <Table className="min-w-205">
            <TableHeader>
              <TableRow className="bg-muted hover:bg-transparent">
                <TableHead
                  scope="col"
                  className="w-16 px-4 py-3 font-semibold whitespace-normal"
                >
                  번호
                </TableHead>
                <TableHead
                  scope="col"
                  className="px-4 py-3 font-semibold whitespace-normal"
                >
                  권한 묶음 이름
                </TableHead>
                <TableHead
                  scope="col"
                  className="px-4 py-3 font-semibold whitespace-normal"
                >
                  포함 메뉴
                </TableHead>
                <TableHead
                  scope="col"
                  className="w-32 px-4 py-3 font-semibold whitespace-normal"
                >
                  관리
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.map((role, index) => {
                const perms = permsByRole[role.id] || {};
                const keys = Object.keys(perms);
                const names = keys
                  .map(
                    (key) => resources.find((r) => r.key === key)?.label || key,
                  )
                  .slice(0, 2);

                return (
                  <TableRow key={role.id}>
                    <TableCell className="px-4 py-3">{index + 1}</TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal">
                      {role.name}
                      {role.is_super && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-primary text-primary"
                        >
                          최고 관리자
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal text-muted-foreground">
                      {role.is_super
                        ? "전체 메뉴 (자동 포함)"
                        : keys.length === 0
                          ? "없음"
                          : `${names.join(", ")}${keys.length > names.length ? ` 외 ${keys.length - names.length}개` : ""}`}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(role)}
                        >
                          수정
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeRole(role)}
                          disabled={role.is_system}
                          aria-label={
                            role.is_system
                              ? "기본 묶음은 삭제할 수 없습니다"
                              : "삭제"
                          }
                          title={
                            role.is_system
                              ? "기본 묶음은 삭제할 수 없습니다"
                              : "삭제"
                          }
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredRoles.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={4}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    권한 묶음이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
