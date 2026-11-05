import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import ColumnBody, {
  type ColumnBodyPost,
  getContentBlocks,
} from "@/components/column/ColumnBody";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { site } from "@/config/site";
import { getCoverUrl } from "@/pages/column/columnData";
import { isEmptyDocument } from "./BlockEditor";

type ColumnPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  post: ColumnBodyPost | null | undefined;
  label?: string;
};

// 온디맨드 스냅샷 렌더러 — 에디터 state를 구독하지 않는다.
// post는 "미리보기" 버튼을 눌렀을 때 editorRef.getBlocks()를 1회 호출해 만든 스냅샷이며,
// 여기서 에디터로 되돌아가는 데이터 경로는 없다(읽기 전용).
//
// 스크롤 잠금·ESC 닫기·포커스 트랩은 shadcn Dialog(Base UI) 내장 동작으로 처리한다 —
// 별도 useEffect 없음. 헤더의 X 버튼은 기존 마크업을 그대로 유지한다(shadcn 기본
// 닫기 버튼은 쓰지 않는다 — 이 파일은 DialogContent가 아니라 Dialog 하위 요소를
// 직접 조합해 쓴다).
export default function ColumnPreviewModal({
  open,
  onClose,
  post,
  label = site.columnTitle,
}: ColumnPreviewModalProps) {
  if (!open) return null;

  const coverUrl = post ? getCoverUrl(post) : "";
  // hasBlockContent(길이만 검사)는 항상 true다 — BlockNote 문서는 항상 최소 1개의 빈 paragraph를
  // 포함하기 때문에, 본문을 안 쓴 미리보기도 절대 "비어 있음"으로 판정되지 않았다.
  // isEmptyDocument(전부 빈 paragraph인지 검사)를 재사용한다 — 이미지·구분선만 있는 문서는
  // 빈 paragraph가 아니므로 여전히 "비어 있지 않음"으로 판정된다(기존 의도 유지).
  const isEmpty =
    isEmptyDocument(getContentBlocks(post)) &&
    !String(post?.content ?? "").trim();

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/50" />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          // Base UI Popup은 aria-modal을 자동 배선하지 않는다 — 리터럴로 명시.
          aria-modal="true"
          className="fixed top-1/2 left-1/2 z-100 flex h-[90vh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none sm:w-[calc(100%-4rem)]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[#edf0f4] px-6 py-4">
            <DialogTitle className="text-sm font-black text-[#111827]">
              미리보기 — 공개 페이지에서 이렇게 보입니다
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="미리보기 닫기"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-[#F4F4F4]"
            >
              <X size={20} />
            </button>
          </div>

          <ScrollArea className="min-h-0 flex-1 bg-white">
            {coverUrl && (
              <img
                src={coverUrl}
                alt={(post?.title as string) || ""}
                className="h-64 w-full object-cover sm:h-80"
              />
            )}

            {/* 45rem 캡은 ColumnBody 자신의 루트 div가 이미 가지고 있다(공개 페이지와 동일 클래스).
                여기서 또 max-w-[45rem]을 씌우면 좌우 padding만큼 줄어든 폭이 되어 720px를 못 채운다 —
                바깥은 넉넉한 폭만 주고 실제 캡은 ColumnBody에 맡긴다. */}
            <div className="mx-auto w-full max-w-208 px-5 py-10 sm:px-8">
              <p className="mb-2 text-base font-semibold leading-[1.4] tracking-[-0.02em] text-accent">
                {label}
              </p>
              <h1 className="mb-8 break-keep text-3xl font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[2.25rem]">
                {(post?.title as string) || "(제목 없음)"}
              </h1>

              {isEmpty ? (
                <p className="text-sm text-gray-400">본문이 비어 있습니다.</p>
              ) : (
                <ColumnBody post={post} />
              )}
            </div>
          </ScrollArea>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
