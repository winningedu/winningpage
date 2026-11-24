// W16 휴대폰 카드의 더보기 메뉴. 카드에 다 놓지 못한 동작(재발급, 비활성화, 삭제)을 모은다.

import { Menu } from "@base-ui/react/menu";
import { Ellipsis } from "lucide-react";

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
}

export default function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="더보기"
        className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-strong"
      >
        <Ellipsis aria-hidden className="size-5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="flex min-w-40 flex-col rounded-lg bg-popover py-1 shadow-popover outline-none">
            {items.map((item) => (
              <Menu.Item
                key={item.label}
                onClick={item.onSelect}
                className="flex h-11 items-center px-4 text-app-label text-ink-strong outline-none data-highlighted:bg-surface-muted"
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
