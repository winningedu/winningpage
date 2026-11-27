import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { SectionKey } from "@/components/landing/useHomeSectionCopy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/http/client";
import { useCanEditSection } from "@/pages/admin/shared/sectionEditAccess";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import {
  type SectionCopy,
  type SectionCopyInput,
  sectionCopy,
} from "../../../../shared/home-section-copy/contract.js";

// 랜딩에서 라벨(eyebrow)을 그리는 섹션만 라벨 입력창을 보인다.
const SECTIONS_WITH_EYEBROW: SectionKey[] = ["services", "mentor"];

const INPUT_CLASS = "h-9 w-full";

type Status = { kind: "ok" | "error"; message: string } | null;

const copyQueryKey = (sectionKey: SectionKey) =>
  ["admin", "home-section-copy", sectionKey] as const;

type SectionCopyPanelProps = { sectionKey: SectionKey };

/** 랜딩 섹션 제목(큰제목/중제목/라벨)을 home_section_copy 한 행으로 편집한다. */
export default function SectionCopyPanel({
  sectionKey,
}: SectionCopyPanelProps) {
  // 404 는 아직 저장한 행이 없다는 뜻이라 빈 입력창으로 둔다.
  const { data, isPending } = useQuery({
    queryKey: copyQueryKey(sectionKey),
    queryFn: async ({ signal }) => {
      try {
        return await api
          .get(`admin/home-section-copy/${sectionKey}`, { signal })
          .json(sectionCopy);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    refetchOnWindowFocus: false,
  });

  // 응답이 온 뒤에만 입력창을 그리고 첫 값을 한 번만 심는다. 이후 재조회가 사용자가 쓴 글을 덮지 못한다.
  if (isPending) {
    return (
      <div className="mb-6">
        <AdminDetailSkeleton
          rows={SECTIONS_WITH_EYEBROW.includes(sectionKey) ? 3 : 2}
          label="섹션 제목을 불러오는 중입니다."
        />
      </div>
    );
  }
  return (
    <SectionCopyForm key={sectionKey} sectionKey={sectionKey} initial={data} />
  );
}

function SectionCopyForm({
  sectionKey,
  initial,
}: {
  sectionKey: SectionKey;
  initial: SectionCopy | null | undefined;
}) {
  const [eyebrow, setEyebrow] = useState(initial?.eyebrow ?? "");
  const [titleMain, setTitleMain] = useState(initial?.title_main ?? "");
  const [titleSub, setTitleSub] = useState(initial?.title_sub ?? "");
  const [status, setStatus] = useState<Status>(null);
  const hasEyebrow = SECTIONS_WITH_EYEBROW.includes(sectionKey);
  const queryClient = useQueryClient();
  // view 권한이면 저장 버튼을 그리지 않고 입력창도 읽기 전용으로 둔다.
  const canEdit = useCanEditSection();

  const save = useMutation({
    mutationFn: (json: SectionCopyInput) =>
      api
        .put(`admin/home-section-copy/${sectionKey}`, { json })
        .json(sectionCopy),
    onSuccess: (row) => {
      queryClient.setQueryData(copyQueryKey(sectionKey), row);
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
            readOnly={!canEdit}
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
          readOnly={!canEdit}
        />
      </label>
      <label htmlFor={titleSubId} className="block">
        <span className="mb-1 block font-medium">중제목</span>
        <Input
          id={titleSubId}
          className={INPUT_CLASS}
          value={titleSub}
          onChange={(e) => setTitleSub(e.target.value)}
          readOnly={!canEdit}
        />
      </label>
      <div className="flex items-center gap-3">
        {canEdit && (
          <Button
            type="button"
            size="lg"
            disabled={save.isPending}
            onClick={handleSave}
            className="font-semibold"
          >
            저장
          </Button>
        )}
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
