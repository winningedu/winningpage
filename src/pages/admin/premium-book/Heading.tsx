import type { PremiumBookAdminConfig } from "./types";

// 모든 하위 화면 위에 같은 제목과 홈페이지 반영 안내를 둔다.
export function Heading({ config }: { config: PremiumBookAdminConfig }) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold text-foreground">
        {config.title}
      </h1>

      {config.homepage && (
        <div className="mb-4 space-y-1">
          <p className="text-sm font-medium text-destructive">
            이 메뉴에서 저장한 내용은 실제 홈페이지에 반영됩니다.
          </p>
          {config.guideText && (
            <p className="whitespace-pre-line text-sm font-semibold leading-6 text-destructive">
              {config.guideText}
            </p>
          )}
        </div>
      )}
    </>
  );
}
