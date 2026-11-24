import { Ban, Check, ChevronLeft, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastError, toastSuccess } from "@/pages/admin/shared/adminToast";
import {
  type FoundUser,
  type GrantRow,
  mappedErrorText,
  useCoupon,
  useGrantCoupon,
  useGrants,
  useLoadErrorToast,
  useRevokeGrant,
  useUserSearch,
} from "./api";
import {
  ALREADY_GRANTED_TEXT,
  BACK_ACTION_LABEL,
  boolText,
  dateTimeText,
  FIELD_LABEL,
  FieldName,
  GRANT_ERROR_TEXT,
  INPUT_CLASS,
  moneyText,
  REVOKE_ACTION_LABEL,
  REVOKE_ERROR_TEXT,
  REVOKE_REASON_PLACEHOLDER,
  TITLE,
  UNLIMITED_FALLBACK,
  UNLIMITED_LABEL,
  USER_SEARCH_PLACEHOLDER,
} from "./copy";
import { COUPONS_PATH } from "./paths";

// 쿠폰 하나의 발급 관리. 쿠폰 머리글과 발급 목록을 주소의 id 로 각각 받아 새로고침에도 열린다.
export default function CouponGrants() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const couponQuery = useCoupon(id);
  const grantsQuery = useGrants(id);
  useLoadErrorToast(grantsQuery.error);
  const grantCoupon = useGrantCoupon(id);
  const revokeGrant = useRevokeGrant(id);

  const coupon = couponQuery.data;
  const grantRows: GrantRow[] = grantsQuery.data?.items ?? [];
  const grantLoading = grantsQuery.isFetching;
  const actionBusy = grantCoupon.isPending || revokeGrant.isPending;

  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  // 사용자 검색. submittedQuery 가 null 이면 아직 검색하지 않은 상태다.
  const [userQuery, setUserQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const searchQuery = useUserSearch(submittedQuery);
  useLoadErrorToast(searchQuery.error);
  const userSearching = submittedQuery !== null && searchQuery.isFetching;
  const userResults: FoundUser[] | null =
    submittedQuery === null
      ? null
      : searchQuery.isError
        ? []
        : (searchQuery.data?.items ?? null);

  // 이미 살아있는 발급을 가진 사용자 id 집합. 검색 결과에서 발급 버튼을 감추는 데 쓴다.
  const grantedUserIds = useMemo(
    () =>
      new Set(
        grantRows
          .filter((row) => row.revoked_at === null)
          .map((row) => row.user_id),
      ),
    [grantRows],
  );

  function searchUsers() {
    // or 필터는 콤마와 괄호로 절을 나눈다. 검색어에 있으면 문법이 깨지므로 미리 걷어낸다.
    const query = userQuery.trim().replace(/[,()*"\\]/g, "");
    if (!query) {
      setSubmittedQuery(null);
      return;
    }
    if (query === submittedQuery) void searchQuery.refetch();
    else setSubmittedQuery(query);
  }

  async function submitGrant(profile: FoundUser) {
    try {
      await grantCoupon.mutateAsync(profile.id);
    } catch (error) {
      console.error(error);
      toastError("등록 실패", mappedErrorText(error, GRANT_ERROR_TEXT));
      return;
    }
    toastSuccess("저장 완료");
  }

  async function submitRevoke(row: GrantRow) {
    try {
      await revokeGrant.mutateAsync({ grantId: row.id, reason: revokeReason });
    } catch (error) {
      console.error(error);
      toastError("수정 실패", mappedErrorText(error, REVOKE_ERROR_TEXT));
      return;
    }
    setRevokingId(null);
    setRevokeReason("");
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

        {/* 어느 쿠폰의 발급인지, 사용이력 헤더와 같은 형태. valid_until 을
              함께 보여준다: 발급받아도 쿠폰 자신의 기한이 지나면 못 쓰기
              때문이다. 발급분에도 별도 기한이 있고(coupon_grants.valid_until,
              20260825000010) 그건 아래 목록의 「사용 기한」 칼럼이다, 실제로
              쓸 수 있는 마지막 날은 이 둘 중 이른 쪽이다. */}
        {coupon && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
            <span className="font-mono text-[0.8125rem]">{coupon.slug}</span>
            <span>{coupon.title}</span>
            <span className="text-blue-600">
              {moneyText(coupon.discount_amount)}
            </span>
            <span className="text-gray-500">
              {coupon.valid_until ?? UNLIMITED_LABEL ?? UNLIMITED_FALLBACK}
            </span>
            <span className="text-gray-500">{boolText(coupon.is_active)}</span>
          </div>
        )}
      </div>

      {/* 개별 발급, 사용자를 찾아서 준다. 이메일,이름 검색은 profiles 를
            직접 조회한다(profiles_admin_select_all 정책). 발급 자체는 RPC 다. */}
      <div className="mb-6 bg-white p-6 shadow-sm">
        <div className="mb-3 text-sm font-semibold">
          <FieldName k="email" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-[20rem] max-w-full">
            <Input
              type="text"
              aria-label={FIELD_LABEL.email}
              value={userQuery}
              placeholder={USER_SEARCH_PLACEHOLDER ?? undefined}
              onChange={(e) => setUserQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") searchUsers();
              }}
              className={INPUT_CLASS}
            />
          </span>
          <Button
            type="button"
            onClick={searchUsers}
            variant="outline"
            size="lg"
          >
            <Search size={14} />
            조회
          </Button>
        </div>

        {userSearching && (
          <div className="mt-4 text-sm font-bold text-gray-500">
            데이터를 불러오는 중입니다.
          </div>
        )}

        {!userSearching && userResults !== null && (
          <div className="mt-4 border-t border-gray-200">
            {userResults.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                등록된 데이터가 없습니다.
              </div>
            ) : (
              userResults.map((profile) => {
                const already = grantedUserIds.has(profile.id);

                return (
                  <div
                    key={profile.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold">
                        {profile.name || "-"}
                      </div>
                      <div className="font-mono text-xs text-gray-500">
                        {profile.email}
                      </div>
                    </div>

                    {already ? (
                      // 이미 살아있는 발급이 있으면 버튼 대신 상태 표시만 둔다.
                      <span
                        className="text-green-600"
                        title={ALREADY_GRANTED_TEXT ?? undefined}
                        role="img"
                        aria-label={ALREADY_GRANTED_TEXT ?? undefined}
                      >
                        <Check size={17} />
                      </span>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => submitGrant(profile)}
                        disabled={actionBusy}
                        size="lg"
                        className="font-semibold"
                      >
                        <Plus size={14} />
                        등록
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {grantLoading ? (
        <div
          role="status"
          className="bg-white p-12 text-center text-sm font-medium text-gray-500 shadow-sm"
        >
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="mb-4 text-sm font-bold text-gray-500">
            전체 <span className="text-blue-600">{grantRows.length}</span>건
          </div>

          <Table className="min-w-250">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  scope="col"
                  className="w-14 px-3 py-3 text-left font-semibold whitespace-normal"
                >
                  번호
                </TableHead>
                {[
                  "user",
                  "granted_by",
                  "granted_at",
                  "valid_until",
                  "revoked_at",
                  "revoke_reason",
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
                  className="w-24 px-3 py-3 text-center font-semibold whitespace-normal"
                >
                  관리
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {grantRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-muted-foreground whitespace-normal"
                  >
                    등록된 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                grantRows.map((row, index) => {
                  const profile = row.user;
                  const revoked = row.revoked_at !== null;

                  return (
                    <TableRow
                      key={row.id}
                      className={`border-b border-gray-100 ${revoked ? "text-muted-foreground" : ""}`}
                    >
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {grantRows.length - index}
                      </TableCell>

                      <TableCell className="px-3 py-3 whitespace-normal">
                        <div className="font-bold">
                          {profile?.name || profile?.email || "-"}
                        </div>
                        <div className="font-mono text-xs text-gray-500">
                          {row.user_id}
                        </div>
                      </TableCell>

                      <TableCell className="px-3 py-3 font-mono text-[0.8125rem] whitespace-normal">
                        {row.granted_by}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {dateTimeText(row.granted_at)}
                      </TableCell>
                      {/* 쿠폰 자신의 기한(위 헤더)과 별개 축이다, 실제로
                              쓸 수 있는 마지막 날은 둘 중 이른 쪽이다. */}
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {row.valid_until ?? UNLIMITED_LABEL}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {dateTimeText(row.revoked_at)}
                      </TableCell>
                      <TableCell className="px-3 py-3 whitespace-normal">
                        {row.revoke_reason || "-"}
                      </TableCell>

                      <TableCell className="px-3 py-3 whitespace-normal">
                        {revoked ? (
                          // 회수된 행은 사라지지 않는다(원장). 다시 회수할 수도
                          // 없다, 되돌리려면 "다시 발급"(새 행)이다.
                          <div className="text-center text-gray-300">-</div>
                        ) : revokingId === row.id ? (
                          // void 와 같은 2단계 게이트. window.confirm 을 쓰면
                          // 새 한국어 문구가 필요해진다.
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              aria-label={FIELD_LABEL.revoke_reason}
                              value={revokeReason}
                              placeholder={
                                REVOKE_REASON_PLACEHOLDER ?? undefined
                              }
                              onChange={(e) => setRevokeReason(e.target.value)}
                              className={`${INPUT_CLASS} w-48`}
                            />
                            <Button
                              aria-label="확인"
                              type="button"
                              onClick={() => submitRevoke(row)}
                              disabled={actionBusy}
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
                                setRevokingId(null);
                                setRevokeReason("");
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
                                setRevokingId(row.id);
                                setRevokeReason("");
                              }}
                              aria-label={REVOKE_ACTION_LABEL ?? undefined}
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
          </Table>
        </div>
      )}
    </>
  );
}
