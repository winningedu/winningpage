// 샘플 엑셀 양식 내려받기. 정적 파일이라 이동 없이 내려받기만 한다.

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TemplateLink({
  file,
  downloadName,
}: {
  file: string;
  downloadName: string;
}) {
  return (
    <a
      href={`/templates/${file}`}
      download={downloadName}
      className={cn(
        buttonVariants({ variant: "outline" }),
        "h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary",
      )}
    >
      샘플 엑셀 양식
    </a>
  );
}
