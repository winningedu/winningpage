import { useCallback, useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionButton } from "@/pages/admin/shared/formFields";
import {
  type GoldenQuery,
  listGoldenQueries,
  setGoldenQueryActive,
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
  const [items, setItems] = useState<GoldenQuery[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<GoldenQuery | "new" | null>(null);

  const reload = useCallback(() => {
    listGoldenQueries(knowledgeType).then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError("");
      setItems(result.data);
    });
  }, [knowledgeType]);

  useEffect(() => {
    reload();
  }, [reload]);

  const titles = useResourceTitles(
    (items ?? []).flatMap((item) => item.expected_resource_ids),
  );
  const activeCount = (items ?? []).filter((item) => item.is_active).length;

  async function toggleActive(item: GoldenQuery) {
    const result = await setGoldenQueryActive(item.id, !item.is_active);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    reload();
  }

  return (
    <div className="bg-white p-6 shadow-sm">
      <ErrorBox message={error} />
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          활성 <span className="text-primary">{activeCount}</span>문항
        </span>
        <ActionButton onClick={() => setEditing("new")}>질의 추가</ActionButton>
      </div>
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
                      onClick={() => toggleActive(item)}
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
