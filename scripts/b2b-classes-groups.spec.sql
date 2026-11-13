-- =====================================================================
-- B2B 기반 3: 반 그룹, 학급, 이름 정규화와 학급 찾기/만들기 SQL 스펙 (T3)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-classes-groups.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_ok(t text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise notice '[PASS] % 성공', t;
end $$;

-- 주어진 SQL 이 want 로 지정한 SQLSTATE 로 실패하는지 단언한다.
create function pg_temp.expect_error(t text, p_sql text, want text) returns void
language plpgsql as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state is distinct from want then
      raise exception '[FAIL] %: sqlstate %, want %', t, v_state, want;
    end if;
    raise notice '[PASS] % = %', t, want;
    return;
  end;
  raise exception '[FAIL] %: 예외가 나지 않았다, want %', t, want;
end $$;

create function pg_temp.expect_text(t text, got text, want text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.mk_tenant(p_code text, p_org_type text) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier)
  values (p_code, 't3-' || p_code, '서울', p_org_type, 'B')
  returning id into v_id;
  return v_id;
end $$;

-- 임시 테이블에 픽스처 id 를 둔다. 아래 단언은 SQL 문자열 안에서 이 값을 읽는다.
create temp table fx (k text primary key, v uuid);
insert into fx values
  ('school', pg_temp.mk_tenant('T3SKHWXY', '학교')),
  ('academy', pg_temp.mk_tenant('T3AKADMY', '사기업')),
  ('other', pg_temp.mk_tenant('T3THRRRR', '학교'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

-- 이름 정규화: 학교는 숫자만, 학원은 공백 제거
select pg_temp.expect_text('학교 03 은 3', public.fn_normalize_class_name('학교', '03'), '3');
select pg_temp.expect_text('학교 3반 은 3', public.fn_normalize_class_name('학교', '3반'), '3');
select pg_temp.expect_text('학교 3 은 3', public.fn_normalize_class_name('학교', '3'), '3');
select pg_temp.expect_text('학교 10 은 10', public.fn_normalize_class_name('학교', '10'), '10');
select pg_temp.expect_text('학원 공백 포함 A 1 은 A1', public.fn_normalize_class_name('사기업', ' A 1 '), 'A1');
select pg_temp.expect_text('학원 org_type 이 학교가 아니면 모두 학원 규칙',
  public.fn_normalize_class_name('기타', ' 가 나 '), '가나');

-- fn_class_ensure: 같은 입력이면 같은 id
create temp table ids (k text primary key, v uuid);
insert into ids values
  ('s1', public.fn_class_ensure(pg_temp.fx('school'), 2026, '고1', null, '03')),
  ('s2', public.fn_class_ensure(pg_temp.fx('school'), 2026, '고1', null, '3반'));
select pg_temp.expect_bool('학교 03 과 3반 은 같은 학급',
  (select v from ids where k = 's1') = (select v from ids where k = 's2'), true);
select pg_temp.expect_text('학급 이름은 정규화되어 저장',
  (select name from public.classes where id = (select v from ids where k = 's1')), '3');
select pg_temp.expect_bool('다른 학년이면 다른 학급',
  public.fn_class_ensure(pg_temp.fx('school'), 2026, '고2', null, '3') <> (select v from ids where k = 's1'), true);

insert into ids values
  ('a1', public.fn_class_ensure(pg_temp.fx('academy'), 2026, '고1', null, ' A 1 ')),
  ('a2', public.fn_class_ensure(pg_temp.fx('academy'), 2026, '고1', null, 'a1'));
select pg_temp.expect_text('학원 학급 이름 공백 제거',
  (select name from public.classes where id = (select v from ids where k = 'a1')), 'A1');
select pg_temp.expect_bool('학원 학급은 대소문자 무시로 같은 학급',
  (select v from ids where k = 'a1') = (select v from ids where k = 'a2'), true);
select pg_temp.expect_error('숫자가 없는 학교 학급 이름 거부',
  $$select public.fn_class_ensure(pg_temp.fx('school'), 2026, '고1', null, '가')$$, '22023');

-- 그룹: 학원만, 같은 테넌트 안에서 이름 유일(삭제된 그룹 이름은 재사용 가능)
insert into public.class_groups (tenant_id, name) values (pg_temp.fx('academy'), '심화반');
select pg_temp.expect_error('같은 테넌트 그룹 이름 중복 거부(대소문자 무시)',
  $$insert into public.class_groups (tenant_id, name) values (pg_temp.fx('academy'), '심화반')$$, '23505');
select pg_temp.expect_ok('다른 테넌트는 같은 그룹 이름 가능',
  $$insert into public.class_groups (tenant_id, name) values (pg_temp.fx('other'), '심화반')$$);
select pg_temp.expect_error('빈 그룹 이름 거부',
  $$insert into public.class_groups (tenant_id, name) values (pg_temp.fx('academy'), '  ')$$, '23514');
update public.class_groups set deleted_at = now()
  where tenant_id = pg_temp.fx('academy') and name = '심화반';
select pg_temp.expect_ok('삭제된 그룹 이름은 재사용 가능',
  $$insert into public.class_groups (tenant_id, name) values (pg_temp.fx('academy'), '심화반')$$);

-- 그룹이 있는 학급
insert into ids values ('g1', (select id from public.class_groups
  where tenant_id = pg_temp.fx('academy') and deleted_at is null));
insert into ids values
  ('ag1', public.fn_class_ensure(pg_temp.fx('academy'), 2026, '고1', (select v from ids where k = 'g1'), 'A1')),
  ('ag2', public.fn_class_ensure(pg_temp.fx('academy'), 2026, '고1', (select v from ids where k = 'g1'), 'a1'));
select pg_temp.expect_bool('그룹이 같으면 같은 학급',
  (select v from ids where k = 'ag1') = (select v from ids where k = 'ag2'), true);
select pg_temp.expect_bool('그룹이 있으면 그룹 없는 같은 이름과 다른 학급',
  (select v from ids where k = 'ag1') <> (select v from ids where k = 'a1'), true);
select pg_temp.expect_error('학교는 그룹을 쓰지 않는다',
  $$select public.fn_class_ensure(pg_temp.fx('school'), 2026, '고1',
      (select v from ids where k = 'g1'), '1')$$, '22023');

-- 학급 유일성: group null 도 같은 값으로 취급(NULLS NOT DISTINCT)
select pg_temp.expect_error('그룹 null 인 같은 학급 직접 insert 거부',
  $$insert into public.classes (tenant_id, school_year, grade, group_id, name)
    values (pg_temp.fx('school'), 2026, '고1', null, '3')$$, '23505');

-- 다른 테넌트의 그룹은 FK 로 거부
select pg_temp.expect_error('다른 테넌트 그룹을 쓰는 학급 거부',
  $$insert into public.classes (tenant_id, school_year, grade, group_id, name)
    values (pg_temp.fx('school'), 2026, '고3', (select v from ids where k = 'g1'), '9')$$, '23503');

-- 다학년 학급(grade null): 학원만, 같은 입력이면 같은 학급(NULLS NOT DISTINCT 인덱스의 ON CONFLICT)
insert into ids values
  ('m1', public.fn_class_ensure(pg_temp.fx('academy'), 2026, null, null, ' M 7 ')),
  ('m2', public.fn_class_ensure(pg_temp.fx('academy'), 2026, null, null, 'm7'));
select pg_temp.expect_bool('다학년: 같은 입력이면 같은 학급(멱등)',
  (select v from ids where k = 'm1') = (select v from ids where k = 'm2'), true);
select pg_temp.expect_bool('다학년: grade 가 null 로 저장된다',
  (select grade is null and name = 'M7' from public.classes where id = (select v from ids where k = 'm1')), true);
select pg_temp.expect_bool('다학년: 한 기관, 학년도, 그룹, 이름에 한 학급뿐',
  (select count(*) from public.classes where tenant_id = pg_temp.fx('academy') and school_year = 2026
     and grade is null and group_id is null and name = 'M7') = 1, true);
select pg_temp.expect_error('다학년: 같은 다학년 학급 직접 insert 거부(null 도 같은 값)',
  $$insert into public.classes (tenant_id, school_year, grade, group_id, name)
    values (pg_temp.fx('academy'), 2026, null, null, 'M7')$$, '23505');
select pg_temp.expect_error('다학년: 학교는 학년 없는 학급을 ensure 할 수 없다',
  $$select public.fn_class_ensure(pg_temp.fx('school'), 2026, null, null, '5')$$, '22023');
select pg_temp.expect_error('다학년: 학교는 학년 없는 학급을 직접 insert 할 수 없다',
  $$insert into public.classes (tenant_id, school_year, grade, name) values (pg_temp.fx('school'), 2026, null, '5')$$, '23514');

-- 이름 우선: 학원에서 학생이 실제 학년과 학급 이름을 보내면, 같은 기관, 학년도, 그룹, 이름의 다학년 학급이 먼저다
select pg_temp.expect_bool('우선: 실제 학년으로 불러도 같은 이름의 다학년 학급을 돌려준다',
  public.fn_class_ensure(pg_temp.fx('academy'), 2026, '고2', null, 'M7') = (select v from ids where k = 'm1'), true);
select pg_temp.expect_bool('우선: 대소문자와 공백을 무시한다',
  public.fn_class_ensure(pg_temp.fx('academy'), 2026, '중1', null, ' m 7') = (select v from ids where k = 'm1'), true);
select pg_temp.expect_bool('우선: 학년 있는 M7 학급은 그룹 없는 올해에는 만들어지지 않는다',
  not exists (select 1 from public.classes where tenant_id = pg_temp.fx('academy') and school_year = 2026
     and group_id is null and name = 'M7' and grade is not null), true);
insert into ids values
  ('pg', public.fn_class_ensure(pg_temp.fx('academy'), 2026, '고2', (select v from ids where k = 'g1'), 'M7')),
  ('py', public.fn_class_ensure(pg_temp.fx('academy'), 2027, '고2', null, 'M7')),
  ('p8', public.fn_class_ensure(pg_temp.fx('academy'), 2026, '고2', null, 'M8'));
select pg_temp.expect_bool('우선: 그룹이 다르면 다학년 학급이 아니라 새 학년 학급이다',
  (select grade = '고2' and id <> (select v from ids where k = 'm1') from public.classes where id = (select v from ids where k = 'pg')), true);
select pg_temp.expect_bool('우선: 학년도가 다르면 다학년 학급이 아니라 새 학년 학급이다',
  (select grade = '고2' from public.classes where id = (select v from ids where k = 'py')), true);
select pg_temp.expect_bool('우선: 다른 이름은 학년 학급을 만든다',
  (select grade = '고2' from public.classes where id = (select v from ids where k = 'p8')), true);
select pg_temp.expect_error('같은 이름의 학년 학급이 이미 있으면 다학년 학급을 만들 수 없다(WC105)',
  $$select public.fn_class_ensure(pg_temp.fx('academy'), 2026, null, null, ' m 8')$$, 'WC105');
select pg_temp.expect_bool('거부된 다학년 학급은 남지 않고 M8 은 학년 학급 하나뿐이다',
  (select count(*) from public.classes where tenant_id = pg_temp.fx('academy') and school_year = 2026
     and group_id is null and lower(name) = 'm8') = 1, true);
insert into ids values ('m8g', public.fn_class_ensure(pg_temp.fx('academy'), 2026, null, (select v from ids where k = 'g1'), 'M8'));
select pg_temp.expect_bool('같은 이름이어도 그룹이 다르면 다학년 학급을 만들 수 있다',
  (select grade is null from public.classes where id = (select v from ids where k = 'm8g')), true);
select pg_temp.expect_text('우선: 학교는 영향이 없다(학년 학급)',
  (select grade from public.classes where id = public.fn_class_ensure(pg_temp.fx('school'), 2026, '고1', null, '3')), '고1');

-- 학년이 아닌 값은 이름 우선 규칙이 다학년 학급을 돌려주기 전에 테이블 CHECK 와 같은 오류로 막는다
select pg_temp.expect_error('학년 목록 밖 값은 다학년 학급이 있어도 거부(23514)',
  $$select public.fn_class_ensure(pg_temp.fx('academy'), 2026, '초6', null, 'M7')$$, '23514');

-- 학급 find-or-create 는 이름마다가 아니라 (기관, 학년도) 당 자문 잠금 하나만 잡는다(명단 적용의 잠금과 같은 키)
create function pg_temp.adv_locks() returns bigint language sql as $$
  select count(*) from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()
$$;
do $$
declare
  v_t uuid := (select id from public.tenants where code = 'T3AKADMY');
  v_n bigint;
  v_base bigint := pg_temp.adv_locks();
begin
  perform public.fn_class_ensure(v_t, 2030, '고1', null, 'LK1');
  perform public.fn_class_ensure(v_t, 2030, '고2', null, 'LK2');
  perform public.fn_class_ensure(v_t, 2030, '고3', null, 'LK3');
  select pg_temp.adv_locks() - v_base into v_n;
  if v_n <> 1 then raise exception '[FAIL] 잠금: 이름이 달라도 같은 기관, 학년도는 잠금 하나, got %', v_n; end if;
  perform public.fn_roster_pending_lock(v_t, 2030);
  select pg_temp.adv_locks() - v_base into v_n;
  if v_n <> 1 then raise exception '[FAIL] 잠금: 명단 적용의 잠금과 같은 키라 다시 잡아도 늘지 않는다, got %', v_n; end if;
  perform public.fn_class_ensure(v_t, 2031, '고1', null, 'LK1');
  select pg_temp.adv_locks() - v_base into v_n;
  if v_n <> 2 then raise exception '[FAIL] 잠금: 다른 학년도는 잠금이 하나 더, got %', v_n; end if;
  raise notice '[PASS] 잠금: 학급 find-or-create 는 (기관, 학년도) 당 하나이고 명단 적용의 잠금과 같다';
end $$;

-- 값 제약과 불변 컬럼
select pg_temp.expect_error('grade 목록 밖 거부',
  $$insert into public.classes (tenant_id, school_year, grade, name)
    values (pg_temp.fx('school'), 2026, '고4', '1')$$, '23514');
select pg_temp.expect_error('capacity 0 거부',
  $$insert into public.classes (tenant_id, school_year, grade, name, capacity)
    values (pg_temp.fx('school'), 2026, '중1', '1', 0)$$, '23514');
select pg_temp.expect_error('tenant_id 변경 거부',
  $$update public.classes set tenant_id = pg_temp.fx('other')
    where id = (select v from ids where k = 's1')$$, '23514');

-- 클라이언트 role 은 테이블을 읽을 수 없고 함수를 실행할 수 없다
-- (기본 권한 때문에 pg_temp 헬퍼도 명시적으로 열어야 role 전환 후 호출된다)
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 classes 조회 불가',
  $$select count(*) from public.classes$$, '42501');
select pg_temp.expect_error('anon 은 fn_class_ensure 실행 불가',
  $$select public.fn_class_ensure(null, 2026, '고1', null, '1')$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 class_groups 조회 불가',
  $$select count(*) from public.class_groups$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_normalize_class_name 실행 불가',
  $$select public.fn_normalize_class_name('학교', '1')$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-classes-groups.spec: 전체 통과 ==='; end $$;

rollback;
