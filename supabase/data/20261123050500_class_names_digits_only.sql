-- 반 이름을 숫자만 쓰도록 맞춘다(결정: 학교와 학원 모두 반 이름은 숫자만).
-- 규칙(fn_normalize_class_name 과 같다): 바깥 공백을 지우고, 끝의 "반" 한 번을 떼고, 앞의 0 을 뗀 값이 1 이상의 정수 문자열이면 그 값, 아니면 빈 문자열.
-- 아직 새 함수가 배포되기 전일 수 있어 규칙을 아래에 직접 적는다.
--
-- 대상 DB: dev gjowqdiopinhixfivnkx, Winning prod ykrpjcsubmbenfcnwlzd, Schoolmentor prod aalujumpwlnwlemnqrus.
-- 실행: supabase db query --linked --project-ref <ref> -f supabase/data/20261123050500_class_names_digits_only.sql
--
-- 범위: 이름이 /^[1-9][0-9]*$/ 가 아니고 정규화한 이름이 비어 있지 않은 학급(모든 org_type).
--   정규화한 이름이 비어 있는 학급(예: "A")은 다른 파일(delete_class_without_digits)이 맡는다.
-- 같은 (기관, 학년도, 학년, 그룹)에 정규화한 이름과 같은 학급이 이미 있으면(충돌) 숫자 학급을 남기고
--   원래 학급의 참조(담임 배정, 학적, 가입 전 명단, 변경 신청)를 숫자 학급으로 옮긴 뒤 원래 학급을 지운다.
--   두 학급 모두 담임 배정이 있으면 멈춘다(사람이 정한다). 충돌이 없으면 이름만 바꾼다.
-- 허용하는 상태(충돌 없는 행 수 R, 충돌 행 수 K): (1, 0) dev 실행 전, (14, 8) Schoolmentor prod 실행 전, (0, 0) 실행 후와 Winning prod.
--   그 밖이면 숫자를 보이며 멈춘다. 학교(org_type 학교)에 숫자가 아닌 학급이 있어도 멈춘다(어느 DB에서나 0 이어야 한다).
-- 한 DO 블록(한 트랜잭션)이라 중간에 멈추면 아무것도 바뀌지 않는다. 다시 실행하면 범위가 비어 아무것도 바꾸지 않는다.
-- 학적 번호가 옮기는 학급의 기존 번호와 겹치면 student_enrollments 의 UNIQUE 위반으로 멈춘다.

do $$
declare
  v_school integer;
  v_scope integer;
  v_k integer;
  v_r integer;
  v_dup integer;
  v_left integer;
  v_renamed integer := 0;
  v_merged integer := 0;
  v_deleted integer := 0;
  rec record;
  v_refs integer;
begin
  lock table public.classes in share row exclusive mode;

  drop table if exists pg_temp.cls_digits_scope;
  create temp table cls_digits_scope as
  select c.id, c.tenant_id, c.school_year, c.grade, c.group_id, c.name, t.org_type,
         case when n.digits ~ '^[1-9][0-9]*$' then n.digits else '' end as norm
    from public.classes c
    join public.tenants t on t.id = c.tenant_id
    cross join lateral (
      select ltrim(
        regexp_replace(
          regexp_replace(c.name, '^\s+|\s+$', '', 'g'),
          '반$', ''),
        '0') as digits
    ) n
   where c.name !~ '^[1-9][0-9]*$';

  select count(*) into v_school from cls_digits_scope where org_type = '학교';
  if v_school > 0 then
    raise exception 'school classes with non-numeric names: %', v_school;
  end if;

  delete from cls_digits_scope where norm = '';
  select count(*) into v_scope from cls_digits_scope;

  -- 범위 안에서 같은 키로 정규화되는 두 행이 있으면 어느 쪽이 맞는지 알 수 없어 멈춘다.
  select count(*) into v_dup from (
    select 1 from cls_digits_scope
     group by tenant_id, school_year, grade, group_id, norm
    having count(*) > 1) d;
  if v_dup > 0 then
    raise exception 'scope rows normalize to the same key: % groups', v_dup;
  end if;

  alter table cls_digits_scope add column target_id uuid;
  update cls_digits_scope s
     set target_id = c2.id
    from public.classes c2
   where c2.tenant_id = s.tenant_id and c2.school_year = s.school_year
     and c2.grade is not distinct from s.grade
     and c2.group_id is not distinct from s.group_id
     and lower(c2.name) = s.norm
     and c2.id <> s.id;

  select count(*) into v_k from cls_digits_scope where target_id is not null;
  v_r := v_scope - v_k;
  if (v_r, v_k) not in ((1, 0), (14, 8), (0, 0)) then
    raise exception 'unexpected class state: renamable=%, colliding=%', v_r, v_k;
  end if;

  -- 충돌: 숫자 학급을 남기고 참조를 옮긴 뒤 원래 학급을 지운다.
  for rec in select id, target_id from cls_digits_scope where target_id is not null loop
    if exists (select 1 from public.teacher_class_assignments where class_id = rec.target_id)
       and exists (select 1 from public.teacher_class_assignments where class_id = rec.id) then
      raise exception 'both classes of a colliding pair have a homeroom assignment';
    end if;
    update public.teacher_class_assignments set class_id = rec.target_id where class_id = rec.id;
    update public.student_enrollments set class_id = rec.target_id where class_id = rec.id;
    update public.roster_pending_students set class_id = rec.target_id where class_id = rec.id;
    update public.enrollment_changes set from_class_id = rec.target_id where from_class_id = rec.id;
    update public.enrollment_changes set to_class_id = rec.target_id where to_class_id = rec.id;

    select (select count(*) from public.teacher_class_assignments where class_id = rec.id)
         + (select count(*) from public.student_enrollments where class_id = rec.id)
         + (select count(*) from public.roster_pending_students where class_id = rec.id)
         + (select count(*) from public.enrollment_changes where from_class_id = rec.id or to_class_id = rec.id)
      into v_refs;
    if v_refs > 0 then
      raise exception 'source class still has % references', v_refs;
    end if;

    delete from public.classes where id = rec.id;
    v_merged := v_merged + 1;
    v_deleted := v_deleted + 1;
  end loop;

  -- 충돌이 없는 행은 이름만 바꾼다.
  update public.classes c
     set name = s.norm
    from cls_digits_scope s
   where c.id = s.id and s.target_id is null;
  get diagnostics v_renamed = row_count;

  select count(*) into v_left
    from public.classes c
   where c.name !~ '^[1-9][0-9]*$'
     and ltrim(regexp_replace(regexp_replace(c.name, '^\s+|\s+$', '', 'g'), '반$', ''), '0') ~ '^[1-9][0-9]*$';
  if v_left > 0 then
    raise exception 'non-numeric classes with a digit name remain: %', v_left;
  end if;

  drop table cls_digits_scope;
  raise notice 'class names digits only: renamed=%, merged=%, deleted=%', v_renamed, v_merged, v_deleted;
end
$$;
