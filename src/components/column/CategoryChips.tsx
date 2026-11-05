import { ALL_CATEGORY } from "@/pages/column/columnData";

type CategoryChipsProps = {
  categories: string[];
  active?: string;
  onChange?: (value: string) => void;
  align?: "left" | "center";
};

export default function CategoryChips({
  categories,
  active,
  onChange,
  align = "left",
}: CategoryChipsProps) {
  return (
    <div
      className={`flex flex-wrap gap-x-3 gap-y-4 ${
        align === "center" ? "justify-center" : "justify-start"
      }`}
    >
      {[ALL_CATEGORY, ...categories].map((option) => {
        const isActive = option === active;

        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange?.(option)}
            className={`shrink-0 rounded-full px-4.5 py-2.5 text-base font-medium leading-[1.4] tracking-[-0.02em] transition-colors ${
              isActive ? "bg-primary text-white" : "bg-surface-footer text-ink"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
