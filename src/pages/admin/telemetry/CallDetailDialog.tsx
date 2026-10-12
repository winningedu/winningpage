import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CallItem } from "./api";
import { formatDate, formatNullableInt, serviceLabel } from "./format";

export default function CallDetailDialog({
  row,
  onClose,
}: {
  row: CallItem | null;
  onClose: () => void;
}) {
  const fields: [string, string][] = row
    ? [
        ["traceId", row.traceId ?? ""],
        ["callKey", row.callKey ?? ""],
        ["targetKind", row.targetKind ?? ""],
        ["targetId", row.targetId ?? ""],
        ["profileId", row.profileId ?? ""],
        ["promptVersion", row.promptVersion ?? ""],
        ["retryReason", row.retryReason ?? ""],
        ["errorCode", row.errorCode ?? ""],
        ["errorMessage", row.errorMessage ?? ""],
        ["issueCodes", row.issueCodes.join(", ")],
        ["inputChars", formatNullableInt(row.inputChars)],
        ["outputChars", formatNullableInt(row.outputChars)],
        ["thoughts", formatNullableInt(row.tokens.thoughts)],
        ["total", formatNullableInt(row.tokens.total)],
      ]
    : [];

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[36rem]">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>
                {serviceLabel(row.service)} {row.feature}
              </DialogTitle>
              <DialogDescription>
                {formatDate(row.createdAt)} / {row.model}
              </DialogDescription>
            </DialogHeader>
            <dl className="divide-y divide-gray-100 border border-gray-200 text-sm">
              {fields.map(([label, value]) => (
                <div key={label} className="flex gap-3 px-3 py-2">
                  <dt className="w-[9rem] shrink-0 font-black text-gray-500">
                    {label}
                  </dt>
                  <dd className="min-w-0 break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
