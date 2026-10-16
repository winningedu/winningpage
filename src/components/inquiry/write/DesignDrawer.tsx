import { useSyncExternalStore } from "react";
import DesignBody from "@/components/inquiry/design/DesignBody";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DesignView, TopicView } from "@/lib/inquiry/types";
import { cn } from "@/lib/utils";

// xl(80rem) 이상에서는 폼을 가리지 않는 비모달 서랍으로, 미만에서는 기존 modal 서랍으로 연다.
const WIDE_QUERY = "(min-width: 80rem)";
// 비모달 서랍(28rem) 폭만큼 본문 오른쪽을 비우는 클래스. 서랍은 xl 이상에서만 비모달이다.
export const DRAWER_GUTTER_CLASS = "xl:pr-[28rem]";

function subscribeWide(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function readWide() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(WIDE_QUERY).matches
  );
}

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
  const wide = useSyncExternalStore(subscribeWide, readWide, () => false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} nonModal={wide}>
      <SheetContent
        side="right"
        className={cn(
          "w-[48rem] overflow-y-auto p-6 data-[side=right]:sm:max-w-[48rem]",
          // 비모달일 때는 사이트 헤더(4rem) 아래에서 시작해 헤더의 버튼을 가리지 않는다.
          // 팝업은 body 로 포털돼 --header-height 변수가 닿지 않으므로 리터럴로 쓴다.
          wide &&
            "data-[side=right]:top-16 data-[side=right]:h-[calc(100dvh-4rem)] data-[side=right]:w-[28rem] data-[side=right]:sm:max-w-[28rem]",
        )}
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
