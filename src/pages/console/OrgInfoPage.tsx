// W17 내정보관리(스펙 3절). 입력, 확인, 조회 전용 세 단계.
// 최종확인은 저장(PATCH) 뒤 확정(POST confirm) 두 번 호출한다(결정 47). 확정이 실패하면 다시 누르면 된다.
// 본사 대행은 읽기만 한다(결정 48). 검사 패턴은 서버 api/_routes/console/org-info.ts 와 같다.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { HOMEPAGE_PREFIX, withoutBareScheme } from "@/lib/homepage";
import { cn } from "@/lib/utils";
import { consoleRequest, errorCode } from "./api";
import Notice from "./Notice";
import PageHeader from "./PageHeader";
import { SAVE_FAILED_MESSAGE } from "./passwordRule";
import TextField from "./TextField";
import { useToast } from "./Toast";
import { useConsoleMe } from "./useConsoleMe";

const MAX_LENGTH = 200;
const PHONE = /^[0-9-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOMEPAGE = /^https?:\/\/\S+$/;

const PHONE_ERROR = "숫자와 하이픈만 쓸 수 있어요. 예: 02-123-4567";

const FIELDS = [
  { key: "name", label: "교육기관명(필수)", required: true },
  { key: "address", label: "주소" },
  { key: "mainPhone", label: "대표번호", pattern: PHONE, error: PHONE_ERROR },
  {
    key: "contactPhone",
    label: "담당자 전화",
    pattern: PHONE,
    error: PHONE_ERROR,
  },
  {
    key: "contactMobile",
    label: "담당자 핸드폰",
    pattern: PHONE,
    error: PHONE_ERROR,
  },
  {
    key: "homepage",
    label: "홈페이지 주소",
    pattern: HOMEPAGE,
    error:
      "주소 형식이 맞지 않아요. http:// 또는 https://로 시작하게 써 주세요",
  },
  {
    key: "contactEmail",
    label: "담당자 이메일",
    pattern: EMAIL,
    error: "이메일 형식이 맞지 않아요. 예: manager@hanbit.hs.kr",
  },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Values = Record<FieldKey, string>;
type Mode = "edit" | "confirm" | "locked";

interface OrgInfo extends Record<FieldKey, string | null> {
  code: string;
  infoConfirmedAt: string | null;
}

function validate(values: Values): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  for (const field of FIELDS) {
    const value = values[field.key].trim();
    if ("required" in field && value === "") {
      errors[field.key] = "교육기관명을 입력해 주세요";
    } else if (value.length > MAX_LENGTH) {
      errors[field.key] = `${MAX_LENGTH}자 이하로 써 주세요`;
    } else if (
      "pattern" in field &&
      value !== "" &&
      !field.pattern.test(value)
    ) {
      errors[field.key] = field.error;
    }
  }
  return errors;
}

const ROWS: [FieldKey, FieldKey | "code"][] = [
  ["name", "address"],
  ["mainPhone", "contactPhone"],
  ["contactMobile", "homepage"],
  ["contactEmail", "code"],
];
const labelOf = (key: FieldKey) =>
  FIELDS.find((f) => f.key === key)?.label ?? key;

export default function OrgInfoPage() {
  const { me, reload } = useConsoleMe();
  const toast = useToast();
  const proxy = me.kind === "hq_proxy";
  const [code, setCode] = useState<string | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await consoleRequest("/api/console/org-info");
      if (res.status !== 200) throw new Error(`org-info ${res.status}`);
      const info = res.body as OrgInfo;
      setCode(info.code);
      const loaded = Object.fromEntries(
        FIELDS.map((f) => [f.key, info[f.key] ?? ""]),
      ) as Values;
      if (!proxy && !info.infoConfirmedAt && loaded.homepage === "") {
        loaded.homepage = HOMEPAGE_PREFIX;
      }
      setValues(loaded);
      setMode(info.infoConfirmedAt ? "locked" : "edit");
      setErrors({});
    } catch {
      setLoadFailed(true);
    }
  }, [proxy]);
  useEffect(() => {
    void load();
  }, [load]);

  if (loadFailed) {
    return (
      <>
        <PageHeader title="내정보관리" />
        <div className="flex flex-col items-start gap-3 px-4 md:px-8 lg:px-12">
          <Notice tone="Danger">
            기관 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
          </Notice>
          <Button onClick={() => void load()}>다시 시도</Button>
        </div>
      </>
    );
  }

  const readOnly = proxy || mode !== "edit";
  const locked = proxy || mode === "locked";
  const trimmed = (v: Values) =>
    Object.fromEntries(FIELDS.map((f) => [f.key, v[f.key].trim()]));

  const toConfirm = () => {
    if (!values) return;
    const cleaned = { ...values, homepage: withoutBareScheme(values.homepage) };
    setValues(cleaned);
    const found = validate(cleaned);
    setErrors(found);
    if (Object.keys(found).length === 0) setMode("confirm");
  };

  const finalSave = async () => {
    if (!values) return;
    setSaving(true);
    try {
      const patch = await consoleRequest("/api/console/org-info", {
        method: "PATCH",
        body: trimmed(values),
      });
      if (
        patch.status === 409 &&
        errorCode(patch.body) === "ALREADY_CONFIRMED"
      ) {
        await load();
        return;
      }
      if (patch.status === 400) {
        setMode("edit");
        setErrors(validate(values));
        return;
      }
      if (patch.status !== 200)
        throw new Error(`org-info patch ${patch.status}`);
      const confirm = await consoleRequest("/api/console/org-info/confirm", {
        method: "POST",
      });
      if (
        confirm.status === 409 &&
        errorCode(confirm.body) === "ALREADY_CONFIRMED"
      ) {
        await load();
        return;
      }
      if (confirm.status !== 200)
        throw new Error(`org-info confirm ${confirm.status}`);
      setMode("locked");
      await reload();
    } catch {
      toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (key: FieldKey | "code") => {
    if (key === "code") return "border-0 bg-surface-muted text-ink-sub";
    if (locked) return "bg-surface-muted text-ink-sub";
    if (mode === "confirm") return "text-ink-sub";
    return undefined;
  };

  return (
    <>
      <PageHeader
        title="내정보관리"
        subtitle={
          mode === "confirm" && !proxy
            ? "최종확인으로 저장하면 조회 전용이 돼요. 바꾸려면 본사에 요청해야 해요"
            : "교육기관 기본 정보를 등록하고 조회합니다"
        }
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "edit" && !proxy) toConfirm();
        }}
        className="flex max-w-content flex-col gap-5 px-4 md:gap-6 md:px-8 lg:px-12"
      >
        {values && (
          <div className="flex flex-col gap-5">
            {ROWS.map(([left, right]) => (
              <div key={left} className="grid gap-5 md:grid-cols-2 md:gap-4">
                <TextField
                  label={labelOf(left)}
                  value={values[left]}
                  readOnly={readOnly}
                  error={errors[left]}
                  inputClassName={inputClass(left)}
                  onChange={(e) =>
                    setValues({ ...values, [left]: e.target.value })
                  }
                />
                {right === "code" ? (
                  <TextField
                    label="소속코드"
                    value={code ?? ""}
                    disabled
                    inputClassName={inputClass("code")}
                  />
                ) : (
                  <TextField
                    label={labelOf(right)}
                    value={values[right]}
                    readOnly={readOnly}
                    error={errors[right]}
                    inputClassName={inputClass(right)}
                    onChange={(e) =>
                      setValues({ ...values, [right]: e.target.value })
                    }
                  />
                )}
              </div>
            ))}
            <p className="text-app-label text-ink-sub">
              {locked
                ? "입력값은 모두 조회만 가능해요"
                : "소속코드는 바꿀 수 없어요"}
            </p>
          </div>
        )}
        {values && mode === "locked" && (
          <Notice tone="Info">
            저장했어요. 이제 조회만 할 수 있어요. 바꾸려면 본사에 요청해 주세요
          </Notice>
        )}
        {values && !proxy && mode === "edit" && (
          <div className="flex">
            <Button
              type="submit"
              className={cn(buttonBase, "bg-primary text-primary-foreground")}
            >
              저장
            </Button>
          </div>
        )}
        {values && !proxy && mode === "confirm" && (
          <div className="flex gap-2 max-md:flex-col">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                if (values.homepage === "") {
                  setValues({ ...values, homepage: HOMEPAGE_PREFIX });
                }
                setMode("edit");
              }}
              className={cn(buttonBase, "border-line text-primary")}
            >
              수정하기
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void finalSave()}
              className={cn(buttonBase, "bg-primary text-primary-foreground")}
            >
              최종확인(저장)
            </Button>
          </div>
        )}
      </form>
    </>
  );
}

const buttonBase =
  "h-11 rounded-lg px-5 text-app-label font-semibold max-md:w-full md:h-10";
