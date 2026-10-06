import { Button } from "@/components/ui/button";
import type { CollectUpload } from "@/lib/growth/api";
import { CollectSection } from "./CollectSection";
import type { SemesterItem } from "./collectLogic";
import { LIMIT_MESSAGE } from "./uploadFlow";

const BADGE_CLASS: Record<"ok" | "warn" | "none", string> = {
  ok: "bg-surface-03 text-ink-strong",
  warn: "bg-surface-warning text-ink-strong",
  none: "bg-surface-warning text-ink-strong",
};

const RECOMMEND_TEXT =
  "자기평가서를 먼저 올리기를 권해요. 활동 결과물만으로는 무엇을 했는지는 알 수 있어도 어떻게 판단했고 무엇이 바뀌었는지는 알 수 없어요.";
const FORMAT_TEXT =
  "PDF, 이미지, TXT, DOCX / 학기당 10개까지 / 주제, 개념, 결과, 한계만 뽑고 원문은 보관하지 않아요";
const UNREADABLE_TEXT = "글자를 읽지 못해 분석에 넣지 않았어요";
const UNREADABLE_HINT =
  "사진이 흐리거나 글자가 작으면 읽지 못할 수 있어요. 이 활동은 아래 활동 직접 입력에 적어 주세요.";

function uploadStatusText(status: CollectUpload["status"]): string {
  if (status === "ok") return "올림";
  if (status === "failed") return UNREADABLE_TEXT;
  return "처리 중";
}

function UploadList({ uploads }: { uploads: CollectUpload[] }) {
  if (uploads.length === 0) return null;
  const hasFailed = uploads.some((u) => u.status === "failed");
  return (
    <div className="mt-3">
      <ul className="flex flex-col gap-1">
        {uploads.map((u) => (
          <li
            key={u.id}
            className="flex items-center justify-between gap-3 text-app-label"
          >
            <span className="min-w-0 truncate text-ink-strong">
              {u.fileName}
            </span>
            <span
              className={u.status === "failed" ? "text-error" : "text-ink-sub"}
            >
              {uploadStatusText(u.status)}
            </span>
          </li>
        ))}
      </ul>
      {hasFailed && (
        <p className="mt-2 text-app-caption text-ink-sub">{UNREADABLE_HINT}</p>
      )}
    </div>
  );
}

/** 학기별 기록 카드(No.40~44). 자료가 충분하지 않은 학기에 파일 추가 영역을 붙인다. */
export function SemesterRecordsCard({
  items,
  uploads,
  onAddFile,
}: {
  items: SemesterItem[];
  uploads: CollectUpload[];
  onAddFile: (item: SemesterItem) => void;
}) {
  return (
    <CollectSection title="학기별 기록">
      <ul>
        {items.map((item) => {
          const [grade, semester] = [`고${item.key[1]}`, Number(item.key[3])];
          const semesterUploads = uploads.filter(
            (u) => u.gradeLabel === grade && u.semester === semester,
          );
          const full = item.uploadsLeft === 0;
          return (
            <li
              key={item.key}
              className={`border-b border-line/60 py-3 last:border-b-0 ${
                item.inRange ? "" : "opacity-40"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-app-label text-ink-sub">
                  {item.title}
                </span>
                <span className="flex items-center gap-2">
                  {item.inRange && item.count > 0 && (
                    <span className="text-app-body font-medium text-ink-strong">
                      {item.count}건
                    </span>
                  )}
                  {item.badge ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-app-badge font-medium ${BADGE_CLASS[item.badge.tone]}`}
                    >
                      {item.badge.text}
                    </span>
                  ) : (
                    <span className="text-app-caption text-ink-sub">
                      분석 범위 밖
                    </span>
                  )}
                </span>
              </div>
              {item.recommendUpload && (
                <div className="mt-3 rounded-lg bg-surface-04 px-4 py-4">
                  <h3 className="text-app-label font-semibold text-ink-strong">
                    {item.title} 자료 추가
                  </h3>
                  <p className="mt-1 text-app-caption text-ink-sub">
                    {RECOMMEND_TEXT}
                  </p>
                  <p className="mt-1 text-app-caption text-ink-sub">
                    {FORMAT_TEXT}
                  </p>
                  <UploadList uploads={semesterUploads} />
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      disabled={full}
                      onClick={() => onAddFile(item)}
                      aria-label={`${item.title} 파일 추가`}
                    >
                      파일 추가
                    </Button>
                    {full && (
                      <span className="text-app-caption text-ink-sub">
                        {LIMIT_MESSAGE}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </CollectSection>
  );
}
