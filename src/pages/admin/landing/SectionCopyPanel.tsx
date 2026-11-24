import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import type { SectionKey } from "@/components/landing/useHomeSectionCopy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/http/client";

// 랜딩에서 라벨(eyebrow)을 그리는 섹션만 라벨 입력창을 보인다.
const SECTIONS_WITH_EYEBROW: SectionKey[] = ["services", "mentor"];

const INPUT_CLASS = "h-9 w-full";

type Status = { kind: "ok" | "error"; message: string } | null;

type SectionCopy = {
  section_key: string;
  eyebrow: string | null;
  title_main: string;
  title_sub: string | null;
};

type SectionCopyPanelProps = { sectionKey: SectionKey };

/** 랜딩 섹션 제목(큰제목/중제목/라벨)을 home_section_copy 한 행으로 편집한다. */
export default function SectionCopyPanel({
  sectionKey,
}: SectionCopyPanelProps) {
  const [eyebrow, setEyebrow] = useState("");
  const [titleMain, setTitleMain] = useState("");
  const [titleSub, setTitleSub] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const hasEyebrow = SECTIONS_WITH_EYEBROW.includes(sectionKey);

  const queryClient = useQueryClient();
  const queryKey = ["admin", "home-section-copy", sectionKey];

  // 404 는 아직 저장한 행이 없다는 뜻이라 빈 입력창으로 둔다.
  const { data } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        return await api
          .get(`admin/home-section-copy/${sectionKey}`, { signal })
          .json<SectionCopy>();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data) return;
    setEyebrow(data.eyebrow ?? "");
    setTitleMain(data.title_main);
    setTitleSub(data.title_sub ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: (json: Omit<SectionCopy, "section_key">) =>
      api
        .put(`admin/home-section-copy/${sectionKey}`, { json })
        .json<SectionCopy>(),
    onSuccess: (row) => {
      queryClient.setQueryData(queryKey, row);
      setStatus({ kind: "ok", message: "저장했습니다." });
    },
    onError: (error) =>
      setStatus({
        kind: "error",
        message: `저장하지 못했습니다. ${
          error instanceof ApiError ? error.detail : error.message
        }`,
      }),
  });

  function handleSave() {
    const main = titleMain.trim();
    if (!main) {
      setStatus({ kind: "error", message: "큰제목을 입력하세요." });
      return;
    }
    setStatus(null);
    save.mutate({
      eyebrow: hasEyebrow ? eyebrow.trim() || null : null,
      title_main: main,
      title_sub: titleSub.trim() || null,
    });
  }

  const eyebrowId = useId();
  const titleMainId = useId();
  const titleSubId = useId();

  return (
    <div className="mb-6 space-y-3 bg-white p-4 text-sm shadow-sm">
      {hasEyebrow && (
        <label htmlFor={eyebrowId} className="block">
          <span className="mb-1 block font-medium">라벨</span>
          <Input
            id={eyebrowId}
            className={INPUT_CLASS}
            value={eyebrow}
            onChange={(e) => setEyebrow(e.target.value)}
          />
        </label>
      )}
      <label htmlFor={titleMainId} className="block">
        <span className="mb-1 block font-medium">큰제목</span>
        <Input
          id={titleMainId}
          className={INPUT_CLASS}
          value={titleMain}
          onChange={(e) => setTitleMain(e.target.value)}
        />
      </label>
      <label htmlFor={titleSubId} className="block">
        <span className="mb-1 block font-medium">중제목</span>
        <Input
          id={titleSubId}
          className={INPUT_CLASS}
          value={titleSub}
          onChange={(e) => setTitleSub(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="lg"
          disabled={save.isPending}
          onClick={handleSave}
          className="font-semibold"
        >
          저장
        </Button>
        {status && (
          <span
            role="status"
            className={
              status.kind === "ok" ? "text-green-700" : "text-destructive"
            }
          >
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}
