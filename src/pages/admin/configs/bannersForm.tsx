import HeroSection from "@/components/landing/HeroSection";
import { supabase } from "@/lib/supabase";
import type { FieldOption } from "@/pages/admin/shared/csvExport";

// ── 배너 관리(banners, home_side_banners) 공통: 노출 대상 선택지 + 저장 변환 ──

// 노출 대상 select 선택지. tenants 전체를 이름순으로 불러온다(CouponAdmin 소속 드롭다운과 같은 조회).
export async function loadTenantOptions(): Promise<FieldOption[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return (data || []).map((tenant) => ({
    value: tenant.id,
    label: tenant.name,
  }));
}

const NULLABLE_BANNER_KEYS = ["tenant_id", "start_date", "end_date"] as const;

// 비운 노출 대상/기간은 빈 문자열이 아니라 null 로 저장한다(uuid, date 컬럼은 ""를 받지 못한다).
export function bannerFormToPayload(
  form: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...form };
  for (const key of NULLABLE_BANNER_KEYS) {
    if (key in payload && !payload[key]) payload[key] = null;
  }
  return payload;
}

// ── 폼 사이드 미리보기: 공개 홈과 같은 HeroSection 으로 입력값 한 장을 그린다 ──

interface BannerFormPreviewProps {
  form: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function PreviewFrame({
  hasImage,
  children,
}: {
  hasImage: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white p-5 shadow-sm">
      <h2 className="text-sm font-black">미리보기</h2>
      <p className="mt-1 text-xs font-bold leading-5 text-gray-500">
        홈 화면에 노출되는 모습입니다. 저장 전에 확인하세요.
      </p>
      <div className="mt-3">
        {hasImage ? (
          children
        ) : (
          <p className="text-xs font-bold text-gray-500">
            이미지를 등록하면 미리보기가 표시됩니다.
          </p>
        )}
      </div>
    </section>
  );
}

export function BannerFormPreview({ form }: BannerFormPreviewProps) {
  const imageUrl = text(form.image_url);
  const title = text(form.title);
  const link = text(form.button_link);
  return (
    <PreviewFrame hasImage={Boolean(imageUrl)}>
      <HeroSection
        banners={[
          {
            image_url: imageUrl,
            ...(title ? { title } : {}),
            ...(link ? { button_link: link } : {}),
          },
        ]}
      />
    </PreviewFrame>
  );
}

export function SideBannerFormPreview({ form }: BannerFormPreviewProps) {
  const imageUrl = text(form.image_url);
  const mobileImageUrl = text(form.mobile_image_url);
  const title = text(form.title);
  const link = text(form.link_url);
  return (
    <PreviewFrame hasImage={Boolean(imageUrl || mobileImageUrl)}>
      <HeroSection
        sideBanners={[
          {
            ...(imageUrl ? { image_url: imageUrl } : {}),
            ...(mobileImageUrl ? { mobile_image_url: mobileImageUrl } : {}),
            ...(title ? { title } : {}),
            ...(link ? { link_url: link } : {}),
            open_new_window: form.open_new_window === true,
          },
        ]}
      />
    </PreviewFrame>
  );
}
