import { useQueryClient } from "@tanstack/react-query";
import { Edit3, History, Plus, RefreshCw, Users } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminTableFrame } from "@/pages/admin/shared/AdminTableFrame";
import { useCanEditSection } from "@/pages/admin/shared/sectionEditAccess";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import {
  type CouponRow,
  couponKeys,
  useCouponList,
  useLoadErrorToast,
} from "./api";
import {
  boolText,
  FieldName,
  flagMark,
  GRANT_TYPE_LABEL,
  GRANTS_ACTION_LABEL,
  HISTORY_ACTION_LABEL,
  moneyText,
  nullableText,
  TITLE,
  UNLIMITED_FALLBACK,
  UNLIMITED_LABEL,
} from "./copy";
import { COUPONS_PATH } from "./paths";

// 번호, 데이터 13열, 관리. 스켈레톤 열 수가 된다.
const LIST_COLUMN_COUNT = 15;

export default function CouponList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // view 권한이면 등록과 수정 버튼을 그리지 않는다.
  const canEdit = useCanEditSection();
  const query = useCouponList();
  useLoadErrorToast(query.error);

  const coupons: CouponRow[] = query.data?.items ?? [];
  // 부가 조회가 실패(null)해도 목록은 살리고 그 부분만 비운다.
  const redemptionStats = query.data?.redemptionStats ?? {
    byCoupon: {},
    truncated: false,
  };
  const grantedCouponIds = useMemo(
    () => new Set(query.data?.grantedCouponIds ?? []),
    [query.data],
  );
  // 응답이 없는 동안만 스켈레톤이다. 창 포커스 재조회는 행을 그대로 둔다.
  const loading = query.isPending;

  return (
    <>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <Button
            type="button"
            onClick={() =>
              queryClient.resetQueries({ queryKey: couponKeys.list() })
            }
            variant="outline"
            size="lg"
          >
            <RefreshCw size={14} />
            초기화
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{TITLE}</h1>

          {canEdit && (
            <Button
              type="button"
              onClick={() => navigate(`${COUPONS_PATH}/new`)}
              size="lg"
              className="font-semibold"
            >
              <Plus size={14} />
              등록
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <AdminTableSkeleton
          columns={LIST_COLUMN_COUNT}
          label="쿠폰 목록을 불러오는 중입니다."
        />
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="mb-4 text-sm font-bold text-gray-500">
            전체 <span className="text-blue-600">{coupons.length}</span>건
          </div>

          <AdminTableFrame label="쿠폰 목록" className="min-w-285">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  scope="col"
                  className="w-14 px-3 py-3 text-left font-semibold whitespace-normal"
                >
                  번호
                </TableHead>
                {[
                  "slug",
                  "title",
                  "kind",
                  "discount_amount",
                  "min_amount",
                  "valid_until",
                  "max_uses_per_user",
                  "max_redemptions",
                  "stackable",
                  "grant_type",
                  "grant_on_signup",
                  "used",
                  "is_active",
                ].map((key) => (
                  <TableHead
                    scope="col"
                    key={key}
                    className={`px-3 py-3 font-semibold whitespace-normal ${
                      key === "discount_amount" || key === "min_amount"
                        ? "text-right"
                        : "text-left"
                    }`}
                  >
                    <FieldName k={key} />
                  </TableHead>
                ))}
                {/* 관리 칼럼을 sticky 로 고정한다. 칼럼이 12개라 1440 이하에서
                        표가 컨테이너보다 넓어지는데(페이지 가로 스크롤은 0 이지만
                        표 안에서 잘린다), 액션이 오른쪽 끝에 있어 기본 화면에서
                        보이지 않으면 발급,이력 진입점이 없는 화면이 된다. */}
                <TableHead
                  scope="col"
                  className="sticky right-0 w-28 bg-background px-3 py-3 text-center font-semibold whitespace-normal"
                >
                  관리
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {coupons.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={15}
                    className="py-12 text-center text-muted-foreground whitespace-normal"
                  >
                    등록된 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                coupons.map((row, index) => {
                  const used = redemptionStats.byCoupon[row.id] || {
                    active: 0,
                    total: 0,
                  };

                  return (
                    <TableRow
                      key={row.id}
                      className={`group border-gray-100 hover:bg-muted ${
                        row.is_active ? "" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {index + 1}
                      </TableCell>

                      {/* slug 단독으로 판단하지 않도록 금액을 같은 셀에 붙여
                              보여준다, 'signup-6000' 이 실제로 2,000원이던
                              사고(sql/55 P1-2)가 여기서 반복되지 않게 하는 지점이다. */}
                      <TableCell className="px-3 py-3 whitespace-normal">
                        <div className="font-mono text-[0.8125rem] font-bold">
                          {row.slug}
                        </div>
                        <div className="text-xs font-bold text-blue-600">
                          {moneyText(row.discount_amount)}
                        </div>
                        {row.code && (
                          <div className="font-mono text-xs text-gray-500">
                            {row.code}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="px-3 py-3 whitespace-normal">
                        {row.title}
                      </TableCell>
                      {/* 파생 칼럼(DB 컬럼 아님), tenant_id 가 있으면 단체,
                              없고 code+총 발행 수량 1이면 선물, 그 외 할인
                              (2026-08-27 org_code 기준 결정, 2026-09-22
                              tenant_id 로 축 전환. 세 종류를 한눈에 구분). */}
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {row.tenant_id
                          ? "단체"
                          : row.code && row.max_redemptions === 1
                            ? "선물"
                            : "할인"}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                        {moneyText(row.discount_amount)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                        {moneyText(row.min_amount)}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {row.valid_until ??
                          UNLIMITED_LABEL ??
                          UNLIMITED_FALLBACK}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {nullableText(row.max_uses_per_user)}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {nullableText(row.max_redemptions)}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {flagMark(row.stackable)}
                      </TableCell>

                      {/* 표시는 GRANT_TYPE_LABEL(승인된 한국어 라벨), DB 값
                              auto/granted 는 이 칼럼에 노출하지 않는다. 폼의 라디오도
                              같은 매핑을 쓰므로 화면 사이에서 말이 바뀌지 않는다. */}
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {GRANT_TYPE_LABEL[row.grant_type] ?? row.grant_type}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {flagMark(row.grant_on_signup)}
                      </TableCell>

                      {/* 유효 건수 / 전체 건수(무효화 포함)를 둘 다 보여준다,
                              void 한 이력이 사라지지 않는 것이 이 도메인의 원칙이라
                              전체만 보이면 "왜 소진인데 쓸 수 있나" 를, 유효만 보이면
                              "되돌린 기록" 을 각각 놓친다. */}
                      <TableCell className="px-3 py-3 font-mono text-[0.8125rem] whitespace-normal">
                        {used.active} / {used.total}
                        {redemptionStats.truncated && "+"}
                      </TableCell>

                      <TableCell className="px-3 py-3 whitespace-normal">
                        {boolText(row.is_active)}
                      </TableCell>

                      <TableCell
                        className={`sticky right-0 px-3 py-3 whitespace-normal ${
                          row.is_active
                            ? "bg-background group-hover:bg-muted"
                            : "bg-muted"
                        }`}
                      >
                        <div className="flex justify-center gap-3">
                          {/* 수정 아이콘은 AdminTable(:4674)의 기존 액션과
                                  같은 아이콘, 같은 무라벨 규범을 그대로 따른다. */}
                          {canEdit && (
                            <Button
                              aria-label="수정"
                              type="button"
                              onClick={() =>
                                navigate(`${COUPONS_PATH}/${row.id}/edit`)
                              }
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground"
                            >
                              <Edit3 size={17} />
                            </Button>
                          )}

                          <Button
                            type="button"
                            onClick={() =>
                              navigate(`${COUPONS_PATH}/${row.id}/history`)
                            }
                            aria-label={HISTORY_ACTION_LABEL ?? undefined}
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground"
                          >
                            <History size={17} />
                          </Button>

                          {/* 발급 관리는 발급형이거나(신규 발급 가능), 과거에
                                  조건형으로 전환된 뒤에도 살아있는(회수 안 된)
                                  발급 이력이 남아 있으면 보여준다, 전환된 쿠폰의
                                  이력 접근을 끊지 않는다(요구사항 ⑥). 둘 다
                                  아니면 "눌렀는데 아무도 없는" 빈 화면이거나,
                                  발급 시 WC004 로만 실패하는 버튼이 된다, 아예
                                  그리지 않는다. */}
                          {(row.grant_type === "granted" ||
                            grantedCouponIds.has(row.id)) && (
                            <Button
                              type="button"
                              onClick={() =>
                                navigate(`${COUPONS_PATH}/${row.id}/grants`)
                              }
                              aria-label={GRANTS_ACTION_LABEL ?? undefined}
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground"
                            >
                              <Users size={17} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </AdminTableFrame>
        </div>
      )}
    </>
  );
}
