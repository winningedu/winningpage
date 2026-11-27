import { useEffect, useRef, useState } from "react";
import {
  useBeforeUnload,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/http/client";
import {
  AdminForm,
  removeSectionFiles,
  uploadSectionFiles,
} from "@/pages/admin/shared/AdminEngine";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import { toastSuccess } from "@/pages/admin/shared/adminToast";
import { useCanEditSection } from "@/pages/admin/shared/sectionEditAccess";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import { type PremiumBookPageRow, usePage, useSavePage } from "./api";
import { Heading } from "./Heading";
import { PREMIUM_BOOK_PATH } from "./paths";
import type { PremiumBookAdminConfig } from "./types";
import { useLoadErrorToast } from "./useLoadErrorToast";

// 서버 업로드 규칙과 메뉴 권한이 쓰는 키(api/_lib/premium-book/uploads.ts)와 같다.
const SECTION_KEY = "premiumBookPages";
const UNSAVED_CONFIRM_TEXT =
  "저장하지 않은 변경사항이 있습니다. 나가시겠습니까?";

interface PremiumBookPageFormValues {
  sort_order: number | string;
  image_url: string;
}

// 주소로 열리는 등록(new)과 수정(:id) 화면. 수정은 새로고침해도 id 로 행을 다시 받는다.
export function PremiumBookFormPage({
  config,
}: {
  config: PremiumBookAdminConfig;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // 목록이 들고 온 검색값(쪽 번호)으로 돌아간다. 주소로 바로 열었으면 없다.
  const from = (location.state as { from?: unknown } | null)?.from;
  const listPath = `${PREMIUM_BOOK_PATH}${typeof from === "string" && from.startsWith("?") ? from : ""}`;

  // id 는 bigint identity 라 양의 정수 문자열만 요청한다.
  const validId = id === undefined || /^[1-9][0-9]{0,15}$/.test(id);
  const detail = usePage(validId ? id : undefined);
  const notFound =
    !validId ||
    (detail.error instanceof ApiError && detail.error.status === 404);
  const failed = detail.error && !notFound;
  useLoadErrorToast(failed ? detail.error : null, config.title);

  if (notFound || failed) {
    return (
      <div>
        <Heading config={config} />
        <div className="bg-white p-12 text-center shadow-sm">
          <p role="alert" className="mb-4 text-sm font-medium text-destructive">
            {notFound
              ? "페이지를 찾을 수 없어요."
              : "페이지를 불러오지 못했어요."}
          </p>
          <Button type="button" size="lg" onClick={() => navigate(listPath)}>
            목록으로
          </Button>
        </div>
      </div>
    );
  }

  if (id === undefined) {
    return <FormView key="new" config={config} listPath={listPath} />;
  }

  if (!detail.data) {
    return (
      <div>
        <Heading config={config} />
        <AdminDetailSkeleton
          rows={(config.fields ?? config.columns).length}
          label="프리미엄 책자 페이지를 불러오는 중입니다."
        />
      </div>
    );
  }

  return (
    <FormView key={id} config={config} listPath={listPath} row={detail.data} />
  );
}

function FormView({
  config,
  listPath,
  row,
}: {
  config: PremiumBookAdminConfig;
  listPath: string;
  row?: PremiumBookPageRow;
}) {
  const navigate = useNavigate();
  const save = useSavePage(row === undefined ? undefined : String(row.id));
  // view 권한이면 폼을 엔진의 readOnly 로 열어 저장 버튼을 뺀다.
  const canEdit = useCanEditSection();
  const [dirty, setDirty] = useState(false);

  // 저장 직후의 이동은 이탈로 보지 않는다.
  const savedRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !savedRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(UNSAVED_CONFIRM_TEXT)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useBeforeUnload((event) => {
    if (dirty && !savedRef.current) event.preventDefault();
  });

  async function saveRow(form: PremiumBookPageFormValues) {
    // 화면이 만드는 값만 보낸다. 번호가 비면 1 로 둔다(옛 화면과 같다).
    const payload = {
      sort_order: Number(form.sort_order) || 1,
      image_url: form.image_url || "",
    };
    try {
      await save.mutateAsync(payload);
    } catch (error) {
      reportAdminError(row ? "수정 실패" : "등록 실패", error as Error);
      return;
    }
    toastSuccess("저장 완료");
    savedRef.current = true;
    navigate(listPath);
  }

  return (
    <div>
      <Heading config={config} />
      <AdminForm
        config={canEdit ? config : { ...config, readOnly: true }}
        mode={row ? "edit" : "create"}
        row={row ?? null}
        onCancel={() => navigate(listPath)}
        onSave={saveRow}
        onUpload={(files, field) =>
          uploadSectionFiles(SECTION_KEY, files, field)
        }
        onRemoveFiles={(paths) => removeSectionFiles(SECTION_KEY, paths)}
        onDirtyChange={setDirty}
      />
    </div>
  );
}
