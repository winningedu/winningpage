import { useEffect, useState } from "react";
import type { SectionKey } from "@/components/landing/useHomeSectionCopy";
import { supabase } from "@/lib/supabase";

// 랜딩에서 라벨(eyebrow)을 그리는 섹션만 라벨 입력창을 보인다.
const SECTIONS_WITH_EYEBROW: SectionKey[] = ["services", "mentor"];

const INPUT_CLASS = "w-full rounded-sm border border-gray-300 px-3 py-2";

type Status = { kind: "ok" | "error"; message: string } | null;

type SectionCopyPanelProps = { sectionKey: SectionKey };

/** 랜딩 섹션 제목(큰제목/중제목/라벨)을 home_section_copy 한 행으로 편집한다. */
export default function SectionCopyPanel({
  sectionKey,
}: SectionCopyPanelProps) {
  const [eyebrow, setEyebrow] = useState("");
  const [titleMain, setTitleMain] = useState("");
  const [titleSub, setTitleSub] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const hasEyebrow = SECTIONS_WITH_EYEBROW.includes(sectionKey);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase
        .from("home_section_copy")
        .select("section_key, eyebrow, title_main, title_sub")
        .eq("section_key", sectionKey)
        .maybeSingle();
      if (!mounted || !data) return;
      setEyebrow(data.eyebrow ?? "");
      setTitleMain(data.title_main);
      setTitleSub(data.title_sub ?? "");
    }
    load();
    return () => {
      mounted = false;
    };
  }, [sectionKey]);

  async function handleSave() {
    const main = titleMain.trim();
    if (!main) {
      setStatus({ kind: "error", message: "큰제목을 입력하세요." });
      return;
    }
    setSaving(true);
    setStatus(null);
    const { error } = await supabase.from("home_section_copy").upsert(
      {
        section_key: sectionKey,
        eyebrow: hasEyebrow ? eyebrow.trim() || null : null,
        title_main: main,
        title_sub: titleSub.trim() || null,
      },
      { onConflict: "section_key" },
    );
    setSaving(false);
    setStatus(
      error
        ? { kind: "error", message: `저장하지 못했습니다. ${error.message}` }
        : { kind: "ok", message: "저장했습니다." },
    );
  }

  return (
    <div className="mb-6 space-y-3 bg-white p-4 text-sm shadow-sm">
      {hasEyebrow && (
        <label className="block">
          <span className="mb-1 block font-black">라벨</span>
          <input
            className={INPUT_CLASS}
            value={eyebrow}
            onChange={(e) => setEyebrow(e.target.value)}
          />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block font-black">큰제목</span>
        <input
          className={INPUT_CLASS}
          value={titleMain}
          onChange={(e) => setTitleMain(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-black">중제목</span>
        <input
          className={INPUT_CLASS}
          value={titleSub}
          onChange={(e) => setTitleSub(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-sm bg-black px-4 py-2 font-black text-white disabled:opacity-50"
        >
          저장
        </button>
        {status && (
          <span
            role="status"
            className={status.kind === "ok" ? "text-green-700" : "text-red-600"}
          >
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}
