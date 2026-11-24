import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionButton } from "@/pages/admin/shared/formFields";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import {
  evalKeys,
  failureText,
  type GoldenQuery,
  listGoldenQueries,
  patchGoldenQuery,
} from "./api";
import ErrorBox from "./ErrorBox";
import type { KnowledgeType } from "./form";
import QueryDialog from "./QueryDialog";
import { Td, Th } from "./TableCells";
import useResourceTitles from "./useResourceTitles";

export default function QueriesTab({
  knowledgeType,
}: {
  knowledgeType: KnowledgeType;
}) {
  const queryClient = useQueryClient();
  const [toggleError, setToggleError] = useState("");
  const [editing, setEditing] = useState<GoldenQuery | "new" | null>(null);

  const list = useQuery({
    queryKey: evalKeys.queries(knowledgeType),
    queryFn: ({ signal }) => listGoldenQueries(knowledgeType, signal),
  });
  const items = list.data ?? null;
  const error = list.error
    ? failureText("문제집 조회", list.error)
    : toggleError;
  const reload = () =>
    queryClient.invalidateQueries({
      queryKey: evalKeys.queries(knowledgeType),
    });

  // 삭제는 비활성으로 한다. 지난 실행 이력의 질의 id 가 계속 뜻을 갖게 하려는 선택이다.
  const toggle = useMutation({
    mutationFn: (item: GoldenQuery) =>
      patchGoldenQuery(item.id, knowledgeType, { is_active: !item.is_active }),
    onSuccess: () => {
      setToggleError("");
      return reload();
    },
    onError: (e) => setToggleError(failureText("질의 상태 변경", e)),
  });

  const titles = useResourceTitles(
    (items ?? []).flatMap((item) => item.expected_resource_ids),
  );
  const activeCount = (items ?? []).filter((item) => item.is_active).length;

  return (
    <div className="bg-white p-6 shadow-sm">
      <ErrorBox message={error} />
      <div className="mb-4 flex items-center gap-3">
        {!list.isPending && (
          <span className="text-sm text-muted-foreground">
            활성 <span className="text-primary">{activeCount}</span>문항
          </span>
        )}
        <ActionButton onClick={() => setEditing("new")}>질의 추가</ActionButton>
      </div>
      {list.isPending ? (
        <AdminTableSkeleton columns={7} label="문제집을 불러오는 중" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <Th>학년</Th>
              <Th>과목</Th>
              <Th>진로</Th>
              <Th>주제</Th>
              <Th>기대 자료 수</Th>
              <Th>활성</Th>
              <Th>
                <span className="sr-only">작업</span>
              </Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items && items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className="py-12 text-center text-muted-foreground"
                >
                  등록된 질의가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              (items ?? []).map((item) => (
                <TableRow
                  key={item.id}
                  className={item.is_active ? "" : "text-muted-foreground"}
                >
                  <Td>{item.grade}</Td>
                  <Td>{item.subject}</Td>
                  <Td>{item.career}</Td>
                  <Td className="font-medium whitespace-normal">
                    {item.selected_topic}
                  </Td>
                  <TableCell
                    title={item.expected_resource_ids
                      .map((id) => titles[id] ?? id)
                      .join("\n")}
                  >
                    {item.expected_resource_ids.length}
                  </TableCell>
                  <Td>{item.is_active ? "활성" : "비활성"}</Td>
                  <TableCell>
                    <div className="flex gap-2">
                      <ActionButton
                        variant="light"
                        onClick={() => setEditing(item)}
                      >
                        편집
                      </ActionButton>
                      <ActionButton
                        variant={item.is_active ? "danger" : "light"}
                        onClick={() => toggle.mutate(item)}
                        disabled={toggle.isPending}
                      >
                        {item.is_active ? "비활성" : "다시 활성"}
                      </ActionButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
      {editing !== null && (
        <QueryDialog
          knowledgeType={knowledgeType}
          target={editing === "new" ? null : editing}
          titles={titles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
