import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import type { ActivityFields } from "@/lib/inquiry/types";

const EMPTY = "-";

const TEXT_ROWS: { label: string; key: keyof ActivityFields }[] = [
  { label: "주제", key: "topic" },
  { label: "개념", key: "concept" },
  { label: "방법", key: "method" },
  { label: "결과", key: "result" },
  { label: "한계", key: "limitation" },
];

function ListCell({ items }: { items: string[] }) {
  if (items.length === 0) return <>{EMPTY}</>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((v) => (
        <li key={v}>{v}</li>
      ))}
    </ul>
  );
}

/** 확정 적립 7항목(No.104). 값이 없으면 "-". */
export default function FinalFieldsTable({
  fields,
}: {
  fields: ActivityFields;
}) {
  return (
    <Table>
      <TableCaption className="sr-only">확정 적립 내용</TableCaption>
      <TableBody>
        {TEXT_ROWS.map(({ label, key }) => {
          const value = fields[key] as string;
          return (
            <TableRow key={key}>
              <TableHead
                scope="row"
                className="w-32 text-app-label text-ink-sub"
              >
                {label}
              </TableHead>
              <TableCell className="whitespace-normal text-app-body text-ink-strong">
                {value.trim() === "" ? EMPTY : value}
              </TableCell>
            </TableRow>
          );
        })}
        <TableRow>
          <TableHead scope="row" className="w-32 text-app-label text-ink-sub">
            수치
          </TableHead>
          <TableCell className="whitespace-normal text-app-body text-ink-strong">
            <ListCell items={fields.numbers} />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead scope="row" className="w-32 text-app-label text-ink-sub">
            출처
          </TableHead>
          <TableCell className="whitespace-normal text-app-body text-ink-strong">
            <ListCell items={fields.sources} />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
