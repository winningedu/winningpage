import { X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SurveyPick } from "@/lib/growth/api";
import SuggestionList from "./SuggestionList";
import { SURVEY_COPY } from "./surveyLabels";
import { searchDepartments } from "./surveySearch";
import { useSearchSuggestions } from "./useSearchSuggestions";

type DepartmentFieldProps = {
  value: SurveyPick | null;
  onChange: (value: SurveyPick | null) => void;
  disabled: boolean;
  ariaLabel: string;
};

// 희망 학과(q10). 검색 소스는 admission_results.department_name. 결과가 없으면 직접 입력으로
// 그대로 저장한다(custom: true, 반영과목 자동 대조가 제한된다).
export default function DepartmentField({
  value,
  onChange,
  disabled,
  ariaLabel,
}: DepartmentFieldProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { results, outcome } = useSearchSuggestions(query, searchDepartments);

  const pick = (pick: SurveyPick) => {
    onChange(pick);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-accent bg-surface-03 py-1 pl-3 pr-1.5 text-app-label font-medium text-accent">
          {value.name}
          {value.custom && (
            <span className="text-app-caption text-ink-sub">직접 입력</span>
          )}
          {!disabled && (
            <button
              type="button"
              aria-label={`${value.name} 지우기`}
              onClick={() => onChange(null)}
              className="rounded-full p-0.5 hover:bg-white"
            >
              <X className="size-3.5" />
            </button>
          )}
        </span>
      ) : (
        <p className="text-app-caption text-ink-sub">
          {SURVEY_COPY.departmentEmpty}
        </p>
      )}
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={query}
          placeholder={SURVEY_COPY.departmentPlaceholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="h-11 w-full rounded-lg border border-line bg-white px-4 text-app-body text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden disabled:bg-surface-04"
        />
        {open && outcome !== "idle" && (
          <div id={listId}>
            <SuggestionList
              label="학과 검색 결과"
              names={results}
              loading={outcome === "loading"}
              onPick={(name) => pick({ name, source: "search" })}
              empty={
                <div className="flex flex-col gap-2 px-4 py-3">
                  <p className="text-app-body text-ink-sub">
                    {SURVEY_COPY.noResult}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-fit px-3 text-app-label"
                    onClick={() =>
                      pick({
                        name: query.trim(),
                        source: "manual",
                        custom: true,
                      })
                    }
                  >
                    {SURVEY_COPY.addCustomDepartment}
                  </Button>
                  <p className="text-app-caption text-ink-sub">
                    {SURVEY_COPY.customDepartmentNote}
                  </p>
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
