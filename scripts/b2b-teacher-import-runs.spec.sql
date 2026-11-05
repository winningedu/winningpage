-- =====================================================================
-- B2B 기반 8: 교사 일괄 등록 실행 기록과 학급 덮어쓰기 함수 SQL 스펙 (T17)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-teacher-import-runs.spec.sql
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

create function pg_temp.expect_int(t text, got bigint, want bigint) returns void
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

create temp table fx (k text primary key, v uuid);
insert into public.tenants (code, name, region, org_type, tier)
  values ('JRAAAAAA', 't17-a', '서울', '학교', 'B'),
         ('JRBBBBBB', 't17-b', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'JRAAAAAA';
insert into fx select 'tb', id from public.tenants where code = 'JRBBBBBB';
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

-- ---------------------------------------------------------------------
-- 실행 기록: request_id 는 유일하고 건수는 음수가 될 수 없다
-- ---------------------------------------------------------------------
select pg_temp.expect_ok('실행 기록 insert',
  $$insert into public.teacher_import_runs (id, tenant_id, request_id, total_rows)
    values (gen_random_uuid(), pg_temp.fx('ta'), '11111111-1111-4111-8111-111111111111', 3)$$);
select pg_temp.expect_error('같은 request_id 는 23505',
  $$insert into public.teacher_import_runs (id, tenant_id, request_id, total_rows)
    values (gen_random_uuid(), pg_temp.fx('tb'), '11111111-1111-4111-8111-111111111111', 1)$$, '23505');
select pg_temp.expect_error('음수 건수는 23514',
  $$insert into public.teacher_import_runs (id, tenant_id, request_id, total_rows, created_count)
    values (gen_random_uuid(), pg_temp.fx('ta'), '22222222-2222-4222-8222-222222222222', 1, -1)$$, '23514');
select pg_temp.expect_text('기본값: 완료 전 finished_at 은 null',
  (select (finished_at is null)::text || '/' || row_results::text || '/' || error_count
     from public.teacher_import_runs where request_id = '11111111-1111-4111-8111-111111111111'),
  'true/[]/0');

-- ---------------------------------------------------------------------
-- fn_teacher_import_move_class: 담임 덮어쓰기
-- ---------------------------------------------------------------------
create function pg_temp.reg(p_tenant text, p_name text, p_phone text, p_classes jsonb) returns uuid
language sql as $$
  select teacher_id from public.fn_teacher_register(pg_temp.fx(p_tenant), p_name, p_phone, 'homeroom', p_classes, null)
$$;
create function pg_temp.cid(p_tenant text, p_grade text, p_name text) returns uuid language sql as $$
  select public.fn_class_ensure(pg_temp.fx(p_tenant),
    (select school_year from public.tenants where id = pg_temp.fx(p_tenant)), p_grade, null, p_name)
$$;
create function pg_temp.holder(p_class uuid) returns uuid language sql as $$
  select teacher_id from public.teacher_class_assignments where class_id = p_class
$$;

create temp table t (k text primary key, v uuid);
insert into t values
  ('old', pg_temp.reg('ta', '기존담임', '01090000001', '[{"grade":"고1","name":"1"},{"grade":"고1","name":"2"}]')),
  ('solo', pg_temp.reg('ta', '외톨이', '01090000002', '[{"grade":"고2","name":"1"}]')),
  ('new', pg_temp.reg('ta', '새담임', '01090000003', '[]')),
  ('other', pg_temp.reg('tb', '다른기관', '01090000004', '[]'));
create function pg_temp.t(p_k text) returns uuid language sql as $$ select v from t where k = p_k $$;

select pg_temp.expect_ok('다른 담임이 있는 학급을 새 교사에게 옮긴다',
  $$select public.fn_teacher_import_move_class(pg_temp.cid('ta', '고1', '1'), pg_temp.t('new'))$$);
select pg_temp.expect_bool('학급 담임이 새 교사가 된다',
  pg_temp.holder(pg_temp.cid('ta', '고1', '1')) = pg_temp.t('new'), true);
select pg_temp.expect_bool('옮겨 받은 첫 학급은 주담당',
  (select is_primary from public.teacher_class_assignments where class_id = pg_temp.cid('ta', '고1', '1')), true);
select pg_temp.expect_bool('옛 담임에게는 남은 학급이 주담당으로 승계된다',
  (select is_primary from public.teacher_class_assignments where class_id = pg_temp.cid('ta', '고1', '2')), true);
select pg_temp.expect_ok('같은 교사에게 다시 옮겨도 성공(재시도)',
  $$select public.fn_teacher_import_move_class(pg_temp.cid('ta', '고1', '1'), pg_temp.t('new'))$$);
select pg_temp.expect_ok('마지막 학급을 빼앗겨도 옛 교사는 학급 없이 남는다',
  $$select public.fn_teacher_import_move_class(pg_temp.cid('ta', '고2', '1'), pg_temp.t('new'))$$);
select pg_temp.expect_int('빼앗긴 교사의 학급 수',
  (select count(*) from public.teacher_class_assignments where teacher_id = pg_temp.t('solo')), 0);
select pg_temp.expect_bool('옮겨 받은 두 번째 학급은 주담당이 아니다',
  (select not is_primary from public.teacher_class_assignments where class_id = pg_temp.cid('ta', '고2', '1')), true);
select pg_temp.expect_error('다른 기관 교사에게는 WC088',
  $$select public.fn_teacher_import_move_class(pg_temp.cid('ta', '고1', '2'), pg_temp.t('other'))$$, 'WC088');
select pg_temp.expect_error('없는 학급은 WC088',
  $$select public.fn_teacher_import_move_class(gen_random_uuid(), pg_temp.t('new'))$$, 'WC088');
select pg_temp.expect_error('없는 교사는 WC088',
  $$select public.fn_teacher_import_move_class(pg_temp.cid('ta', '고1', '2'), gen_random_uuid())$$, 'WC088');

-- ---------------------------------------------------------------------
-- 클라이언트 role 차단
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 실행 기록 조회 불가',
  $$select count(*) from public.teacher_import_runs$$, '42501');
select pg_temp.expect_error('anon 은 fn_teacher_import_move_class 실행 불가',
  $$select public.fn_teacher_import_move_class(null, null)$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 실행 기록 조회 불가',
  $$select count(*) from public.teacher_import_runs$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-teacher-import-runs.spec: 전체 통과 ==='; end $$;

rollback;
