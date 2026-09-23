import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  fetchDepartmentsForUniversity,
  searchUniversities,
  type UniversityOption,
} from "@/lib/goal/universitySearch";

// 대학 검색 콤보박스 + 학과 셀렉트 — docs/figma-goal/00-INDEX.md §5-3 `UniversitySelect`.
// 상한(2단계)・하한(3단계) 두 스텝이 이 컴포넌트 하나를 `target` prop만 바꿔 공유한다
// (part-02 part-01 구현 노트: "상한/하한 두 스텝을 하나의 UniversitySelectStep 컴포넌트로").
//
// 데이터 소스: goal_university_cuts(공개 읽기 RLS, sql/55_goal_management.sql (6-4))를
// searchUniversities()/fetchDepartmentsForUniversity()로 직접 조회한다(공개 읽기라 서버
// 경유 불요) — 정적 목업(onboardingOptions.js UNIVERSITY_OPTIONS, 대학 11곳 고정)을
// 대체한다(mock 삭제 후속 UoW, 2026-08-20). 온보딩 제출(intake.js)은 대학명 문자열을
// 그대로 받는 계약이라 이 배선 전환으로 바뀌지 않는다.
const SEARCH_DEBOUNCE_MS = 300;

type UniversityChoice = {
  university: string;
  department: string;
};

type UniversitySelectProps = {
  value: UniversityChoice;
  onChange: (partial: Partial<UniversityChoice>) => void;
  target: "upper" | "lower"; // 접근성 라벨 분기용, 시각 차이는 없음(part-02 §5)
  universityPlaceholder?: string;
  departmentPlaceholder?: string;
};

export default function UniversitySelect({
  value,
  onChange,
  target,
  universityPlaceholder = "대학교를 선택해주세요",
  departmentPlaceholder = "과를 선택해주세요.",
}: UniversitySelectProps) {
  const [searchTerm, setSearchTerm] = useState(value.university || "");
  const [isOpen, setIsOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<UniversityOption[]>([]);
  const [searching, setSearching] = useState(false);
  // 이미 선택된 대학의 학과 목록 — searchResults(현재 검색 세션 결과)와 별도로 둔다.
  // 대학을 고르면 드롭다운이 닫히고 이후 검색어가 다시 바뀔 수 있어, searchResults만
  // 쓰면 그 순간 학과 셀렉트가 빈 목록으로 떨어진다.
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value.university || "");
  }, [value.university]);

  // 선택된 대학이 바뀔 때마다(직접 선택 + 온보딩 재진입 등 외부 hydration 포함) 학과
  // 목록을 정확 일치로 다시 채운다 — 단일 정본(value.university)에서만 파생한다.
  useEffect(() => {
    let alive = true;
    if (!value.university) {
      setSelectedDepartments([]);
      return;
    }
    fetchDepartmentsForUniversity(value.university).then((departments) => {
      if (alive) setSelectedDepartments(departments);
    });
    return () => {
      alive = false;
    };
  }, [value.university]);

  // 검색 디바운스 — 드롭다운이 열려 있고 입력이 있을 때만 조회한다(전량 프리로드 금지,
  // universitySearch.ts 헤더 주석 참고).
  useEffect(() => {
    if (!isOpen || !searchTerm.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchUniversities(searchTerm).then((results) => {
        if (!alive) return;
        setSearchResults(results);
        setSearching(false);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [searchTerm, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm(value.university || "");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value.university]);

  function selectUniversity(name: string) {
    onChange({ university: name, department: "" });
    setSearchTerm(name);
    setIsOpen(false);
  }

  const universityFieldId = `university-select-${target}`;
  const departmentFieldId = `department-select-${target}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative" ref={wrapperRef}>
        <label className="sr-only" htmlFor={universityFieldId}>
          {target === "lower" ? "하한 목표 대학교" : "상한 목표 대학교"}
        </label>
        <input
          id={universityFieldId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          value={searchTerm}
          placeholder={universityPlaceholder}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsOpen(false);
          }}
          className="h-17 w-full rounded-xl border border-line bg-white px-5 pr-12 text-app-card-title text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden"
        />
        <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-ink-sub">
          {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </span>

        {isOpen && (
          // 드롭다운은 입력 필드 아래 오버레이로, 레이아웃을 밀어내지 않는다(part-02 #4 구현 노트).
          // 포지셔닝(absolute)은 ScrollArea 밖의 plain wrapper가 맡는다 — src/index.css가
          // overlayscrollbars.css를 @layer 없이 import해 `[data-overlayscrollbars]{position:
          // relative}`가 unlayered로 항상 Tailwind @layer utilities의 absolute를 이긴다
          // (cascade layers: unlayered > layered). ScrollArea 루트에 직접 absolute를 걸면
          // 무시되고 목록이 정상 흐름에 남아 아래로 밀린다 — ScrollArea 자신은 크기·모양
          // (max-h/rounded/border/shadow)만 맡는다.
          <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20">
            <ScrollArea className="max-h-68 rounded-xl border border-line bg-white shadow-[0_0.75rem_2rem_rgba(15,23,42,0.12)]">
              <ul
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: APG Combobox 패턴 — 커스텀 콤보박스의 옵션 목록.
                role="listbox"
              >
                {!searchTerm.trim() ? (
                  <li className="px-5 py-4.25 text-app-body text-ink-sub">
                    대학명을 입력해 검색하세요.
                  </li>
                ) : searching ? (
                  <li className="px-5 py-4.25 text-app-body text-ink-sub">
                    검색 중…
                  </li>
                ) : searchResults.length === 0 ? (
                  <li className="px-5 py-4.25 text-app-body text-ink-sub">
                    검색 결과가 없습니다.
                  </li>
                ) : (
                  searchResults.map((university) => (
                    <li key={university.name}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={value.university === university.name}
                        onClick={() => selectUniversity(university.name)}
                        className={`flex h-17 w-full items-center px-5 text-left text-app-card-title transition-colors hover:bg-surface-03 ${
                          value.university === university.name
                            ? "bg-surface-03 text-accent"
                            : "text-ink"
                        }`}
                      >
                        {university.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </ScrollArea>
          </div>
        )}
      </div>

      <div className="relative">
        <label className="sr-only" htmlFor={departmentFieldId}>
          학과
        </label>
        <select
          id={departmentFieldId}
          value={value.department}
          disabled={!value.university}
          onChange={(event) => onChange({ department: event.target.value })}
          className="h-17 w-full appearance-none rounded-xl border border-line bg-white px-5 pr-12 text-app-card-title text-ink focus:border-accent focus:outline-hidden disabled:bg-surface-01 disabled:text-ink-sub"
        >
          <option value="" disabled>
            {departmentPlaceholder}
          </option>
          {selectedDepartments.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-ink-sub">
          <ChevronDown size={20} />
        </span>
      </div>
    </div>
  );
}
