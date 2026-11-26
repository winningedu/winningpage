import { Ban, Check, ChevronLeft, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminTableFrame } from "@/pages/admin/shared/AdminTableFrame";
import { toastError, toastSuccess } from "@/pages/admin/shared/adminToast";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import {
  mappedErrorText,
  type RedemptionRow,
  useCoupon,
  useLoadErrorToast,
  useRedemptions,
  useVoidRedemption,
} from "./api";
import {
  BACK_ACTION_LABEL,
  boolText,
  dateTimeText,
  FIELD_LABEL,
  FieldName,
  INPUT_CLASS,
  moneyText,
  TITLE,
  VOID_ACTION_LABEL,
  VOID_ERROR_TEXT,
  VOID_REASON_PLACEHOLDER,
} from "./copy";
import { COUPONS_PATH } from "./paths";

// 번호, 데이터 6열, 관리. 스켈레톤 열 수가 된다.
const HISTORY_COLUMN_COUNT = 8;

// 쿠폰 하나의 사용 이력. 쿠폰 머리글과 이력을 주소의 id 로 각각 받아 새로고침에도 열린다.
export default function CouponHistory() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const couponQuery = useCoupon(id);
  const query = useRedemptions(id);
  useLoadErrorToast(query.error);
  const voidRedemption = useVoidRedemption(id);

  const coupon = couponQuery.data;
  const historyRows = query.data?.items ?? [];
  // 응답이 없는 동안만 스켈레톤이다. 창 포커스 재조회는 행을 그대로 둔다.
  const historyLoading = query.isPending;
  // 무효화는 삭제가 아니라 사유 입력을 한 단계 끼우는 2단계 액션이다.
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");

  async function submitVoid(row: RedemptionRow) {
    try {
      await voidRedemption.mutateAsync({
        redemptionId: row.id,
        reason: voidReason,
      });
    } catch (error) {
      // 원본은 콘솔에 남기고 화면에는 매핑된 문구만 보인다.
      console.error(error);
      toastError("수정 실패", mappedErrorText(error, VOID_ERROR_TEXT));
      return;
    }

    setVoidingId(null);
    setVoidReason("");
    toastSuccess("저장 완료");
  }

  return (
    <>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => navigate(COUPONS_PATH)}
            aria-label={BACK_ACTION_LABEL ?? undefined}
            variant="outline"
            size="icon-lg"
          >
            <ChevronLeft size={15} />
          </Button>

          <h1 className="text-xl font-semibold">{TITLE}</h1>
        </div>

        {/* 어느 쿠폰의 이력인지, 값(데이터)만으로 식별한다. */}
        {coupon && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
            <span className="font-mono text-[0.8125rem]">{coupon.slug}</span>
            <span>{coupon.title}</span>
            <span className="text-blue-600">
              {moneyText(coupon.discount_amount)}
            </span>
            <span className="text-gray-500">{boolText(coupon.is_active)}</span>
          </div>
        )}
      </div>

      {historyLoading ? (
        <AdminTableSkeleton
          columns={HISTORY_COLUMN_COUNT}
          label="사용 이력을 불러오는 중입니다."
        />
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="mb-4 text-sm font-bold text-gray-500">
            전체 <span className="text-blue-600">{historyRows.length}</span>건
          </div>

          <AdminTableFrame label="사용 이력" className="min-w-250">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  scope="col"
                  className="w-14 px-3 py-3 text-left font-semibold whitespace-normal"
                >
                  번호
                </TableHead>
                {[
                  "order_id",
                  "user",
                  "discount_amount",
                  "created_at",
                  "voided_at",
                  "void_reason",
                ].map((key) => (
                  <TableHead
                    scope="col"
                    key={key}
                    className="px-3 py-3 text-left font-semibold whitespace-normal"
                  >
                    <FieldName k={key} />
                  </TableHead>
                ))}
                <TableHead
                  scope="col"
                  className="sticky right-0 border-l border-gray-200 bg-white w-24 px-3 py-3 text-center font-semibold whitespace-normal"
                >
                  관리
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {historyRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-muted-foreground whitespace-normal"
                  >
                    등록된 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                historyRows.map((row, index) => {
                  const profile = row.user;
                  const voided = row.voided_at !== null;

                  return (
                    <TableRow
                      key={row.id}
                      className={`border-b border-gray-100 ${voided ? "text-muted-foreground" : ""}`}
                    >
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {historyRows.length - index}
                      </TableCell>

                      <TableCell className="px-3 py-3 font-mono text-xs whitespace-normal">
                        {row.order_id}
                      </TableCell>

                      <TableCell className="px-3 py-3 whitespace-normal">
                        {row.user_id ? (
                          <>
                            <div className="font-bold">
                              {profile?.name || profile?.email || "-"}
                            </div>
                            <div className="font-mono text-xs text-gray-500">
                              {row.user_id}
                            </div>
                          </>
                        ) : (
                          "-"
                        )}
                      </TableCell>

                      <TableCell className="px-3 py-3 whitespace-normal">
                        {moneyText(row.discount_amount)}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {dateTimeText(row.created_at)}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {dateTimeText(row.voided_at)}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {row.void_reason || "-"}
                      </TableCell>

                      <TableCell className="sticky right-0 border-l border-gray-100 bg-white px-3 py-3 whitespace-normal">
                        {voided ? (
                          <div className="text-center text-gray-300">-</div>
                        ) : voidingId === row.id ? (
                          // 2단계 액션. 확인 문구(window.confirm)를 쓰려면 새
                          // 한국어 문구가 필요한데 '정말 삭제하시겠습니까?' 는
                          // void 가 삭제가 아니라서 거짓말이 된다. 대신 사유
                          // 입력을 한 단계 끼워 오조작을 구조로 막는다.
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              aria-label={FIELD_LABEL.void_reason}
                              value={voidReason}
                              placeholder={VOID_REASON_PLACEHOLDER ?? undefined}
                              onChange={(e) => setVoidReason(e.target.value)}
                              className={`${INPUT_CLASS} w-48`}
                            />
                            <Button
                              aria-label="확인"
                              type="button"
                              onClick={() => submitVoid(row)}
                              disabled={voidRedemption.isPending}
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                            >
                              <Check size={17} />
                            </Button>
                            <Button
                              aria-label="취소"
                              type="button"
                              onClick={() => {
                                setVoidingId(null);
                                setVoidReason("");
                              }}
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground"
                            >
                              <X size={17} />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <Button
                              type="button"
                              onClick={() => {
                                setVoidingId(row.id);
                                setVoidReason("");
                              }}
                              aria-label={VOID_ACTION_LABEL ?? undefined}
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Ban size={17} />
                            </Button>
                          </div>
                        )}
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
