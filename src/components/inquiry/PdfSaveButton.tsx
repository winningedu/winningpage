import { Button } from "@/components/ui/button";

type Props = {
  onClick: () => void;
  isPreparing: boolean;
};

export default function PdfSaveButton({ onClick, isPreparing }: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={isPreparing}
      className="h-10 px-5 text-app-label"
    >
      {isPreparing ? "PDF 만드는 중…" : "PDF 저장"}
    </Button>
  );
}
