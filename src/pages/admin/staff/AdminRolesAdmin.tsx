import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router";
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
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import { toastWarning } from "@/pages/admin/shared/adminToast";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";
import { ActionButton } from "@/pages/admin/shared/formFields";
import { useKeywordParam } from "@/pages/admin/shared/useKeywordParam";
import {
  deleteRole,
  fetchRoles,
  type RoleWithPermissions,
  roleKeys,
} from "./api";
import { RoleEditorRoute } from "./RoleEditor";

// ---------------------------------------------------------------------------
// 관리자 권한 관리(adminRoles): 권한 묶음 CRUD.
//
// 와이어프레임(Figma 4572:7229 / 4572:7246):
//   목록  번호 | 권한 묶음 이름 | 포함 메뉴 | 관리(수정, 삭제) + 검색 + 등록하기
//   편집  권한 묶음 이름 + 메뉴 선택(대분류 | 소분류 | 세부메뉴 x 권한) + 저장, 취소
//
// 목록, 등록(new), 편집(:roleId)은 각각 /admin/adminRoles 아래 주소를 가진다
// (새로고침과 뒤로가기가 그대로 동작). 편집 화면은 RoleEditor.tsx 에 있다.
// ---------------------------------------------------------------------------

export const ROLES_PATH = "/admin/adminRoles";

interface AdminRolesAdminProps {
  config: { title: string; searchPlaceholder: string; [key: string]: unknown };
}

export default function AdminRolesAdmin({ config }: AdminRolesAdminProps) {
  return (
    <Routes>
      <Route index element={<RoleList config={config} />} />
      <Route path="new" element={<RoleEditorRoute config={config} />} />
      <Route path=":roleId" element={<RoleEditorRoute config={config} />} />
      <Route path="*" element={<Navigate to={ROLES_PATH} replace />} />
    </Routes>
  );
}

function RoleList({ config }: AdminRolesAdminProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useKeywordParam();

  const list = useQuery({
    queryKey: roleKeys.list,
    queryFn: ({ signal }) => fetchRoles(signal),
  });
  const roles = list.data?.items ?? [];
  const resources = list.data?.resources ?? [];

  useEffect(() => {
    if (list.error) reportAdminError(`${config.title} 조회 실패`, list.error);
  }, [list.error, config.title]);

  const filteredRoles = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((role) =>
      `${role.name} ${role.description || ""}`.toLowerCase().includes(q),
    );
  }, [roles, keyword]);

  const remove = useMutation({
    mutationFn: (role: RoleWithPermissions) => deleteRole(role.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleKeys.all }),
    onError: (error) => reportAdminError("삭제 실패", error),
  });

  async function removeRole(role: RoleWithPermissions) {
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
    remove.mutate(role);
  }

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => list.refetch()}
          >
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
            <ActionButton onClick={() => navigate(`${ROLES_PATH}/new`)}>
              <Plus size={14} aria-hidden="true" />
              등록하기
            </ActionButton>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-semibold">{config.title}</h1>
      </div>

      {list.isPending ? (
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
                {[
                  ["번호", "w-16"],
                  ["권한 묶음 이름", ""],
                  ["포함 메뉴", ""],
                  ["관리", "w-32"],
                ].map(([label, width]) => (
                  <TableHead
                    key={label}
                    scope="col"
                    className={`${width} px-4 py-3 font-semibold whitespace-normal`}
                  >
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.map((role, index) => {
                const keys = role.permissions.map((item) => item.resourceKey);
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
                          onClick={() => navigate(`${ROLES_PATH}/${role.id}`)}
                        >
                          수정
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeRole(role)}
                          disabled={role.is_system || remove.isPending}
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
