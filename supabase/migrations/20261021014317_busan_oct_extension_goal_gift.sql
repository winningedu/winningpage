-- 부산캠퍼스 10월 연장, 구성 6항목 확대, 목표관리 증정(수행평가 + 심화탐구)
--
-- 왜: 고객사 요청(부산캠퍼스 + 가격표 개정, QA 시트 3차 59/60행).
--   (a) 부산 9,900원 번들을 6항목(학습진단, 목표관리, 성장설계, 수행평가,
--       심화탐구, 자기평가)으로 넓히고 상품명에 "(1개월 이용권)"을 붙인다.
--   (b) 10월(KST) 결제분은 모든 부여가 11/30 까지 쓰이게 한다. 슬러그를
--       함수에 박지 않고 products 의 두 컬럼(만료 하한, 적용 결제 마감)으로
--       표현한다. 11월 결제부터는 일반 1개월/30일 규칙이다.
--   기존 10월 결제 주문은 아래 백필 A 로 만료를 맞춘다(멱등).
--   (c) 목표관리 구매 시 수행평가와 심화탐구를 월 2회씩 증정한다. 증정은 부산
--       번들 6항목, 목표관리 증정 구성(bundle_items)과 기존 주문 보충(백필 B, C)
--       이 필요한데, 마이그레이션은 참조 데이터 외 테이블에 insert 할 수 없어
--       scripts/busan-oct-goal-gift-data.sql 로 분리했다(dev 에서 한 번, 릴리스
--       뒤 prod 에서 한 번 실행). 그 파일을 돌리기 전에도 이 마이그레이션은
--       안전하다: 부산은 3항목 그대로 10월 만료 하한만 적용되고, 목표관리는
--       번들 행이 없어 기존 단일 상품 경로다.
--   (d) fn_refund_quote 가 증정 부여를 산정에서 빼 목표관리 환불이 증정 이전과
--       같게 한다(증정 부여가 없으면 조건에 걸리는 행이 없어 동작 불변).
-- 함수 시그니처와 권한은 바꾸지 않는다.

alter table public.products
  add column if not exists grant_expires_floor_at timestamptz,
  add column if not exists grant_expires_floor_paid_before timestamptz;

alter table public.products
  drop constraint if exists products_grant_expires_floor_pair_check;
alter table public.products
  add constraint products_grant_expires_floor_pair_check
  check ((grant_expires_floor_at is null) = (grant_expires_floor_paid_before is null));

comment on column public.products.grant_expires_floor_at is
  '번들 부여 만료 하한. grant_expires_floor_paid_before 이전에 결제한 주문의 모든 부여는 expires_at = greatest(정상 계산 만료, 이 값)이다. 둘 다 NULL 이면 특례 없음.';
comment on column public.products.grant_expires_floor_paid_before is
  'grant_expires_floor_at 이 적용되는 결제 시각의 상한(미포함). grant_expires_floor_at 과 함께 설정한다.';

-- 부산 번들: 상품명, 설명, 10월 특례(10/31 24:00 KST 전 결제는 11/30 24:00 KST 까지).
update public.products
   set name = '9,900원 부산캠퍼스 특별할인 학습관리 서비스 (1개월 이용권)',
       service_desc = '위닝 부산캠퍼스 소속 회원 전용 특별할인 패키지입니다. 학습진단 1회, 목표관리 1개월, 성장설계 1회, 수행평가 2회, 심화탐구 2회, 자기평가 2회를 한 번의 결제로 이용할 수 있습니다.',
       grant_expires_floor_at = '2026-11-30T15:00:00Z',
       grant_expires_floor_paid_before = '2026-10-31T15:00:00Z'
 where slug = 'busan-9900';

-- 목표관리 추천 배지는 6개월로 옮기고, 서비스 설명에 증정 안내 한 줄을 덧붙인다
-- (설명은 줄바꿈 그대로 저장, 화면은 whitespace-pre-line 로 줄을 나눈다).
update public.products set is_recommended = (slug = 'goal-6m')
 where slug in ('goal-6m', 'goal-12m');

update public.products
   set service_desc = service_desc || E'\n목표관리서비스를 이용하면 수행평가 월 2회권, 심화탐구 월 2회권을 함께 이용할 수 있습니다.'
 where service_key = 'goal'
   and service_desc is not null
   and position('수행평가 월 2회권' in service_desc) = 0;

-- ---------------------------------------------------------------------
-- fn_refund_quote: 증정 부여(정가 있는 라인에 딸린 paid_amount 0)를 산정에서 뺀다
--   fn_refund_quote 는 grant 마다 해당 order_item 의 정가 전체를 안분 기준으로
--   쓴다. 증정 부여가 같은 order_item 에 붙으면 목표관리와 같은 금액을 한 번 더
--   안분받아 환불액이 부풀고 policy_code 가 mixed 로 바뀐다. 목표관리 환불은
--   증정 이전과 같아야 하므로 증정 부여는 산정에서 제외한다. 정가 0 라인(무상
--   취득분)의 grant 는 정가가 0 이라 이 조건에 걸리지 않고 기존대로 산정된다.
--   시그니처는 20260901070515 와 동일해 CREATE OR REPLACE 로 충분하다.
-- ---------------------------------------------------------------------

create or replace function public.fn_refund_quote(
  p_order_id       text,
  p_order_item_ids bigint[]    default null,
  p_company_fault  boolean     default false,
  p_at             timestamptz default now()
) returns table (
  order_id             text,
  gross_amount         integer,
  refund_amount        integer,
  fee_amount           integer,
  started              boolean,
  needs_review         boolean,
  policy_code          text,
  lines                jsonb,
  scope                text,
  terms_version        text,
  within_withdrawal    boolean,
  company_fault        boolean,
  bundle_return_amount integer,
  coupon_restore       boolean
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order        public.orders;
  v_caller       uuid := auth.uid();
  v_items        bigint[];
  v_scope        text;
  v_sum_list     bigint := 0;   -- 정가 합계액(주문의 모든 order_items, 회수 라인 포함)
  v_grant_count  integer := 0;  -- 대상 라인 수
  v_live_count   integer := 0;  -- 주문 전체의 살아있는 라인 수
  v_line_list    integer;       -- 개별 정가
  v_line_paid    integer;       -- 안분결제액 P_i
  v_step2        integer;       -- 제33조의1 적용 결과(공제 전)
  v_line_refund  integer;
  v_used         integer;
  v_ratio        numeric;
  v_months       integer;
  v_k            integer;       -- 완료 개월 수
  v_c            numeric;       -- 해당 월 계단 차감률(0 / 1/3 / 1/2 / 1)
  v_monthly      numeric;       -- L(정가 월액) 또는 M(안분 월액, ⑪ 예외)
  v_ms           timestamptz;
  v_me           timestamptz;
  v_wd           boolean;
  v_all_wd       boolean := true;
  v_all_before   boolean := true;
  v_cap          integer;
  v_code         text;
  v_started      boolean := false;
  v_review       boolean := false;
  v_sum_refund   bigint := 0;
  v_bundle_sum   integer := 0;
  v_codes        text[] := '{}';
  -- grant 단위 원본 라인(루프가 쌓는다) - order_item_id 로 다시 합쳐 v_lines 로
  -- 만든다(아래 "표시 라인 합산" 블록).
  v_grant_lines  jsonb := '[]'::jsonb;
  v_lines        jsonb := '[]'::jsonb;
  v_idx          integer := 0;
  v_restore      boolean := false;
  g              record;
begin
  select * into v_order from public.orders o where o.id = p_order_id;

  -- 소유권 - fn_request_refund 와 같은 쌍 판정(존재 스캐닝 방지, Ver9 유지).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id
         and not public.is_admin()) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- 대상 항목 정규화 - 중복 제거. 빈 배열은 신청이 아니다.
  if p_order_item_ids is not null then
    select array_agg(distinct x order by x) into v_items
      from unnest(p_order_item_ids) x;
    if v_items is null then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060', detail = 'order_item_ids is empty';
    end if;
    -- 주문 밖의 항목은 거부한다.
    if exists (
      select 1 from unnest(v_items) x
       where not exists (
         select 1 from public.order_items oi
          where oi.id = x and oi.order_id = p_order_id)
    ) then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060',
              detail  = format('order_id=%s items=%s - 주문에 속하지 않는 항목', p_order_id, v_items);
    end if;
    -- 살아있는 부여가 없는 항목(이미 회수됐거나 부여 자체가 없던 라인)은
    -- 환불할 실체가 없다.
    if exists (
      select 1 from unnest(v_items) x
       where not exists (
         select 1 from public.program_access_grants pg
          where pg.order_item_id = x and pg.revoked_at is null)
    ) then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060',
              detail  = format('order_id=%s items=%s - 살아있는 부여가 없는 항목', p_order_id, v_items);
    end if;
  end if;

  select count(*) into v_live_count
    from public.program_access_grants pg
   where pg.order_id = p_order_id and pg.revoked_at is null
     and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0));

  -- 대상이 살아있는 라인 전부를 덮으면 주문 전체 신청으로 승격한다 -
  -- "전부 해지" 판정(⑦-5 다목, 제33조의3 ⑤)과 유니크 인덱스 축이 한
  -- 표현으로 모인다(§2-10). RefundRequestModal 의 전체 선택도 이 경로다.
  if v_items is not null
     and not exists (
       select 1 from public.program_access_grants pg
        where pg.order_id = p_order_id
          and pg.revoked_at is null
          and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0))
          and not (pg.order_item_id = any(v_items))
     ) then
    v_items := null;
  end if;

  v_scope := case when v_items is null then 'order' else 'items' end;

  -- 부여 원장이 없는 주문 - 산정 근거 없음. 전액 + 검토 플래그(Ver9 유지).
  if v_live_count = 0 then
    return query select
      v_order.id, v_order.amount, v_order.amount, 0,
      false, true, 'no_grant'::text, '[]'::jsonb,
      'order'::text, 'v10'::text, null::boolean, p_company_fault, 0, false;
    return;
  end if;

  -- 정가 합계액(제33조의2 ⑤ 분모) - 주문의 모든 order_items. 회수된 라인도
  -- 포함한다: 분모는 주문 시점에 고정돼야 부분환불을 거듭해도 배분이 흔들리지
  -- 않는다(§3-1 1단계).
  select coalesce(sum(oi.list_price::bigint * oi.quantity), 0) into v_sum_list
    from public.order_items oi
   where oi.order_id = p_order_id;

  select count(*) into v_grant_count
    from public.program_access_grants pg
   where pg.order_id = p_order_id
     and pg.revoked_at is null
     and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0))
     and (v_items is null or pg.order_item_id = any(v_items));

  for g in
    select pg.id, pg.program_key, pg.product_slug, pg.paid_amount,
           pg.granted_months, pg.granted_sessions, pg.validity_days,
           pg.starts_at, pg.expires_at, pg.first_accessed_at,
           pg.order_item_id,
           oi.list_price, oi.quantity, oi.name as item_name
      from public.program_access_grants pg
      left join public.order_items oi on oi.id = pg.order_item_id
     where pg.order_id = p_order_id
       and pg.revoked_at is null
       and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0))
       and (v_items is null or pg.order_item_id = any(v_items))
     order by pg.id
  loop
    v_idx := v_idx + 1;

    v_line_list := coalesce(g.list_price, 0) * coalesce(g.quantity, 1);

    -- 1/2단계 - 안분결제액 P_i = 실결제액 × 개별 정가 / 정가 합계액, 절상
    -- (제33조의2 ⑤, ※ 절상 차액은 회사 부담). 정가 0 라인은 무상 취득분
    -- (제33조의3 ⑥) - 배분 0. 정가 합계 0은 orders_amount_check 상 도달
    -- 불가지만, 그래도 오면 사람이 보게 검토 플래그만 세운다.
    if v_sum_list > 0 then
      v_line_paid := ceil(v_order.amount::numeric * v_line_list / v_sum_list)::integer;
    else
      v_line_paid := ceil(v_order.amount::numeric / v_grant_count)::integer;
      v_review := true;
    end if;

    -- 청약철회기간(제32조 ①, 7일) - 기산은 이용 가능일(starts_at)과 결제
    -- 시각 중 늦은 쪽(§2-9: 재구매 체이닝으로 starts_at 이 미래일 수 있다).
    v_wd := p_at < greatest(g.starts_at, coalesce(v_order.paid_at, g.starts_at))
                   + interval '7 days';

    -- 회차 순소비(Ver9 유지).
    select coalesce(sum(-l.delta), 0)::integer into v_used
      from public.performance_credit_ledger l
     where l.grant_id = g.id;

    v_started := v_started or v_used > 0 or g.first_accessed_at is not null;

    v_ratio   := null;
    v_k       := null;
    v_c       := null;
    v_monthly := null;

    if v_line_list = 0 and v_sum_list > 0 then
      -- 무상 취득분(제33조의3 ⑥) - 환불 대상 아님, 검토 대상도 아님(§2-2).
      v_step2 := 0;
      v_code  := 'free_item';

    elsif g.expires_at is not null and p_at >= g.expires_at then
      -- 유효기간/이용기간 만료(제33조의1 ⑤/⑥) - 잔여 가치 소멸.
      v_step2 := 0;
      v_code  := 'expired';

    elsif g.granted_sessions is not null then
      -- 회차제(⑧). 기간+회차 혼합 상품도 회차제다(⑧ 후문 단서 + 고객사
      -- 회신 8/31, §2-6) - 기간은 위 만료 축으로만 작동한다.
      if v_used <= 0 then
        v_step2 := v_line_paid;
        v_code  := 'before_start';
      elsif g.granted_sessions = 1 then
        -- 1회권 개시 후 청약철회 제한(④ + 제32조 ②).
        v_step2 := 0;
        v_code  := 'single_use_closed';
      else
        -- 회차 단가 × 미사용 잔여, 절상(⑧ + ⑤ ※).
        v_step2 := ceil(
          v_line_paid::numeric
          * greatest(g.granted_sessions - v_used, 0)
          / g.granted_sessions
        )::integer;
        v_code := 'sessions_prorated';
      end if;

    elsif g.first_accessed_at is null then
      -- 기간제 미개시 - 이용 시작 전 전액(②-1).
      v_step2 := v_line_paid;
      v_code  := 'before_start';

    else
      v_months := g.granted_months;

      if g.expires_at is null or g.expires_at <= g.starts_at then
        -- 무기한/비정상 기간은 경과율을 정의할 수 없다(Ver9 유지).
        v_step2 := v_line_paid;
        v_code  := 'period_unbounded';

      elsif v_months = 1 then
        -- 1개월 이내 과정 - ②-2 계단, 절상.
        v_ratio := extract(epoch from (p_at - g.starts_at))
                 / extract(epoch from (g.expires_at - g.starts_at));
        v_step2 := case
          when v_ratio < (1.0/3.0) then ceil(v_line_paid::numeric * 2 / 3)::integer
          when v_ratio < 0.5       then ceil(v_line_paid::numeric / 2)::integer
          else 0
        end;
        v_code := 'period_tier';

      else
        -- 1개월 초과 과정 - 환불 = max(0, P − L×(k+c)) (§2-4 권장 (a)=(b):
        -- ②-3호 월 계단과 ⑪ 정가 재산정을 어느 순서로 읽어도 같은 값).
        --   k = 완료 개월 수, c = 해당 월 계단 차감률(그 월 안의 경과율로
        --   ②-2와 같은 기준), L = 정가 월액. 회사 귀책/청약철회기간 내면
        --   ⑪ 예외 - L 을 안분결제 월액(M = P/N)으로 바꿔 같은 식을 쓴다.
        select count(*)::integer into v_k
          from generate_series(1, v_months) i
         where public.fn_add_months_kst(g.starts_at, i) <= p_at;
        v_k := least(v_k, v_months);

        v_ms := public.fn_add_months_kst(g.starts_at, v_k);
        if p_at > v_ms and v_k < v_months then
          v_me := public.fn_add_months_kst(g.starts_at, v_k + 1);
          v_ratio := extract(epoch from (p_at - v_ms))
                   / extract(epoch from (v_me - v_ms));
          v_c := case
            when v_ratio < (1.0/3.0) then 1.0/3.0
            when v_ratio < 0.5       then 0.5
            else 1.0
          end;
        else
          v_c := 0;
        end if;

        if p_company_fault or v_wd then
          v_monthly := v_line_paid::numeric / v_months;
          v_code    := 'period_monthly_tier_noreprice';
        else
          v_monthly := v_line_list::numeric / v_months;
          v_code    := 'period_monthly_tier';
        end if;

        v_step2 := ceil(greatest(0::numeric, v_line_paid - v_monthly * (v_k + v_c)))::integer;
      end if;
    end if;

    -- 3단계 - 제33조의2 ⑦ 동시결제 조건부 할인 반환금. 현 데이터 모델에는
    -- 조건부 할인 컬럼이 없어 항상 0(§2-5 확정 - ⑦-1이 장기할인/쿠폰을
    -- 명시 제외). 컬럼이 생기면 ⑦-2 산식 + ⑦-4 표시 전제 + ⑦-5 면제
    -- (회사 귀책 ∨ 철회기간 내 ∨ 전부 해지)를 여기서 계산한다.
    v_line_refund := greatest(0, v_step2);
    v_sum_refund  := v_sum_refund + v_line_refund;
    v_codes       := v_codes || v_code;
    v_all_wd      := v_all_wd and v_wd;
    v_all_before  := v_all_before and v_code = 'before_start';
    v_review      := v_review or v_code = 'period_unbounded';

    v_grant_lines := v_grant_lines || jsonb_build_object(
      'grant_id',          g.id,
      'order_item_id',     g.order_item_id,
      'program_key',       g.program_key,
      'product_slug',      g.product_slug,
      'item_name',         g.item_name,
      'list_price',        v_line_list,
      'paid_allocated',    v_line_paid,
      'list_amount',       v_line_list,
      'granted_months',    g.granted_months,
      'granted_sessions',  g.granted_sessions,
      'used_sessions',     v_used,
      'first_accessed_at', g.first_accessed_at,
      'expires_at',        g.expires_at,
      'within_withdrawal', v_wd,
      'elapsed_ratio',     v_ratio,
      'charge_months',     v_k,
      'month_tier',        case when v_c is null then null else round(v_c, 4) end,
      'monthly_list',      case when v_monthly is null then null
                                else round(v_monthly, 2) end,
      'step2_amount',      v_step2,
      'bundle_return',     0,
      'refund',            v_line_refund,
      'policy_code',       v_code
    );
  end loop;

  -- 표시 라인 합산 - order_item_id 단위로 grant 라인을 다시 묶는다(위 설명
  -- 주석 참고). grant 가 하나뿐인 order_item은 원본 라인을 그대로 내보내고,
  -- 여럿(번들)이면 금액을 합산한 라인 하나로 합친다.
  with numbered as (
    select row_number() over () as seq,
           elem,
           (elem->>'order_item_id')::bigint as item_id
      from jsonb_array_elements(v_grant_lines) elem
  ),
  grouped as (
    select
      item_id,
      count(*) as n,
      min(seq) as first_seq,
      (array_agg(elem order by seq))[1] as sole_elem,
      jsonb_build_object(
        'grant_id',          null,
        'order_item_id',     item_id,
        'program_key',       null,
        'product_slug',      null,
        'item_name',         min(elem->>'item_name'),
        'list_price',        sum((elem->>'list_price')::bigint),
        'paid_allocated',    sum((elem->>'paid_allocated')::bigint),
        'list_amount',       sum((elem->>'list_amount')::bigint),
        'granted_months',    null,
        'granted_sessions',  null,
        'used_sessions',     null,
        'first_accessed_at', null,
        'expires_at',        null,
        'within_withdrawal', bool_and((elem->>'within_withdrawal')::boolean),
        'elapsed_ratio',     null,
        'charge_months',     null,
        'month_tier',        null,
        'monthly_list',      null,
        'step2_amount',      sum((elem->>'step2_amount')::bigint),
        'bundle_return',     0,
        'refund',            sum((elem->>'refund')::bigint),
        'policy_code',       case when count(distinct elem->>'policy_code') = 1
                                   then min(elem->>'policy_code')
                                   else 'mixed' end
      ) as merged_elem
      from numbered
     group by item_id
  )
  select coalesce(
           jsonb_agg(
             case when n = 1 then sole_elem else merged_elem end
             order by first_seq
           ),
           '[]'::jsonb
         )
    into v_lines
    from grouped;

  -- 합산 - 100원 내림은 폐지(⑤ ※ 전면 절상). 클램프 상한은 누적 완료
  -- 환불을 반영한다(§3-1 8단계 - Ver9 는 orders.amount 만 봤다).
  v_cap := greatest(0, v_order.amount - public.fn_refund_completed_amount(p_order_id));
  v_sum_refund := greatest(0, least(v_sum_refund, v_cap));

  -- 전부 청약철회 쿠폰 복원(제33조의3 ⑤) - 주문 전체 + 모든 라인 철회기간
  -- 내 + 모든 라인 미개시 + 살아있는 쿠폰 사용이 있을 때.
  v_restore := v_scope = 'order'
    and v_all_wd
    and v_all_before
    and exists (
      select 1 from public.coupon_redemptions cr
       where cr.order_id = p_order_id and cr.voided_at is null);

  select case when count(distinct c) = 1 then min(c) else 'mixed' end
    into v_code
    from unnest(v_codes) c;

  return query select
    v_order.id,
    v_order.amount,
    v_sum_refund::integer,
    (v_order.amount - v_sum_refund)::integer,
    v_started,
    v_review,
    v_code,
    v_lines,
    v_scope,
    'v10'::text,
    v_all_wd,
    p_company_fault,
    v_bundle_sum,
    v_restore;
end;
$$;

comment on function public.fn_refund_quote(text, bigint[], boolean, timestamptz) is
  '제33조의1~3 Ver10 환불 산정 정본(20260901, 20260901070515 표시 라인 order_item_id 합산 패치). 개별 정가 비율 절상 안분(제33조의2 ⑤) to 라인별 정책(②계단/⑧회차/⑪장기할인 = max(0, P−L×(k+c)), 만료 0원) to ⑦ 공제(현 모델 0) 3단계. 응답 lines 는 grant 단위 산정을 order_item_id 로 다시 합쳐 노출한다 - 번들 상품(한 order_item이 grant 여러 개를 만드는 경우)이 화면에 중복 항목으로 보이지 않게 한다(grant 하나뿐인 일반 상품은 원본 필드 그대로 보존). p_order_item_ids 로 구성서비스 단위 부분 산정, p_company_fault/청약철회 7일 내는 ⑪ 예외(L=M), p_at 은 재견적 재현용. 모달 미리보기/fn_request_refund/fn_complete_refund 재견적이 이 함수 하나를 공유한다. 소유권 WC005, 결제 상태 WC006, 대상 항목 검증 WC060. 20261021 패치: 정가가 있는 order_item 에 딸린 paid_amount 0 부여(목표관리 증정분)는 산정 대상, 건수, 부분환불 승격 판정에서 뺀다. 증정 부여가 결제액을 다시 안분받아 환불액이 부풀려지는 것을 막고, 정가 0 라인(무상 취득분, free_item)은 그대로 산정한다.';

-- ---------------------------------------------------------------------
-- 백필 A: 10월(KST) 결제 부산 주문의 살아있는 부여를 하한까지 연장
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    with upd as (
      update public.program_access_grants g
         set expires_at = p.grant_expires_floor_at
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        join public.products p on p.id = oi.product_id
       where g.order_item_id = oi.id
         and p.grant_expires_floor_at is not null
         and o.status = 'paid'
         and o.paid_at >= '2026-09-30T15:00:00Z'
         and o.paid_at <  p.grant_expires_floor_paid_before
         and g.revoked_at is null
         and g.expires_at < p.grant_expires_floor_at
      returning g.profile_id, g.program_key
    )
    select distinct profile_id, program_key from upd
  loop
    perform public.fn_sync_program_access_cache(r.profile_id, r.program_key, null);
  end loop;
end $$;
