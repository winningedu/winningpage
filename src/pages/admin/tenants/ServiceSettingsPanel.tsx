import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/pages/admin/shared/formFields";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import { fetchServiceSettings, putServiceSetting } from "./api";
import {
  buildServiceRows,
  enableRow,
  type ServiceRowForm,
  type SettingRow,
  settingPayload,
  type UsageDefaults,
  validateServiceRow,
} from "./serviceSettings";
import { tenantKeys } from "./tenantQueries";

// ---------------------------------------------------------------------------
// 기관 서비스 설정 탭(사 #160, #164, #166, 결정 r5, r6, 98.1, 102.10, 102.16).
// 조회와 저장은 서버 경로(admin/tenants/service-settings)로 한다. 변경자는 서버가 세션에서 채운다.
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

// 서비스 설정 행 수(학습진단, 목표관리, 성장설계, 수행평가, 심화탐구, 자기평가). 스켈레톤 행 수가 된다.
const SERVICE_COUNT = 6;

const INPUT_CLASS = "h-9";

export default function ServiceSettingsPanel({
  tenantId,
  termMonths,
  isCatchAll,
}: ServiceSettingsPanelProps) {
  // 폼 상태가 조회 결과로 한 번 만들어지므로, 다시 들어오면 캐시를 쓰지 않고 새로 받는다.
  const query = useQuery({
    queryKey: tenantKeys.serviceSettings(tenantId),
    queryFn: ({ signal }) => fetchServiceSettings(tenantId, signal),
    enabled: !isCatchAll,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  if (isCatchAll) {
    return (
      <div className="bg-white p-6 text-sm font-medium text-gray-600 shadow-sm">
        기타 기관은 서비스를 제공하지 않아요.
      </div>
    );
  }
  if (!query.data) {
    if (!query.isError) {
      return (
        <AdminDetailSkeleton
          rows={SERVICE_COUNT}
          label="서비스 설정을 불러오는 중입니다."
        />
      );
    }
    return (
      <div className="bg-white p-6 text-sm font-medium text-gray-500 shadow-sm">
        서비스 설정을 불러오지 못했어요.
      </div>
    );
  }
  return (
    <ServiceSettingsForm
      tenantId={tenantId}
      termMonths={termMonths}
      settings={query.data.items}
      defaults={query.data.defaults}
    />
  );
}

interface ServiceSettingsFormProps {
  tenantId: string;
  termMonths: number | null;
  settings: SettingRow[];
  defaults: UsageDefaults;
}

function ServiceSettingsForm({
  tenantId,
  termMonths,
  settings,
  defaults,
}: ServiceSettingsFormProps) {
  const [rows, setRows] = useState<ServiceRowForm[]>(() =>
    buildServiceRows(settings),
  );
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (body: Parameters<typeof putServiceSetting>[0]) =>
      putServiceSetting(body),
  });

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

  function save(row: ServiceRowForm) {
    if (saving) return;
    const invalid = validateServiceRow(row);
    if (invalid) {
      setMessage(row.programKey, invalid);
      return;
    }
    setSaving(row.programKey);
    setMessage(row.programKey, "");
    saveMutation.mutate(
      settingPayload(
        tenantId,
        termMonths === null ? { ...row, termLimit: "" } : row,
      ),
      {
        onSuccess: () => {
          patchRow(row.programKey, { saved: true });
          setMessage(row.programKey, "저장했어요.");
        },
        onError: () => setMessage(row.programKey, SAVE_ERROR),
        onSettled: () => setSaving(null),
      },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-600">
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
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                aria-label={`${row.label} 제공`}
                checked={row.provided}
                onChange={(e) => toggle(row, e.target.checked)}
              />
              {row.label}
              <span className="text-xs font-medium text-gray-500">
                {row.provided ? "제공" : "제공 안 함"}
              </span>
            </label>
            {row.programKey === "target" && (
              <p className="mt-1 text-xs font-medium text-gray-500">
                {TARGET_NOTICE}
              </p>
            )}
            {row.provided && (
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Input
                  type="date"
                  aria-label={`${row.label} 시작일`}
                  value={row.startsOn}
                  onChange={(e) =>
                    patchRow(row.programKey, { startsOn: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
                <Input
                  type="date"
                  aria-label={`${row.label} 종료일`}
                  value={row.endsOn}
                  onChange={(e) =>
                    patchRow(row.programKey, { endsOn: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
                <Input
                  inputMode="numeric"
                  aria-label={`${row.label} 월 한도`}
                  placeholder="월 한도"
                  value={row.monthlyLimit}
                  onChange={(e) =>
                    patchRow(row.programKey, { monthlyLimit: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
                <Input
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
              <p className="mt-1 text-xs font-medium text-red-600">
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
                <span className="text-sm font-medium text-gray-700">
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
