import { useEffect, useMemo, useRef, useState } from "react";
import {
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
} from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  toastError,
  toastSuccess,
  toastWarning,
} from "@/pages/admin/shared/adminToast";
import { useCanEditSection } from "@/pages/admin/shared/sectionEditAccess";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import {
  type CouponRow,
  mappedErrorText,
  useCoupon,
  useCouponList,
  useLoadErrorToast,
  useSaveCoupon,
} from "./api";
import {
  boolText,
  COUPON_SAVE_ERROR_TEXT,
  dateTimeText,
  FIELD_LABEL,
  FieldName,
  GIFT_CODE_PRESET_HINT_TEXT,
  GRANT_TYPE_LABEL,
  GRANT_TYPES,
  INPUT_CLASS,
  moneyText,
  ORG_CODE_GRANTED_CONFLICT_TEXT,
  ORG_CODE_HELPER_TEXT,
  SLUG_DUPLICATE_TEXT,
  TITLE,
  UNSAVED_CONFIRM_TEXT,
} from "./copy";
import {
  type CouponForm,
  emptyForm,
  FORM_KEYS,
  formToPayload,
  generateGiftCode,
  NULLABLE_KEYS,
  rowToForm,
  validateForm,
} from "./form";
import { NullableField } from "./NullableField";
import { COUPONS_PATH } from "./paths";

// 주소로 열리는 등록(new)과 수정(:id/edit) 화면. 수정은 새로고침해도 id 로 쿠폰을 다시 받는다.
export default function CouponFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useCoupon(id);
  useLoadErrorToast(detail.error);

  // 없는 쿠폰이나 잘못된 id 면 빈 폼을 두지 않고 목록으로 보낸다.
  useEffect(() => {
    if (detail.error) navigate(COUPONS_PATH, { replace: true });
  }, [detail.error, navigate]);

  if (id === undefined)
    return <CouponFormView key="new" initial={emptyForm()} />;

  if (!detail.data) {
    return (
      <div>
        <h1 className="mb-5 text-2xl font-semibold text-foreground">
          {TITLE} 수정
        </h1>
        <AdminDetailSkeleton
          rows={FORM_KEYS.length + 1}
          label="쿠폰 정보를 불러오는 중입니다."
        />
      </div>
    );
  }

  return (
    <CouponFormView
      key={id}
      initial={rowToForm(detail.data)}
      editingRow={detail.data}
    />
  );
}

function CouponFormView({
  initial,
  editingRow,
}: {
  initial: CouponForm;
  editingRow?: CouponRow;
}) {
  const navigate = useNavigate();
  // view 권한이면 저장과 코드 생성 버튼을 그리지 않는다.
  const canEdit = useCanEditSection();
  const listQuery = useCouponList();
  const save = useSaveCoupon(editingRow?.id);
  // 저장하면 목록 캐시가 비워져 tenants 가 사라진다. 저장 중에 고른 소속이 풀리지
  // 않도록 마지막으로 받은 비어 있지 않은 선택지를 들고 있는다.
  const fetchedTenants = listQuery.data?.tenants ?? [];
  const [lastTenants, setLastTenants] = useState(fetchedTenants);
  if (fetchedTenants.length > 0 && fetchedTenants !== lastTenants)
    setLastTenants(fetchedTenants);
  const tenants = fetchedTenants.length > 0 ? fetchedTenants : lastTenants;
  const [initialForm] = useState(initial);
  const [form, setForm] = useState<CouponForm>(initial);

  // 저장 직후의 이동은 이탈로 보지 않는다.
  const savedRef = useRef(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
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

  const slugConflict = useMemo(() => {
    const slug = String(form.slug ?? "").trim();
    if (!slug) return null;
    const found = listQuery.data?.items.find((row) => row.slug === slug);
    if (!found) return null;
    if (editingRow && found.id === editingRow.id) return null;
    // 저장이 끝나기 전에 목록이 다시 와서 방금 저장한 키가 들어 있다. 내가 저장한 키는 중복이 아니다.
    if (
      (save.isPending || save.isSuccess) &&
      save.variables?.slug.trim() === slug
    )
      return null;
    return found;
  }, [
    form.slug,
    listQuery.data,
    editingRow,
    save.isPending,
    save.isSuccess,
    save.variables,
  ]);

  function patch(values: Record<string, unknown>) {
    setForm((prev) => ({ ...prev, ...values }));
  }

  // 선물 쿠폰 프리셋. 무작위 코드와 총 발행 수량 1을 한 번에 맞추고 기한은 건드리지 않는다.
  function applyGiftCodePreset() {
    patch({
      code: generateGiftCode(),
      max_redemptions_mode: "value",
      max_redemptions: 1,
    });
  }

  async function submit() {
    const invalidKey = validateForm(form);
    if (invalidKey) {
      // tenant_id 는 "안 채움"이 아니라 "조합 충돌"이라 전용 문구를 쓴다.
      if (invalidKey === "tenant_id") {
        toastWarning(ORG_CODE_GRANTED_CONFLICT_TEXT);
        return;
      }
      toastWarning(
        `${FIELD_LABEL[invalidKey] ?? invalidKey} 항목을 입력해주세요.`,
      );
      return;
    }

    if (slugConflict) {
      toastWarning(SLUG_DUPLICATE_TEXT);
      return;
    }

    try {
      await save.mutateAsync(formToPayload(form));
    } catch (error) {
      console.error(error);
      toastError(
        `${editingRow ? "수정" : "등록"} 실패`,
        mappedErrorText(error, COUPON_SAVE_ERROR_TEXT),
      );
      return;
    }

    toastSuccess("저장 완료");
    savedRef.current = true;
    navigate(COUPONS_PATH);
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold text-foreground">
        {TITLE} {editingRow ? "수정" : "등록"}
      </h1>

      <div className="bg-white shadow-sm">
        {editingRow && (
          <div className="grid grid-cols-[13.75rem_1fr] border-b border-border">
            <div className="bg-muted px-5 py-3 text-sm font-semibold">
              <FieldName k="id" />
            </div>
            <div className="px-5 py-3 font-mono text-xs">
              {editingRow.id}
              <span className="ml-3 font-sans text-xs font-bold text-gray-500">
                {dateTimeText(editingRow.created_at)}
              </span>
            </div>
          </div>
        )}

        {FORM_KEYS.map((key) => (
          <div
            key={key}
            className="grid grid-cols-[13.75rem_1fr] border-b border-border"
          >
            <div className="bg-muted px-5 py-3 text-sm font-semibold">
              <FieldName k={key} />
              {/* 필수 표시는 AdminForm 과 같은 규범(빨간 별표). NULL 을 고를 수
                  있는 3필드도 "선택 자체" 가 필수다, 비워둘 수 없다. code 는
                  비워도 되고(코드 없는 쿠폰), stackable 은 불리언이라 항상 값이
                  있다(기본 false), tenant_id 는 비우면(소속 없음) 소속 제한
                  없음(2026-08-27 org_code 기준 결정, 2026-09-22 축 전환)
                 , 셋만 별표가 없다. */}
              {key !== "code" &&
                key !== "tenant_id" &&
                key !== "stackable" &&
                key !== "grant_on_signup" && (
                  <span className="ml-1 text-red-500">*</span>
                )}
            </div>

            <div className="px-5 py-3">
              {key === "is_active" && (
                <div className="flex items-center gap-6">
                  <label className="inline-flex items-center gap-2 text-sm font-bold">
                    <input
                      type="radio"
                      name="is_active"
                      className="accent-primary"
                      checked={form.is_active === true}
                      onChange={() => patch({ is_active: true })}
                    />
                    사용
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-bold">
                    <input
                      type="radio"
                      name="is_active"
                      className="accent-primary"
                      checked={form.is_active === false}
                      onChange={() => patch({ is_active: false })}
                    />
                    미사용
                  </label>
                </div>
              )}

              {key === "stackable" && (
                // 불리언이지만 '사용/미사용' 의미가 아니라(결합 가능 여부) 그
                // 문구를 재사용하면 거짓말이 된다, 라벨 없는 체크박스로 둔다.
                // 기본은 배타(false)다: sql/55 0-c절.
                <input
                  type="checkbox"
                  aria-label={FIELD_LABEL.stackable}
                  className="accent-primary"
                  checked={form.stackable === true}
                  onChange={(e) => patch({ stackable: e.target.checked })}
                />
              )}

              {key === "grant_type" && (
                // 라벨은 GRANT_TYPE_LABEL(승인된 한국어), value(라디오가 실제로
                // 들고 있는 값)는 GRANT_TYPES 의 영문 그대로다. 저장 시에는
                // form.grant_type(영문)이 그대로 payload 로 나간다(formToPayload).
                <div className="flex items-center gap-6">
                  {GRANT_TYPES.map((value) => (
                    <label
                      key={value}
                      className="inline-flex items-center gap-2 text-sm font-bold"
                    >
                      <input
                        type="radio"
                        name="grant_type"
                        className="accent-primary"
                        checked={form.grant_type === value}
                        onChange={() =>
                          patch(
                            // sql/70 coupons_cap_derived_from_grant_type_check ,
                            // 1인당 사용 횟수는 grant_type 의 파생값이라 여기서
                            // 같이 확정한다(2026-08-12, 사용자 지시). 조건형으로
                            // 되돌리면 grant_on_signup 도 함께 끈다 ,
                            // coupons_grant_on_signup_check 가 그 조합을 금지한다.
                            value === "granted"
                              ? {
                                  grant_type: value,
                                  max_uses_per_user_mode: "value",
                                  max_uses_per_user: 1,
                                }
                              : {
                                  grant_type: value,
                                  grant_on_signup: false,
                                  max_uses_per_user_mode: "unlimited",
                                  max_uses_per_user: "",
                                },
                          )
                        }
                      />
                      <span>{GRANT_TYPE_LABEL[value] ?? value}</span>
                    </label>
                  ))}
                </div>
              )}

              {key === "grant_on_signup" && (
                // stackable 과 같은 라벨 없는 체크박스. 발급형이 아니면 켤 수
                // 없으므로(DB CHECK) 비활성화한다, "켰는데 저장이 23514 로
                // 실패하는" 화면을 만들지 않는다.
                <input
                  type="checkbox"
                  aria-label={FIELD_LABEL.grant_on_signup}
                  className="accent-primary"
                  checked={form.grant_on_signup === true}
                  disabled={form.grant_type !== "granted"}
                  onChange={(e) => patch({ grant_on_signup: e.target.checked })}
                />
              )}

              {key === "slug" && (
                <>
                  <Input
                    type="text"
                    aria-label={FIELD_LABEL.slug}
                    value={form.slug}
                    onChange={(e) => patch({ slug: e.target.value })}
                    className={`${INPUT_CLASS} font-mono ${
                      slugConflict ? "border-red-500" : ""
                    }`}
                  />
                  {slugConflict && (
                    // 문구를 지어내지 않고 "충돌한 기존 쿠폰 행" 을 그대로 보여준다.
                    <div
                      role="alert"
                      className="mt-2 border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold"
                    >
                      {SLUG_DUPLICATE_TEXT && (
                        <div className="mb-1 text-red-600">
                          {SLUG_DUPLICATE_TEXT}
                        </div>
                      )}
                      <span className="font-mono">{slugConflict.slug}</span>
                      <span className="mx-2">{slugConflict.title}</span>
                      <span className="text-blue-600">
                        {moneyText(slugConflict.discount_amount)}
                      </span>
                      <span className="ml-2 text-gray-500">
                        {boolText(slugConflict.is_active)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {key === "title" && (
                <Input
                  type="text"
                  aria-label={FIELD_LABEL.title}
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  className={INPUT_CLASS}
                />
              )}

              {key === "code" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <Input
                      type="text"
                      aria-label={FIELD_LABEL.code}
                      value={form.code}
                      onChange={(e) => patch({ code: e.target.value })}
                      className={`${INPUT_CLASS} font-mono`}
                    />
                    {canEdit && (
                      <Button
                        type="button"
                        onClick={applyGiftCodePreset}
                        variant="outline"
                        size="lg"
                      >
                        선물 쿠폰 코드 생성
                      </Button>
                    )}
                  </div>
                  <span className="text-xs font-bold text-gray-500">
                    {GIFT_CODE_PRESET_HINT_TEXT}
                  </span>
                </div>
              )}

              {key === "tenant_id" && (
                <div className="flex flex-col gap-2">
                  <NativeSelect
                    aria-label={FIELD_LABEL.tenant_id}
                    value={form.tenant_id}
                    onChange={(e) => patch({ tenant_id: e.target.value })}
                    className="w-full [&>select]:h-9"
                  >
                    <option value="">소속 없음</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <span className="text-xs font-bold text-gray-500">
                    {ORG_CODE_HELPER_TEXT}
                  </span>
                </div>
              )}

              {(key === "discount_amount" || key === "min_amount") && (
                <div className="flex items-center gap-3">
                  <span className="w-40">
                    <Input
                      type="number"
                      aria-label={FIELD_LABEL[key]}
                      min={key === "discount_amount" ? 1 : 0}
                      value={form[key]}
                      onChange={(e) =>
                        patch({ [key]: e.target.value.replace(/[^0-9]/g, "") })
                      }
                      className={INPUT_CLASS}
                    />
                  </span>
                  {/* 금액을 사람이 읽는 형태로 함께 보여준다, 자릿수 오입력
                      (2,000 과 20,000)이 이 도메인의 실제 사고 유형이었다. */}
                  <span className="text-sm font-bold text-blue-600">
                    {moneyText(form[key] === "" ? 0 : form[key])}
                  </span>
                </div>
              )}

              {NULLABLE_KEYS.includes(key) && (
                <NullableField
                  fieldKey={key}
                  type={key === "valid_until" ? "date" : "number"}
                  mode={form[`${key}_mode`]}
                  // NULLABLE_KEYS(valid_until/max_uses_per_user/max_redemptions)는
                  // 항상 string|number 필드다, boolean 필드는 이 목록에 없다.
                  value={form[key] as string | number}
                  onChange={patch}
                  // sql/70 이후 max_uses_per_user 는 grant_type 의 파생값이라
                  // (라디오 onChange 가 이미 확정) 손편집을 막는다, 항상 잠금.
                  disabled={key === "max_uses_per_user"}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button
          type="button"
          onClick={() => navigate(COUPONS_PATH)}
          variant="secondary"
          size="lg"
          className="font-semibold"
        >
          취소
        </Button>

        {canEdit && (
          <Button
            type="button"
            onClick={submit}
            disabled={save.isPending}
            size="lg"
            className="font-semibold"
          >
            저장
          </Button>
        )}
      </div>
    </div>
  );
}
