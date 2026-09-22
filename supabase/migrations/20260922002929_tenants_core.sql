-- 테넌트(단체 소속) 마이그레이션 1/3 — tenants 테이블 + 코드 발급/조회 함수
--
-- 왜 — profiles.org_code / products.org_code / coupons.org_code 는 지금
-- 검증 규칙 없는 자유 입력 text 다(20260825093735, 20260901050440,
-- 20260831020402 각 컬럼 코멘트 — "향후 마스터 테이블로 전환 예정"). 이
-- 마이그레이션이 그 마스터 테이블(tenants)과, 회원이 스스로 소속을
-- 인증하는 8자 코드 체계를 만든다. FK 전환(profiles/products/coupons.
-- tenant_id)과 기존 함수 재작성은 후속 파일(②·③)이 맡는다 — 이 파일은
-- text 컬럼을 전혀 건드리지 않는다.
--
-- 코드 형식 — 0/O/1/I/L 을 뺀 8자(대문자+숫자). 사람이 전화·문자로 불러줄
-- 때 헷갈리는 자모를 없애기 위해서다(신규, 2026-09-22). student_link_codes
-- 의 6자 코드(generate_link_code_string, baseline:3581)와 같은 알파벳
-- 설계 원칙(31자 집합 + rejection sampling)을 8자로 확장했다.

-- ---------------------------------------------------------------------
-- 1) public.tenants — 단체 소속 마스터
-- ---------------------------------------------------------------------

create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  region     text not null,
  org_type   text not null,
  tier       text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_code_format_check
    check (code ~ '^[A-HJ-KM-NP-Z2-9]{8}$'),
  constraint tenants_region_check
    check (region in (
      '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
      '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남',
      '제주', '기타'
    )),
  constraint tenants_org_type_check
    check (org_type in ('기관', '사기업', '학교', '캠퍼스', '기타')),
  constraint tenants_tier_check
    check (tier in ('S', 'A', 'B', 'W'))
);

comment on table public.tenants is
  '단체 소속 마스터(2026-09-22, tenants 확장 1단계). profiles/products/coupons.org_code(자유 text)를 대체할 FK 대상 — text 컬럼은 후속 파일(tenant_id_columns_backfill)에서 tenant_id 로 백필되고, 이 파일 시점에는 아직 아무 테이블도 참조하지 않는다. insert 는 fn_create_tenant RPC 로만 한다(테이블 자체엔 insert 정책이 없다).';

comment on column public.tenants.code is
  '회원이 가입·소속 인증 시 직접 입력하는 8자 코드(2026-09-22). 문자집합은 0/O/1/I/L 을 뺀 31자(A-HJ-KM-NP-Z2-9) — 전화·문자로 불러줄 때 헷갈리는 자모 제거. fn_generate_tenant_code 가 생성하고, 한 번 저장되면 트리거(fn_tenants_lock_code)로 불변이다(관리자 수정 화면에서도 변경 불가).';

comment on column public.tenants.tier is
  '내부 분류용 등급(S/A/B/W, 2026-09-22). 정산·영업 우선순위 등 내부 판단 재료이며 회원에게 노출하지 않는다 — fn_resolve_tenant_code/fn_my_tenant 어느 쪽도 이 컬럼을 반환하지 않는다.';

comment on column public.tenants.created_by is
  '테넌트를 발급한 최고 관리자(2026-09-22). 감사 추적용 — 프로필이 삭제돼도 테넌트 자체는 남아야 하므로 on delete set null(admin_members.invited_by 와 동일 관행, 20260822000010).';

create index if not exists tenants_region_idx on public.tenants (region);

alter table public.tenants enable row level security;

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  as permissive for select to authenticated
  using (public.fn_admin_can('tenants', 'view'));

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  as permissive for update to authenticated
  using (public.fn_admin_can('tenants', 'edit'))
  with check (public.fn_admin_can('tenants', 'edit'));

-- insert/delete 정책은 의도적으로 두지 않는다 — 신설은 fn_create_tenant(보안
-- definer, fn_is_super_admin 게이트)로만 하고, delete 는 이 단계에서 아예
-- 허용하지 않는다(후속 PR에서 drop 되는 쪽은 text 컬럼이지 tenants 행이
-- 아니다).

-- ---------------------------------------------------------------------
-- 2) code 불변 트리거 — 관리자 수정 화면에서도 변경 불가
--
--    fn_profiles_lock_identity_fields(20260825093331)와 달리 예외를 두지
--    않는다 — 그 트리거는 "최초 입력만 허용, service_role·관리자는 통과"
--    지만, tenant code 는 발급 시점에 한 번 확정되면 그 뒤로는 어떤 경로로도
--    바뀌면 안 된다(이미 각 회원의 profiles.org_code 문자열·CS 안내·구두
--    전달 등 DB 밖에서도 유통되는 값이라, DB 값만 바뀌면 그 순간부터 모든
--    바깥 사본과 불일치한다). 코드를 실제로 고쳐야 하면 새 마이그레이션으로
--    이 트리거를 내리고 고친 뒤 다시 세운다.
-- ---------------------------------------------------------------------

create or replace function public.fn_tenants_lock_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.code is distinct from old.code then
    raise exception using errcode = 'P0001',
      message = '소속 코드는 변경할 수 없습니다.';
  end if;

  return new;
end;
$$;

comment on function public.fn_tenants_lock_code() is
  '20260922 — tenants.code 변경 잠금 트리거 함수. fn_profiles_lock_identity_fields(20260825093331)와 달리 service_role·관리자 예외가 없다 — DB 밖으로 이미 유통된 값이라 어떤 경로로도 재발급 없이는 바꿀 수 없다.';

drop trigger if exists trg_tenants_lock_code on public.tenants;
create trigger trg_tenants_lock_code
  before update on public.tenants
  for each row
  execute function public.fn_tenants_lock_code();

drop trigger if exists trg_tenants_updated_at on public.tenants;
create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3) fn_normalize_tenant_code — 표기 정규화(대소문자·공백·하이픈 흡수)
-- ---------------------------------------------------------------------

create or replace function public.fn_normalize_tenant_code(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[\s-]+', '', 'g')), '');
$$;

comment on function public.fn_normalize_tenant_code(text) is
  '20260922 — 소속 코드 표기 정규화. upper + 공백·하이픈 제거, 빈 문자열은 NULL. "ab12-cd34"/"AB12 CD34" 같은 사용자 입력 변형을 tenants.code 저장 형식과 맞추는 데 쓴다(profiles.org_code 정규화 관행, 20260825093735 과 동일 원칙).';

revoke all on function public.fn_normalize_tenant_code(text) from public, anon;
grant execute on function public.fn_normalize_tenant_code(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) fn_generate_tenant_code — 8자 코드 생성(rejection sampling)
--
--    generate_link_code_string(baseline:3581, student_link_codes 6자 코드)
--    과 동일 알고리즘을 8자로 확장했다 — get_byte 로 뽑은 바이트를 256을
--    31로 나눈 배수(248) 밑에서만 채택해 mod bias 를 없앤다.
-- ---------------------------------------------------------------------

create or replace function public.fn_generate_tenant_code()
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31자, 0/O/1/I/L 제외
  c_len      constant int  := length(c_alphabet);                -- 31
  c_limit    constant int  := (256 / c_len) * c_len;              -- 248
  v_code text := '';
  v_byte int;
begin
  while length(v_code) < 8 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < c_limit then
      v_code := v_code || substr(c_alphabet, (v_byte % c_len) + 1, 1);
    end if;
  end loop;

  return v_code;
end;
$$;

comment on function public.fn_generate_tenant_code() is
  '20260922 — 8자 소속 코드 생성(generate_link_code_string, baseline:3581 과 동일 rejection-sampling 원칙, extensions.gen_random_bytes 기반 — pgcrypto 는 baseline:43 에서 이미 설치됨). 문자집합은 tenants_code_format_check 정규식과 1:1로 맞춘 31자(0/O/1/I/L 제외). 발급 경로(fn_create_tenant·백필)에서만 부르므로 클라이언트 role 에는 실행 권한을 주지 않는다.';

revoke all on function public.fn_generate_tenant_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) fn_create_tenant — 관리자 발급 RPC (WC067)
-- ---------------------------------------------------------------------

create or replace function public.fn_create_tenant(
  p_name text,
  p_region text,
  p_org_type text,
  p_tier text
)
returns public.tenants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row  public.tenants;
  v_code text;
  v_i    integer;
begin
  if not public.fn_is_super_admin() then
    raise exception 'not_super_admin' using errcode = 'WC067';
  end if;

  for v_i in 1 .. 10 loop
    v_code := public.fn_generate_tenant_code();

    begin
      insert into public.tenants (code, name, region, org_type, tier, created_by)
      values (v_code, p_name, p_region, p_org_type, p_tier, auth.uid())
      returning * into v_row;

      return v_row;
    exception when unique_violation then
      -- 코드 충돌(31^8 공간에서 극히 희박하지만 발생 시 새 코드로 재시도).
      continue;
    end;
  end loop;

  raise exception 'tenant_code_generation_failed';
end;
$$;

comment on function public.fn_create_tenant(text, text, text, text) is
  '20260922 — 최고 관리자 전용 테넌트 발급(WC067). 코드는 fn_generate_tenant_code 로 생성하고 unique_violation 시 최대 10회 재시도한다(31^8 공간이라 충돌은 사실상 없지만 방어적으로). tier 등 내부 분류는 이 함수를 호출한 관리자만 지정하며 회원에게는 어떤 경로로도 노출되지 않는다.';

revoke all on function public.fn_create_tenant(text, text, text, text) from public, anon;
grant execute on function public.fn_create_tenant(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6) tenant_code_attempts — 소속코드 조회 실패 시도 기록 (레이트리밋 재료)
--
--    definer 함수(fn_resolve_tenant_code)만 읽고 쓴다 — 직접 select/insert
--    권한은 어떤 role 에도 주지 않는다(테이블 자체에 RLS 정책도 없음 —
--    default-deny + 명시적 revoke 이중 방어).
-- ---------------------------------------------------------------------

create table if not exists public.tenant_code_attempts (
  id           bigserial primary key,
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);

comment on table public.tenant_code_attempts is
  '20260922 — 소속 코드 조회(fn_resolve_tenant_code) 실패 시도 기록. 1시간 10회 상한(WC068)의 재료. RLS enable + 정책 없음 + 전 role revoke로 이중 방어 — 이 테이블은 definer 함수를 통해서만 접근 가능하다.';

create index if not exists tenant_code_attempts_user_id_attempted_at_idx
  on public.tenant_code_attempts (user_id, attempted_at);

alter table public.tenant_code_attempts enable row level security;

revoke all on public.tenant_code_attempts from anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) fn_resolve_tenant_code — 소속 코드로 tenant id 조회 (WC068)
--
--    tier 등 내부 정보는 절대 반환하지 않는다 — id 하나만 돌려주고, 그
--    id로 무엇을 할지(profiles.tenant_id 세팅 등)는 호출부(fn_set_my_tenant,
--    complete_signup_profile, ②·③에서 정의)의 몫이다.
--
--    못 찾으면 raise 하지 않고 NULL 을 돌려준다 — raise 하면 같은 트랜잭션
--    안의 실패 기록 insert 가 함께 롤백돼 레이트리밋이 한 번도 작동하지
--    않기 때문이다(Postgres 에는 autonomous transaction 이 없다). "없는 코드"
--    에러(WC069)를 던질지는 호출부가 정한다 — fn_set_my_tenant 는 던지지
--    않고 0행을 돌려줘 기록을 커밋시키고, complete_signup_profile 은 가입
--    자체를 거부해야 하므로 던진다(그 경로는 본인인증·전화번호 검증을
--    거쳐야만 닿을 수 있어 시도당 비용이 커 기록 유실을 감수한다).
-- ---------------------------------------------------------------------

create or replace function public.fn_resolve_tenant_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller          uuid := auth.uid();
  v_code            text;
  v_recent_failures integer;
  v_id              uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  -- 1시간 지난 기록은 판정 재료가 아니므로 이 기회에 지운다(무한 성장 방지).
  delete from public.tenant_code_attempts
   where user_id = v_caller
     and attempted_at <= now() - interval '1 hour';

  select count(*) into v_recent_failures
    from public.tenant_code_attempts
   where user_id = v_caller;

  if v_recent_failures >= 10 then
    raise exception 'tenant_code_attempts_exceeded' using errcode = 'WC068';
  end if;

  v_code := public.fn_normalize_tenant_code(p_code);

  select t.id into v_id
    from public.tenants t
   where t.code = v_code;

  if v_id is null then
    insert into public.tenant_code_attempts (user_id) values (v_caller);
    return null;
  end if;

  return v_id;
end;
$$;

comment on function public.fn_resolve_tenant_code(text) is
  '20260922 — 소속 코드 → tenant id 조회. 최근 1시간 실패 10회 이상이면 조회 자체를 거부한다(WC068, tenant_code_attempts 집계 — 1시간 지난 행은 호출 때마다 정리). 정규화(fn_normalize_tenant_code) 후 못 찾으면 실패 기록을 남기고 NULL 을 돌려준다 — raise 하면 기록 insert 가 같이 롤백돼 리밋이 무력화되므로, 거부 에러(WC069)는 호출부 책임이다. tier 등 내부 컬럼은 반환하지 않는다 — id 만 돌려준다.';

revoke all on function public.fn_resolve_tenant_code(text) from public, anon;
grant execute on function public.fn_resolve_tenant_code(text) to authenticated;

-- ---------------------------------------------------------------------
-- 8) admin_resources — '회원 관리' 그룹에 '소속(테넌트) 관리' 메뉴 등록
--
--    group_title 은 정본 '회원관리'(공백 없음, 20260823000002 recategorize
--    기준 — AdminRolesAdmin 이 group_title 로 묶어 그리므로 '회원 관리'로
--    적으면 권한 화면에 빈 그룹이 하나 더 생긴다). 그 그룹의 members 는
--    sort_order 610 이라, 소속 마스터가 회원의 상위 개념이므로 그 앞(605)에
--    둔다.
-- ---------------------------------------------------------------------

insert into public.admin_resources (key, group_title, label, sort_order) values
  ('tenants', '회원관리', '소속(테넌트) 관리', 605)
on conflict (key) do update
  set group_title = excluded.group_title,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      is_active   = true;
