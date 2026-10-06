import DesignBody from "@/components/inquiry/design/DesignBody";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DesignView, TopicView } from "@/lib/inquiry/types";

// 작성 중 설계 리포트 다시 보기(No.74). 화면을 떠나지 않고 서랍으로 연다.
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  design: DesignView;
  topic: TopicView;
};

export default function DesignDrawer({
  open,
  onOpenChange,
  design,
  topic,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[48rem] overflow-y-auto p-6 data-[side=right]:sm:max-w-[48rem]"
      >
        <SheetHeader className="p-0">
          <SheetTitle>설계 리포트</SheetTitle>
          <SheetDescription>
            쓰는 동안 참고해요. 이 창을 닫아도 작성 내용은 그대로예요.
          </SheetDescription>
        </SheetHeader>
        <DesignBody design={design} topic={topic} compact />
      </SheetContent>
    </Sheet>
  );
}
