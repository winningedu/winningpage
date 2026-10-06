import { X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SurveyPick } from "@/lib/growth/api";
import SuggestionList from "./SuggestionList";
import { SURVEY_COPY } from "./surveyLabels";
import { pushUniversity, searchUniversities } from "./surveySearch";
import { UNIVERSITY_MAX } from "./surveyState";
import { useSearchSuggestions } from "./useSearchSuggestions";

type UniversitiesFieldProps = {
  value: readonly SurveyPick[];
  onChange: (value: SurveyPick[]) => void;
  disabled: boolean;
  ariaLabel: string;
};

// 희망 대학(q11). 최대 2곳. 세 번째를 고르면 가장 먼저 고른 대학이 빠진다(No.30).
// 검색 소스는 admission_results.university_name.
export default function UniversitiesField({
  value,
  onChange,
  disabled,
  ariaLabel,
}: UniversitiesFieldProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { results, outcome } = useSearchSuggestions(query, searchUniversities);
  const willReplace = value.length >= UNIVERSITY_MAX;
  const oldest = value[0]?.name;

  const pick = (item: SurveyPick) => {
    onChange(pushUniversity(value, item));
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((university) => (
            <li
              key={university.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-surface-03 py-1 pl-3 pr-1.5 text-app-label font-medium text-accent"
            >
              {university.name}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`${university.name} 지우기`}
                  onClick={() =>
                    onChange(value.filter((u) => u.name !== university.name))
                  }
                  className="rounded-full p-0.5 hover:bg-white"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-app-caption text-ink-sub">
          {SURVEY_COPY.universitiesEmpty}
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
          placeholder={SURVEY_COPY.universitiesPlaceholder}
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
              label="대학 검색 결과"
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
                    {SURVEY_COPY.addCustomUniversity}
                  </Button>
                </div>
              }
            />
          </div>
        )}
      </div>
      {open && willReplace && oldest && (
        <p className="text-app-caption text-ink-sub">
          두 곳까지 고를 수 있어요. 세 번째를 고르면 가장 먼저 고른 대학(
          {oldest})은 빠져요.
        </p>
      )}
    </div>
  );
}
