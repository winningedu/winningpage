import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError } from "@/lib/http/client";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  fetchRole,
  fetchRoles,
  type Level,
  type Resource,
  type RoleWithPermissions,
  roleKeys,
} from "./api";
import { LEVEL_CHOICES, type LevelDraft, toDraft } from "./levels";

const ROLES_PATH = "/admin/adminRoles";

// 접근 수준은 라디오 3종이다. "선택 안 함"은 별도 상태가 아니라 **행이 없는 것**이고,
// 그때 최종 권한은 접근 불가다(규칙 3: default deny). 그래서 UI 에서도 4번째 칸
// "미지정"을 두고, 그걸 고르면 해당 행을 지운다. 'none'(명시적 차단)과 다르다.
// 둘의 차이는 개별 권한에서 드러난다. 'none' 은 묶음이 준 권한을 이기지만(deny-wins),
// '미지정'은 아무 말도 하지 않는 것이다.

interface Props {
  config: { title: string };
}

// 주소의 :roleId 로 묶음을 불러온다(새로고침해도 같은 화면이 열린다). new 는 빈 묶음이다.
export function RoleEditorRoute({ config }: Props) {
  const { roleId } = useParams();
  const detail = useQuery({
    queryKey: roleKeys.detail(roleId ?? ""),
    queryFn: ({ signal }) => fetchRole(roleId ?? "", signal),
    enabled: Boolean(roleId),
  });
  // 메뉴 목록은 목록과 같은 응답이다.
  const options = useQuery({
    queryKey: roleKeys.list,
    queryFn: ({ signal }) => fetchRoles(signal),
  });

  const error = detail.error ?? options.error;
  const notFound = error instanceof ApiError && error.status === 404;

  useEffect(() => {
    if (error && !notFound)
      reportAdminError(`${config.title} 조회 실패`, error);
  }, [error, notFound, config.title]);

  const loading = Boolean(roleId) && detail.isPending;
  if (!error && (loading || options.isPending)) {
    return (
      <div
        role="status"
        className="bg-white p-12 text-center text-sm font-medium text-muted-foreground shadow-sm"
      >
        데이터를 불러오는 중입니다.
      </div>
    );
  }

  if (!options.data || (roleId && !detail.data)) {
    return (
      <div className="bg-white p-12 text-center text-sm font-medium text-muted-foreground shadow-sm">
        <p>
          {notFound
            ? "권한 묶음을 찾을 수 없습니다."
            : "권한 묶음을 불러오지 못했습니다."}
        </p>
        <Link
          to={ROLES_PATH}
          className="mt-4 inline-block font-semibold text-foreground underline"
        >
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <RoleEditor
      key={roleId ?? "new"}
      role={detail.data ?? null}
      resources={options.data.resources}
    />
  );
}

interface EditorProps {
  role: RoleWithPermissions | null;
  resources: Resource[];
}

function RoleEditor({ role, resources }: EditorProps) {
  const navigate = useNavigate();
  const [nameDraft, setNameDraft] = useState(role?.name ?? "");
  const [descDraft, setDescDraft] = useState(role?.description ?? "");
  const [permDraft, setPermDraft] = useState<LevelDraft>(() =>
    toDraft(role?.permissions ?? []),
  );

  // 대분류 에서 메뉴. admin_resources 는 sort_order 로 이미 정렬돼 있어 삽입 순서가
  // 곧 표시 순서다(Map 은 삽입 순서를 보존한다).
  const grouped = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const resource of resources) {
      const list = map.get(resource.group_title) || [];
      list.push(resource);
      map.set(resource.group_title, list);
    }
    return map;
  }, [resources]);

  function setLevel(resourceKey: string, level: Level | "") {
    setPermDraft((prev) => {
      const next = { ...prev };
      if (level === "") delete next[resourceKey];
      else next[resourceKey] = level;
      return next;
    });
  }

  // 대분류 한 줄을 한 번에 지정한다. 메뉴가 48개라 하나씩 찍으면 실수하기 쉽다.
  function setGroupLevel(groupTitle: string, level: Level | "") {
    const keys = (grouped.get(groupTitle) || []).map((r) => r.key);
    setPermDraft((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        if (level === "") delete next[key];
        else next[key] = level;
      }
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          {role ? "권한 묶음 수정" : "권한 묶음 등록"}
        </h1>
        <div className="flex gap-2">
          <ActionButton variant="light" onClick={() => navigate(ROLES_PATH)}>
            취소
          </ActionButton>
          <ActionButton>저장</ActionButton>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 bg-white p-6 shadow-sm">
        <Field label="권한 묶음 이름">
          <TextInput value={nameDraft} onChange={setNameDraft} />
        </Field>
        <Field label="설명">
          <TextInput value={descDraft} onChange={setDescDraft} />
        </Field>
      </div>

      {role?.is_super && (
        <div className="mb-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-medium text-[#7A4A12]">
          최고 관리자 묶음은 권한 항목을 갖지 않습니다. 판정이 전 메뉴 수정
          가능으로 단락되기 때문입니다. 새 메뉴가 생겨도 자동으로 포함되므로
          아래에서 무엇을 고르든 저장돼도 판정에 쓰이지 않습니다.
        </div>
      )}

      <div className="bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_repeat(4,6.875rem)] border-b bg-muted px-5 py-3 text-sm font-semibold">
          <div>메뉴</div>
          {LEVEL_CHOICES.map((choice) => (
            <div key={choice.value} className="text-center">
              {choice.label}
            </div>
          ))}
        </div>

        {[...grouped.entries()].map(([groupTitle, items]) => (
          <div key={groupTitle}>
            <div className="grid grid-cols-[1fr_repeat(4,6.875rem)] items-center border-b bg-muted/50 px-5 py-2">
              <div className="text-sm font-semibold">{groupTitle}</div>
              {LEVEL_CHOICES.map((choice) => (
                <div key={choice.value} className="text-center">
                  <button
                    type="button"
                    onClick={() => setGroupLevel(groupTitle, choice.value)}
                    aria-label={`${groupTitle} ${choice.label} 일괄`}
                    className="text-xs font-medium text-primary underline"
                  >
                    일괄
                  </button>
                </div>
              ))}
            </div>

            {items.map((resource) => (
              <div
                key={resource.key}
                className="grid grid-cols-[1fr_repeat(4,6.875rem)] items-center border-b px-5 py-2 last:border-b-0"
              >
                <div className="text-sm">
                  {resource.label}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {resource.key}
                  </span>
                </div>
                {LEVEL_CHOICES.map((choice) => (
                  <div key={choice.value} className="text-center">
                    <input
                      type="radio"
                      name={`level-${resource.key}`}
                      aria-label={`${resource.label} ${choice.label}`}
                      className="accent-primary"
                      checked={(permDraft[resource.key] ?? "") === choice.value}
                      onChange={() => setLevel(resource.key, choice.value)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
