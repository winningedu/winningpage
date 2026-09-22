-- 테넌트(단체 소속) 마이그레이션 2/3 — tenant_id 컬럼 신설 + 백필 + 자가 설정 RPC
--
-- 왜 — ①(tenants_core)이 마스터 테이블과 코드 발급/조회를 만들었으니, 이제
-- profiles/products/coupons 에 FK 컬럼(tenant_id)을 얹고 기존 org_code
-- text 값으로부터 결정적으로 백필한다. org_code 컬럼 자체는 이 파일에서
-- 지우지 않는다 — "더 이상 읽지도 쓰지도 않는 죽은 컬럼"으로만 남기고
-- drop 은 후속 PR 몫이다(기존 함수 재작성은 ③이 맡는다).

-- ---------------------------------------------------------------------
-- 1) tenant_id 컬럼 신설
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants (id);

alter table public.products
  add column if not exists tenant_id uuid references public.tenants (id);

alter table public.coupons
  add column if not exists tenant_id uuid references public.tenants (id);

create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);
create index if not exists products_tenant_id_idx on public.products (tenant_id);
create index if not exists coupons_tenant_id_idx  on public.coupons  (tenant_id);

-- ---------------------------------------------------------------------
-- 2) 백필 — 단일 DO 블록, 결정적(dev·prod 동일 입력이면 동일 결과)
--
--    ⚠ 여기서 만드는 tenants 행은 fn_create_tenant(RPC, WC067 게이트)를
--    거치지 않는다 — 백필은 관리자 조작이 아니라 마이그레이션 그 자체이므로
--    직접 insert 한다(코드 생성 함수만 재사용).
-- ---------------------------------------------------------------------

do $$
declare
  v_value    text;
  v_region   text;
  v_org_type text;
  v_tier     text;
  v_code     text;
  v_created  boolean;
  v_i        integer;
  v_rec      record;
begin
  -- products.org_code ∪ coupons.org_code 의 distinct 정규화 값마다 대표
  -- 원문 하나를 고른다 — 같은 정규화 그룹 안에서는 원문 문자열 오름차순
  -- 첫 값을 대표로 삼아 결정적으로 만든다(대소문자·공백 변형이 섞여 있어도
  -- 항상 같은 대표가 뽑힌다).
  for v_value in
    select distinct on (upper(trim(x.org_code))) x.org_code
      from (
        select org_code from public.products where org_code is not null
        union all
        select org_code from public.coupons  where org_code is not null
      ) as x
     order by upper(trim(x.org_code)), x.org_code
  loop
    -- 재실행(리허설 DB 등) 대비 — 같은 정규화 값의 tenant 가 이미 있으면
    -- 건너뛴다.
    if exists (
      select 1 from public.tenants t where upper(trim(t.name)) = upper(trim(v_value))
    ) then
      continue;
    end if;

    if upper(trim(v_value)) = upper(trim('위닝부산캠퍼스')) then
      v_region   := '부산';
      v_org_type := '캠퍼스';
      v_tier     := 'S';
    else
      v_region   := '기타';
      v_org_type := '기타';
      v_tier     := 'W';
      -- products/coupons 값은 관리자가 넣은 것이라 원문을 남겨도 된다.
      raise notice 'tenants backfill: 예상 밖 org_code 값 = %', v_value;
    end if;

    v_created := false;
    for v_i in 1 .. 10 loop
      v_code := public.fn_generate_tenant_code();
      begin
        insert into public.tenants (code, name, region, org_type, tier)
        values (v_code, v_value, v_region, v_org_type, v_tier);
        v_created := true;
        exit;
      exception when unique_violation then
        continue;
      end;
    end loop;

    if not v_created then
      raise exception 'tenant_code_generation_failed_for_backfill value=%', v_value;
    end if;
  end loop;

  -- products/coupons.tenant_id — 정규화 org_code 가 대표 이름과 같은 tenant 로 set.
  update public.products p
     set tenant_id = t.id
    from public.tenants t
   where p.org_code is not null
     and upper(trim(p.org_code)) = upper(trim(t.name));

  update public.coupons c
     set tenant_id = t.id
    from public.tenants t
   where c.org_code is not null
     and upper(trim(c.org_code)) = upper(trim(t.name));

  -- profiles.tenant_id — 매칭되는 행만 set(위 두 컬럼과 동일 매칭 규칙).
  update public.profiles p
     set tenant_id = t.id
    from public.tenants t
   where p.org_code is not null
     and upper(trim(p.org_code)) = upper(trim(t.name));

  -- 미매칭 분포 보고 — profiles.org_code 는 있는데 products/coupons 어느
  -- 쪽에도 없어 tenants 가 생성되지 않은 값들이다(개인정보 아님, 소속코드
  -- 문자열과 건수뿐).
  --
  -- 자유 입력 컬럼이라 어떤 문자열이 들어 있을지 모른다(이름·전화번호를 잘못
  -- 적었을 수도 있다). CI 로그에 원문을 남기지 않고 앞 2자 + 길이 + 건수만
  -- 남긴다 — 분포 파악에는 충분하고, 원문이 필요하면 DB 에서 직접 본다.
  for v_rec in
    select left(upper(trim(p.org_code)), 2) || '…' as head,
           length(trim(p.org_code)) as len,
           count(*) as cnt
      from public.profiles p
     where p.org_code is not null
       and p.tenant_id is null
     group by 1, 2
     order by 3 desc, 1, 2
  loop
    raise notice 'tenants backfill: 미매칭 profiles.org_code head=% len=% 건수=%',
      v_rec.head, v_rec.len, v_rec.cnt;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) org_code 컬럼 — 죽은 컬럼으로 코멘트 갱신(drop 은 후속 PR)
-- ---------------------------------------------------------------------

comment on column public.profiles.org_code is
  '2026-09-22 tenant_id로 대체됨, 읽기·쓰기 금지, 후속 PR에서 drop 예정.';

comment on column public.products.org_code is
  '2026-09-22 tenant_id로 대체됨, 읽기·쓰기 금지, 후속 PR에서 drop 예정.';

comment on column public.coupons.org_code is
  '2026-09-22 tenant_id로 대체됨, 읽기·쓰기 금지, 후속 PR에서 drop 예정.';

-- ---------------------------------------------------------------------
-- 4) profiles.tenant_id 잠금 — fn_profiles_lock_identity_fields(20260825093331)
--    와 별도 함수. 기존 함수는 이름·생년월일·성별만 다룬다(수정 금지).
--
--    app.tenant_set_via_rpc 세션 설정이 '1'일 때만 통과한다 — fn_set_my_tenant
--    ·fn_admin_set_profile_tenant·complete_signup_profile 세 RPC가 쓰기 직전
--    이 설정을 켠다. 그 외 authenticated 세션이 profiles.tenant_id 를 직접
--    UPDATE 하면(DevTools 등으로 fn_profiles_lock_identity_fields 를 우회하듯
--    이 컬럼도 우회할 수 있었던 통로) 막는다.
--
--    INSERT 도 막는다 — profiles_insert_own(baseline:9986)이 본인 행 insert 를
--    허용하므로, update 만 잠그면 "아직 profiles 행이 없는 신규 계정이
--    tenant_id 를 실어 insert" 하는 구멍이 남는다. tenant uuid 는
--    products/coupons 공개 읽기·fn_matched_tenant_ids 로 알 수 있는 값이라
--    코드 없이 소속을 얻는 경로가 된다. RPC 밖의 insert 는 tenant_id 가
--    NULL 이어야만 통과한다.
-- ---------------------------------------------------------------------

create or replace function public.fn_profiles_lock_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed boolean;
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      v_changed := new.tenant_id is not null;
    else
      v_changed := new.tenant_id is distinct from old.tenant_id;
    end if;

    if v_changed
       and coalesce(current_setting('app.tenant_set_via_rpc', true), '') <> '1' then
      raise exception using errcode = 'WC070',
        message = '소속은 별도 절차로만 변경할 수 있습니다.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_profiles_lock_tenant() is
  '20260922 — profiles.tenant_id 잠금 트리거 함수(fn_profiles_lock_identity_fields, 20260825093331 과 별도 — 그 함수는 이름·생년월일·성별만 다루고 이번에 수정하지 않았다). authenticated 세션의 직접 UPDATE(값 변경)와 직접 INSERT(tenant_id 비NULL)를 막고, fn_set_my_tenant·fn_admin_set_profile_tenant·complete_signup_profile 이 set_config(app.tenant_set_via_rpc, 1, true)로 표시한 호출만 통과시킨다. INSERT 를 같이 잠그는 이유는 profiles_insert_own 이 본인 행 insert 를 허용하기 때문이다. service_role·is_admin() 통과자는 이 게이트 자체를 안 탄다(기존 identity lock 트리거와 동일 예외 원칙).';

drop trigger if exists trg_profiles_lock_tenant on public.profiles;
create trigger trg_profiles_lock_tenant
  before insert or update on public.profiles
  for each row
  execute function public.fn_profiles_lock_tenant();

-- ---------------------------------------------------------------------
-- 5) fn_set_my_tenant — 회원 자가 소속 설정 (WC071)
-- ---------------------------------------------------------------------

create or replace function public.fn_set_my_tenant(p_code text)
returns table(tenant_id uuid, name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller   uuid := auth.uid();
  v_existing uuid;
  v_id       uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select p.tenant_id into v_existing from public.profiles p where p.id = v_caller;

  if v_existing is not null then
    raise exception 'tenant_already_set' using errcode = 'WC071';
  end if;

  -- 코드 정규화·레이트리밋(WC068)은 fn_resolve_tenant_code 가 담당한다.
  -- 못 찾으면 NULL — 여기서 raise 하면 그 함수가 남긴 실패 기록이 같이
  -- 롤백돼 리밋이 무력화되므로, 0행을 돌려주고 "없는 코드" 표기는 프론트
  -- 몫으로 둔다.
  v_id := public.fn_resolve_tenant_code(p_code);

  if v_id is null then
    return;
  end if;

  perform set_config('app.tenant_set_via_rpc', '1', true);

  update public.profiles
     set tenant_id  = v_id,
         updated_at = now()
   where id = v_caller;

  return query
    select t.id, t.name from public.tenants t where t.id = v_id;
end;
$$;

comment on function public.fn_set_my_tenant(text) is
  '20260922 — 로그인 회원이 스스로 소속 코드를 입력해 profiles.tenant_id 를 세팅한다. 이미 소속이 설정돼 있으면 WC071(재설정은 어드민 경로 — fn_admin_set_profile_tenant). 코드 판정은 fn_resolve_tenant_code 재사용(시도 초과 WC068). 없는 코드면 raise 하지 않고 0행을 돌려준다 — raise 하면 실패 기록이 롤백돼 리밋이 무력화되기 때문이며, "없는 코드" 안내는 프론트가 0행을 보고 한다. fn_profiles_lock_tenant 트리거를 통과시키려고 update 직전 app.tenant_set_via_rpc 를 켠다.';

revoke all on function public.fn_set_my_tenant(text) from public, anon;
grant execute on function public.fn_set_my_tenant(text) to authenticated;

-- ---------------------------------------------------------------------
-- 6) fn_admin_set_profile_tenant — 관리자 소속 배정/해제 (WC072)
-- ---------------------------------------------------------------------

create or replace function public.fn_admin_set_profile_tenant(
  p_profile_id uuid,
  p_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_admin_can('members', 'edit') then
    raise exception 'not_authorized' using errcode = 'WC072';
  end if;

  if p_tenant_id is not null and not exists (
    select 1 from public.tenants t where t.id = p_tenant_id
  ) then
    raise exception 'tenant_not_found';
  end if;

  perform set_config('app.tenant_set_via_rpc', '1', true);

  update public.profiles
     set tenant_id  = p_tenant_id,
         updated_at = now()
   where id = p_profile_id;
end;
$$;

comment on function public.fn_admin_set_profile_tenant(uuid, uuid) is
  '20260922 — 회원 관리 편집 권한(fn_admin_can(''members'',''edit''), 20260822000010) 보유 관리자 전용. p_tenant_id 가 NULL 이면 소속 해제, 존재하지 않는 tenant 면 거부(WC072 는 권한 없음 전용 — tenant 미존재는 별도 메시지). fn_set_my_tenant 와 동일하게 트리거 우회 설정을 켜고 UPDATE 한다.';

revoke all on function public.fn_admin_set_profile_tenant(uuid, uuid) from public, anon;
grant execute on function public.fn_admin_set_profile_tenant(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7) fn_my_tenant — 호출자 소속 표시(①에서 tenant_id 컬럼이 아직 없어 이관)
-- ---------------------------------------------------------------------

create or replace function public.fn_my_tenant()
returns table(id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.name
    from public.profiles p
    join public.tenants t on t.id = p.tenant_id
   where p.id = auth.uid();
$$;

comment on function public.fn_my_tenant() is
  '20260922 — 호출자(auth.uid())의 소속 id·name 만 반환(표시용). profiles.tenant_id 가 NULL 이면 0행. tier 등 내부 컬럼은 반환하지 않는다(fn_resolve_tenant_code 와 동일 원칙).';

revoke all on function public.fn_my_tenant() from public, anon;
grant execute on function public.fn_my_tenant() to authenticated;
