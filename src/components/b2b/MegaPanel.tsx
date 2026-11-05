import { Link } from "react-router";
import type { useNavGroups } from "@/hooks/useNavGroups";
import { NAV_LEFT, PILL_GAP, PILL_W } from "./navGrid";

type NavGroup = ReturnType<typeof useNavGroups>[number];

type MegaPanelProps = {
  groups: NavGroup[];
  openGroupTitle: string | null;
  onNavigate: () => void;
};

// 알약 바로 아래에 열리는 항목 전용 패널. 컬럼 왼쪽선이 알약 왼쪽선과 같다.
export default function MegaPanel({
  groups,
  openGroupTitle,
  onNavigate,
}: MegaPanelProps) {
  if (openGroupTitle === null) return null;

  return (
    <div
      className="flex border-b border-black/5 bg-white py-6"
      style={{ paddingLeft: NAV_LEFT, gap: PILL_GAP }}
    >
      {groups.map((group) => (
        <ul
          key={group.title}
          className="flex shrink-0 flex-col gap-4 text-sm font-medium text-ink"
          style={{ width: PILL_W }}
        >
          {group.items.map((item) => (
            <li key={`${item.to}-${item.label}`}>
              <Link
                to={item.to}
                onClick={onNavigate}
                className="transition hover:text-primary"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
