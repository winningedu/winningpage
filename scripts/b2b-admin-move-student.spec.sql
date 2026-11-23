-- =====================================================================
-- 스쿨멘토 본사 학생 이동 SQL 스펙(5번): fn_admin_move_student_tenant
--
-- 실행: 마이그레이션이 전부 적용된 스택(로컬 스크래치 DB 복사본)에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-admin-move-student.spec.sql
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

create function pg_temp.mk_user(p_email text, p_tenant uuid default null) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, 'x', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );
  insert into public.profiles (id, name, role, email, tenant_id, member_type)
  values (v_id, p_email, 'user', p_email, p_tenant, 'student')
  on conflict (id) do update set tenant_id = excluded.tenant_id, member_type = excluded.member_type;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Seoul')::date $$;


-- 이미 있는 기타 기관은 이 스펙 안에서만 내려, 스펙이 만든 기타 기관과 겹치지 않게 한다.
update public.tenants set is_catch_all = false where is_catch_all;

create function pg_temp.mk_tenant(p_key text, p_code text, p_org_type text default '학교', p_catch_all boolean default false)
returns void language plpgsql as $$
declare
  v_tenant uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier, is_catch_all, contract_start_date)
  values (p_code, 'tmv-' || p_key, '서울', p_org_type, 'B', p_catch_all, pg_temp.today() - 10)
  returning id into v_tenant;
  insert into fx values ('t_' || p_key, v_tenant);
end $$;

select pg_temp.mk_tenant('from', 'TMAAAAAA');
select pg_temp.mk_tenant('to', 'TMBBBBBB');
select pg_temp.mk_tenant('acad', 'TMCCCCCC', '기관');
select pg_temp.mk_tenant('third', 'TMEEEEEE');
select pg_temp.mk_tenant('etc', 'TMDDDDDD', '기타', true);
insert into public.class_groups (tenant_id, name) values (pg_temp.fx('t_acad'), '심화반');

-- 학생: from 기관 소속, 올해 학적(반 포함)과 졸업 학적(작년), 대기 중인 반 변경 신청 한 건
create function pg_temp.mk_stu(p_key text, p_phone text) returns void language plpgsql as $$
declare
  v_uid uuid := pg_temp.mk_user('tmv-' || p_key || '@t.local', pg_temp.fx('t_from'));
  v_year smallint;
begin
  update public.profiles set phone = p_phone, school_name = 'tmv-from' where id = v_uid;
  insert into public.student_profiles (profile_id, grade) values (v_uid, '고1');
  perform public.fn_enrollment_join(v_uid, pg_temp.fx('t_from'), '고1', null, '1반', right(p_phone, 2)::smallint);
  select school_year into v_year from public.tenants where id = pg_temp.fx('t_from');
  insert into public.student_enrollments (tenant_id, student_id, school_year, grade, status, graduated_at)
  values (pg_temp.fx('t_from'), v_uid, v_year - 1, '중3', 'graduated', now());
  insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status, to_grade, requested_by)
  values (pg_temp.fx('t_from'), v_uid, v_year, 'request', 'pending', '고2', v_uid);
  insert into fx values (p_key, v_uid);
end $$;

create function pg_temp.mv(p_key text, p_to text, p_grade text, p_group text, p_class text, p_number smallint)
returns text language sql as $$
  select format('select * from public.fn_admin_move_student_tenant(%L, %L, %L, %L, %L, %L, %L)',
    pg_temp.fx('actor'), pg_temp.fx(p_key), pg_temp.fx('t_' || p_to), p_grade, p_group, p_class, p_number)
$$;

-- 처음 그대로인지 한 줄로 본다: 소속, from 활성 학적 수, 대기 신청 수
create function pg_temp.untouched(p_key text) returns text language sql as $$
  select (select (tenant_id = pg_temp.fx('t_from'))::text from public.profiles where id = pg_temp.fx(p_key))
      || ':' || (select count(*) from public.student_enrollments where student_id = pg_temp.fx(p_key) and tenant_id = pg_temp.fx('t_from') and status = 'active')
      || ':' || (select count(*) from public.enrollment_changes where student_id = pg_temp.fx(p_key) and status = 'pending')
$$;

insert into fx values ('actor', pg_temp.mk_user('tmv-actor@t.local', null));

-- ---------------------------------------------------------------------
-- 실패: 아무것도 바꾸지 않는다
-- ---------------------------------------------------------------------
select pg_temp.mk_stu('s_fail', '010-8000-0001');
select pg_temp.expect_text('기준: from 소속, 활성 학적 1, 대기 신청 1', pg_temp.untouched('s_fail'), 'true:1:1');

select pg_temp.mk_user('tmv-teacher@t.local', pg_temp.fx('t_from')) as nonstu \gset
update public.profiles set member_type = 'teacher' where id = :'nonstu'::uuid;
insert into fx values ('nonstu', :'nonstu'::uuid);
select pg_temp.expect_error('학생이 아니면 WC094', pg_temp.mv('nonstu', 'to', '고2', null, '1반', null), 'WC094');
select pg_temp.expect_error('같은 기관이면 WC099', pg_temp.mv('s_fail', 'from', '고2', null, '1반', null), 'WC099');
select pg_temp.expect_error('없는 기관이면 P0002',
  format('select * from public.fn_admin_move_student_tenant(%L, %L, %L, %L, null, null, null)',
    pg_temp.fx('actor'), pg_temp.fx('s_fail'), gen_random_uuid(), '고2'), 'P0002');

-- 대상 기관에 같은 전화번호(숫자 기준)
select pg_temp.mk_user('tmv-samephone@t.local', pg_temp.fx('t_to')) as samephone \gset
update public.profiles set phone = '01080000001' where id = :'samephone'::uuid;
select pg_temp.expect_error('대상 기관에 같은 번호가 있으면 WC096', pg_temp.mv('s_fail', 'to', '고2', null, '1반', 1::smallint), 'WC096');
select pg_temp.expect_text('WC096 이면 아무것도 바뀌지 않는다', pg_temp.untouched('s_fail'), 'true:1:1');
update public.profiles set phone = null where id = :'samephone'::uuid;

-- 같은 반 같은 번호(다른 학생이 이미 8번): 중간까지 한 일이 모두 되돌아간다
select pg_temp.mk_user('tmv-occupant@t.local', pg_temp.fx('t_to')) as occupant \gset
select public.fn_enrollment_join(:'occupant'::uuid, pg_temp.fx('t_to'), '고2', null, '3반', 8::smallint);
select pg_temp.expect_error('번호가 이미 쓰이면 WC077', pg_temp.mv('s_fail', 'to', '고2', null, '3반', 8::smallint), 'WC077');
select pg_temp.expect_text('WC077 이면 전부 되돌아간다', pg_temp.untouched('s_fail'), 'true:1:1');
select pg_temp.expect_text('WC077 이면 school_name 도 그대로',
  (select school_name from public.profiles where id = pg_temp.fx('s_fail')), 'tmv-from');

-- ---------------------------------------------------------------------
-- 성공: 학교로 이동
-- ---------------------------------------------------------------------
select pg_temp.mk_stu('s1', '010-8000-0002');
select pg_temp.expect_text('이동하면 이전 기관, 새 기관, 학적 id 를 돌려준다',
  (select (m.from_tenant_id = pg_temp.fx('t_from'))::text || ':' || (m.tenant_id = pg_temp.fx('t_to'))::text || ':' || (m.enrollment_id is not null)::text
     from public.fn_admin_move_student_tenant(pg_temp.fx('actor'), pg_temp.fx('s1'), pg_temp.fx('t_to'), '고2', null, '3반', 7::smallint) m),
  'true:true:true');
select pg_temp.expect_text('소속이 바뀌고 학교는 school_name 이 기관 이름',
  (select (tenant_id = pg_temp.fx('t_to'))::text || ':' || coalesce(school_name, '-') from public.profiles where id = pg_temp.fx('s1')), 'true:tmv-to');
select pg_temp.expect_int('이전 기관의 올해 활성 학적은 지워진다',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('s1') and tenant_id = pg_temp.fx('t_from') and status = 'active'), 0);
select pg_temp.expect_int('졸업 학적은 그대로 남는다',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('s1') and tenant_id = pg_temp.fx('t_from') and status = 'graduated'), 1);
select pg_temp.expect_text('새 학적은 대상 기관 올해 학년도에 학년, 반, 번호가 들어간다',
  (select (e.school_year = t.school_year)::text || ':' || e.grade || ':' || c.name || ':' || e.number
     from public.student_enrollments e join public.classes c on c.id = e.class_id join public.tenants t on t.id = e.tenant_id
    where e.student_id = pg_temp.fx('s1') and e.tenant_id = pg_temp.fx('t_to') and e.status = 'active'), 'true:고2:3:7');
select pg_temp.expect_text('이전 기관의 대기 신청은 소속 변경 사유로 rejected, 결정자는 실행자',
  (select c.status || ':' || c.reject_reason || ':' || (c.decided_by = pg_temp.fx('actor'))::text
     from public.enrollment_changes c where c.student_id = pg_temp.fx('s1') and c.tenant_id = pg_temp.fx('t_from') and c.kind = 'request'),
  'rejected:소속 변경:true');
select pg_temp.expect_int('이전 기관의 이력(signup 적용)은 그대로 남는다',
  (select count(*) from public.enrollment_changes where student_id = pg_temp.fx('s1') and tenant_id = pg_temp.fx('t_from') and kind = 'signup'), 1);

-- 반을 비우면 반 없는 학적 행
select pg_temp.mk_stu('s2', '010-8000-0003');
select pg_temp.expect_ok('반을 비우고 옮긴다', pg_temp.mv('s2', 'to', '고1', null, null, null));
select pg_temp.expect_text('반 없는 학적 행이 생긴다',
  (select (e.class_id is null)::text || ':' || coalesce(e.number::text, '-') from public.student_enrollments e
    where e.student_id = pg_temp.fx('s2') and e.tenant_id = pg_temp.fx('t_to') and e.status = 'active'), 'true:-');

-- 학원은 그룹을 받고 school_name 을 비운다
select pg_temp.mk_stu('s3', '010-8000-0004');
select pg_temp.expect_ok('학원으로 그룹을 주고 옮긴다', pg_temp.mv('s3', 'acad', '고1', '심화반', 'A반', null));
select pg_temp.expect_text('학원은 school_name 을 비운다',
  (select coalesce(school_name, '-') from public.profiles where id = pg_temp.fx('s3')), '-');
select pg_temp.expect_text('학원 학적은 그룹 학급이다',
  (select g.name from public.student_enrollments e join public.classes c on c.id = e.class_id join public.class_groups g on g.id = c.group_id
    where e.student_id = pg_temp.fx('s3') and e.tenant_id = pg_temp.fx('t_acad')), '심화반');

-- 기타 기관으로도 반 없이 옮길 수 있다
select pg_temp.mk_stu('s4', '010-8000-0005');
select pg_temp.expect_ok('기타로 반 없이 옮긴다', pg_temp.mv('s4', 'etc', '고1', null, null, null));
select pg_temp.expect_text('기타 소속이 되고 school_name 은 비어 있다',
  (select (tenant_id = pg_temp.fx('t_etc'))::text || ':' || coalesce(school_name, '-') from public.profiles where id = pg_temp.fx('s4')), 'true:-');

-- 제3 기관에 올해 활성 학적이 남은 학생(본사가 소속만 옮긴 경우)도 옮긴다. 그 행은 지워진다.
select pg_temp.mk_stu('s5', '010-8000-0006');
delete from public.student_enrollments where student_id = pg_temp.fx('s5') and status = 'active';
insert into public.student_enrollments (tenant_id, student_id, school_year, grade, status)
select pg_temp.fx('t_third'), pg_temp.fx('s5'), t.school_year, '고1', 'active' from public.tenants t where t.id = pg_temp.fx('t_acad');
select pg_temp.expect_int('이동 전 제3 기관에 올해 활성 학적이 있다',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('s5') and tenant_id = pg_temp.fx('t_third') and status = 'active'), 1);
select pg_temp.expect_ok('기관을 건너 옮겨도 학적은 하나만 남는다', pg_temp.mv('s5', 'acad', '고1', null, null, null));
select pg_temp.expect_int('제3 기관의 활성 학적은 지워진다',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('s5') and tenant_id = pg_temp.fx('t_third')), 0);
select pg_temp.expect_int('올해 활성 학적은 대상 기관 하나',
  (select count(*) from public.student_enrollments e join public.tenants t on t.id = e.tenant_id
    where e.student_id = pg_temp.fx('s5') and e.status = 'active' and e.school_year = t.school_year), 1);

-- 대기 신청은 어느 기관에 있든 모두 거절한다(대기 신청은 학생당 하나)
select pg_temp.mk_stu('s6', '010-8000-0007');
update public.enrollment_changes set tenant_id = pg_temp.fx('t_third') where student_id = pg_temp.fx('s6') and status = 'pending';
select pg_temp.expect_ok('제3 기관에 대기 신청이 있어도 옮긴다', pg_temp.mv('s6', 'to', '고1', null, null, null));
select pg_temp.expect_text('제3 기관의 대기 신청도 소속 변경 사유로 rejected, 결정자는 실행자',
  (select c.status || ':' || c.reject_reason || ':' || (c.decided_by = pg_temp.fx('actor'))::text
     from public.enrollment_changes c where c.student_id = pg_temp.fx('s6') and c.tenant_id = pg_temp.fx('t_third') and c.kind = 'request'),
  'rejected:소속 변경:true');

-- 올해 학적이 다른 기관에 졸업으로 남은 학생은 막는다(기관마다 학년도 전환 시점이 달랐던 경우). 아무것도 바꾸지 않는다.
select pg_temp.mk_stu('s7', '010-8000-0008');
delete from public.student_enrollments where student_id = pg_temp.fx('s7') and status = 'active';
insert into public.student_enrollments (tenant_id, student_id, school_year, grade, status, graduated_at)
select pg_temp.fx('t_third'), pg_temp.fx('s7'), t.school_year, '고1', 'graduated', now() from public.tenants t where t.id = pg_temp.fx('t_to');
select pg_temp.expect_error('올해 학적이 다른 기관에 남아 있으면 WC100', pg_temp.mv('s7', 'to', '고1', null, null, null), 'WC100');
select pg_temp.expect_text('WC100 이면 소속, 대기 신청, 졸업 행이 그대로다',
  (select (tenant_id = pg_temp.fx('t_from'))::text from public.profiles where id = pg_temp.fx('s7'))
    || ':' || (select count(*) from public.enrollment_changes where student_id = pg_temp.fx('s7') and status = 'pending')
    || ':' || (select count(*) from public.student_enrollments where student_id = pg_temp.fx('s7') and tenant_id = pg_temp.fx('t_third') and status = 'graduated'),
  'true:1:1');

-- ---------------------------------------------------------------------
-- 권한: service_role 전용
-- ---------------------------------------------------------------------
select pg_temp.expect_text('authenticated, anon, public 은 실행할 수 없고 service_role 만 된다',
  (select string_agg(r || ':' || has_function_privilege(r, 'public.fn_admin_move_student_tenant(uuid, uuid, uuid, text, text, text, smallint)', 'execute')::text, ',' order by r)
     from unnest(array['anon', 'authenticated', 'service_role']) r),
  'anon:false,authenticated:false,service_role:true');

rollback;
