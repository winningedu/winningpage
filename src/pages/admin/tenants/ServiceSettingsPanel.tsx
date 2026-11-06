import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ActionButton } from "@/pages/admin/shared/formFields";
import {
  buildServiceRows,
  enableRow,
  type ServiceRowForm,
  type SettingRow,
  settingPayload,
  type UsageDefaults,
  validateServiceRow,
} from "./serviceSettings";

// ---------------------------------------------------------------------------
// 기관 서비스 설정 탭(사 #160, #164, #166, 결정 r5, r6, 98.1, 102.10, 102.16).
// 설정은 서버 경로가 아니라 브라우저 세션(RLS)으로 바로 쓴다. 변경 이력 트리거가 auth.uid() 로 변경자를 남기기 때문이다.
// 행 삭제 권한은 없다. 끄기는 enabled=false 이고, 한도를 비우면 상한 없음이다.
// ---------------------------------------------------------------------------

const TARGET_NOTICE =
  "목표관리는 이용 횟수를 세지 않아요. 한도를 넣어도 지금은 막히지 않아요.";
const TERM_MONTHS_NOTICE = "학기 길이를 먼저 정해 주세요";
const SAVE_ERROR = "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.";

interface ServiceSettingsPanelProps {
  tenantId: string;
  /** 저장된 기관 학기 길이. 학기 한도 기본값을 고르는 데 쓴다. */
  termMonths: number | null;
  isCatchAll: boolean;
}

const INPUT_CLASS = "h-9 w-full border border-gray-300 px-2 text-sm font-bold";

export default function ServiceSettingsPanel({
  tenantId,
  termMonths,
  isCatchAll,
}: ServiceSettingsPanelProps) {
  const [rows, setRows] = useState<ServiceRowForm[]>([]);
  const [defaults, setDefaults] = useState<UsageDefaults>({});
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (isCatchAll) return;
    let alive = true;
    (async () => {
      const [settings, defaultRow] = await Promise.all([
        supabase
          .from("tenant_service_settings")
          .select(
            "program_key, enabled, starts_on, ends_on, monthly_limit, term_limit",
          )
          .eq("tenant_id", tenantId),
        supabase
          .from("app_settings")
          .select("value")
          .eq("key", "b2b_usage_defaults")
          .maybeSingle(),
      ]);
      if (!alive) return;
      if (settings.error || defaultRow.error) {
        setLoadFailed(true);
        return;
      }
      setRows(buildServiceRows((settings.data ?? []) as SettingRow[]));
      setDefaults(
        ((defaultRow.data as { value?: UsageDefaults } | null)?.value ??
          {}) as UsageDefaults,
      );
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [tenantId, isCatchAll]);

  function patchRow(programKey: string, patch: Partial<ServiceRowForm>) {
    setRows((prev) =>
      prev.map((row) =>
        row.programKey === programKey ? { ...row, ...patch } : row,
      ),
    );
  }

  function setMessage(programKey: string, message: string) {
    setMessages((prev) => ({ ...prev, [programKey]: message }));
  }

  function toggle(row: ServiceRowForm, provided: boolean) {
    setMessage(row.programKey, "");
    setRows((prev) =>
      prev.map((item) =>
        item.programKey !== row.programKey
          ? item
          : provided
            ? enableRow(item, defaults, termMonths)
            : { ...item, provided: false },
      ),
    );
  }

  async function save(row: ServiceRowForm) {
    if (saving) return;
    const invalid = validateServiceRow(row);
    if (invalid) {
      setMessage(row.programKey, invalid);
      return;
    }
    setSaving(row.programKey);
    setMessage(row.programKey, "");
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      setSaving(null);
      setMessage(row.programKey, SAVE_ERROR);
      return;
    }
    const { error } = await supabase
      .from("tenant_service_settings")
      .upsert(
        settingPayload(
          tenantId,
          termMonths === null ? { ...row, termLimit: "" } : row,
          userId,
        ),
        { onConflict: "tenant_id,program_key" },
      );
    setSaving(null);
    if (error) {
      setMessage(row.programKey, SAVE_ERROR);
      return;
    }
    patchRow(row.programKey, { saved: true });
    setMessage(row.programKey, "저장했어요.");
  }

  if (isCatchAll) {
    return (
      <div className="bg-white p-6 text-sm font-bold text-gray-600 shadow-sm">
        기타 기관은 서비스를 제공하지 않아요.
      </div>
    );
  }
  if (loadFailed || !loaded) {
    return (
      <div className="bg-white p-6 text-sm font-bold text-gray-500 shadow-sm">
        {loadFailed
          ? "서비스 설정을 불러오지 못했어요."
          : "데이터를 불러오는 중입니다."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-gray-600">
        종료일을 비우면 기관 계약 기간을 따르고, 한도를 비우면 상한이 없어요.
      </p>
      {rows.map((row) => {
        const needsTerm = row.provided && termMonths === null;
        return (
          <div
            key={row.programKey}
            data-testid="service-row"
            data-program={row.programKey}
            className="bg-white p-4 shadow-sm"
          >
            <label className="flex items-center gap-2 text-sm font-black text-[#111827]">
              <input
                type="checkbox"
                aria-label={`${row.label} 제공`}
                checked={row.provided}
                onChange={(e) => toggle(row, e.target.checked)}
              />
              {row.label}
              <span className="text-xs font-bold text-gray-500">
                {row.provided ? "제공" : "제공 안 함"}
              </span>
            </label>
            {row.programKey === "target" && (
              <p className="mt-1 text-xs font-bold text-gray-500">
                {TARGET_NOTICE}
              </p>
            )}
            {row.provided && (
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <input
                  type="date"
                  aria-label={`${row.label} 시작일`}
                  value={row.startsOn}
                  onChange={(e) =>
                    patchRow(row.programKey, { startsOn: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
                <input
                  type="date"
                  aria-label={`${row.label} 종료일`}
                  value={row.endsOn}
                  onChange={(e) =>
                    patchRow(row.programKey, { endsOn: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
                <input
                  inputMode="numeric"
                  aria-label={`${row.label} 월 한도`}
                  placeholder="월 한도"
                  value={row.monthlyLimit}
                  onChange={(e) =>
                    patchRow(row.programKey, { monthlyLimit: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
                <input
                  inputMode="numeric"
                  aria-label={`${row.label} 학기 한도`}
                  placeholder="학기 한도"
                  value={needsTerm ? "" : row.termLimit}
                  disabled={needsTerm}
                  onChange={(e) =>
                    patchRow(row.programKey, { termLimit: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
              </div>
            )}
            {needsTerm && (
              <p className="mt-1 text-xs font-bold text-red-600">
                {TERM_MONTHS_NOTICE}
              </p>
            )}
            <div className="mt-3 flex items-center gap-3">
              <ActionButton
                onClick={() => save(row)}
                disabled={saving !== null}
              >
                {row.label} 저장
              </ActionButton>
              {messages[row.programKey] && (
                <span className="text-sm font-bold text-gray-700">
                  {messages[row.programKey]}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
