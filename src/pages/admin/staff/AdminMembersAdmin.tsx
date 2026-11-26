import { useQuery } from "@tanstack/react-query";
import { RefreshCw, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminTableFrame } from "@/pages/admin/shared/AdminTableFrame";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import { ActionButton } from "@/pages/admin/shared/formFields";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import { useKeywordParam } from "@/pages/admin/shared/useKeywordParam";
import { fetchStaffList, staffKeys } from "./api";
import { InvitePanel } from "./InvitePanel";
import {
  formatDate,
  MEMBERS_PATH,
  MemberDetailRoute,
  STATUS_LABEL,
} from "./MemberDetail";

// ---------------------------------------------------------------------------
// 관리자 관리(adminMembers), 직원 목록, 상세, 초대.
//
// 와이어프레임(Figma 4572:7064 / 4572:7133 / 4572:7162):
//   목록  번호 | 직원명 | 부서 | 이메일 | 전화번호 | 가입일 | 더보기
//   상세  탭 2개, 「직원 정보」 / 「개별 권한 설정」
//
// 「개별 권한 설정」은 권한 묶음을 덮어쓰는 사람 단위 예외다. 클라이언트 요구
// ("이름별로 대표그룹을 설정하여 주고, 개별적으로 부분별 메뉴도 추가 혹은 제외를
// 선택할 수 있게")의 뒷부분이 정확히 이 화면이다.
//
// 합산 규칙이 화면에 드러나야 오해가 없다, 그래서 상세 하단에 **최종 권한**을
// 함께 보여준다(fn_admin_effective_permissions). 묶음이 준 것과 개별로 더한 것을
// 각각 보여주면 "그래서 이 사람이 지금 뭘 볼 수 있는데?"에 답할 수 없다.
//
// 목록, 상세, 개별 권한 탭은 각각 /admin/adminMembers 아래 주소를 가진다
// (새로고침과 뒤로가기가 그대로 동작). 초대 패널은 목록의 화면 상태다.
// ---------------------------------------------------------------------------

interface AdminMembersAdminProps {
  config: { title: string; searchPlaceholder: string; [key: string]: unknown };
}

export default function AdminMembersAdmin({ config }: AdminMembersAdminProps) {
  return (
    <Routes>
      <Route index element={<MemberList config={config} />} />
      <Route
        path=":profileId/:tab?"
        element={<MemberDetailRoute config={config} />}
      />
      <Route path="*" element={<Navigate to={MEMBERS_PATH} replace />} />
    </Routes>
  );
}

function MemberList({ config }: AdminMembersAdminProps) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useKeywordParam();
  const [inviteOpen, setInviteOpen] = useState(false);

  // 목록, 권한 묶음, 메뉴 목록은 한 응답으로 온다. 상세 새로고침도 같은 응답을 쓴다.
  const list = useQuery({
    queryKey: staffKeys.list,
    queryFn: ({ signal }) => fetchStaffList(signal),
  });
  const rows = list.data?.items ?? [];

  useEffect(() => {
    if (list.error) reportAdminError(`${config.title} 조회 실패`, list.error);
  }, [list.error, config.title]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      `${row.member_name || ""} ${row.department || ""} ${row.member_email || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, keyword]);

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
                aria-label="관리자 검색"
                className="h-9 w-70 font-medium"
              />
            </div>
            <ActionButton onClick={() => setInviteOpen(true)}>
              <UserPlus size={14} aria-hidden="true" />
              관리자 초대
            </ActionButton>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-semibold">{config.title}</h1>
      </div>

      {inviteOpen && list.data && (
        <InvitePanel
          roles={list.data.roles}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {list.isPending ? (
        <div className="bg-white shadow-sm">
          <AdminTableSkeleton columns={8} label="직원 목록을 불러오는 중" />
        </div>
      ) : (
        <div className="bg-white shadow-sm">
          <AdminTableFrame label="직원 목록" className="min-w-225">
            <TableHeader>
              <TableRow className="bg-muted hover:bg-transparent">
                {[
                  ["번호", "w-16"],
                  ["직원명", ""],
                  ["부서", ""],
                  ["이메일", ""],
                  ["권한 묶음", ""],
                  ["상태", ""],
                  ["가입일", ""],
                  [
                    "관리",
                    "sticky right-0 w-24 border-l border-gray-200 bg-muted",
                  ],
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
              {filteredRows.map((row, index) => (
                <TableRow key={row.profile_id}>
                  <TableCell className="px-4 py-3">{index + 1}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    {row.member_name || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    {row.department || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    {row.member_email || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    {row.role_name || "-"}
                    {row.role_is_super && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-primary text-primary"
                      >
                        최고
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {STATUS_LABEL[row.status] || row.status}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {formatDate(row.joined_at)}
                  </TableCell>
                  <TableCell className="sticky right-0 border-l border-gray-100 bg-white px-4 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(`${MEMBERS_PATH}/${row.profile_id}`)
                      }
                    >
                      더보기
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredRows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={8}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    등록된 관리자가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </AdminTableFrame>
        </div>
      )}
    </div>
  );
}
