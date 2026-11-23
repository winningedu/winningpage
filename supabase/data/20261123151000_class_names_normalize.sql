-- 반 이름을 정규화한 값으로 맞춘다(결정: 학교와 학원 모두 글자와 숫자를 받는다).
-- 규칙(fn_normalize_class_name 과 같다): 바깥 공백만 지우고(안쪽 공백은 둔다), 끝의 "반" 한 번을 떼고, 남은 것이 숫자뿐이면 앞의 0 을 뗀다. 글자가 든 이름의 0 은 그대로 둔다("A01").
-- 아직 새 함수가 배포되기 전일 수 있어 규칙을 아래에 직접 적는다.
--
-- 대상 DB: dev gjowqdiopinhixfivnkx, Winning prod ykrpjcsubmbenfcnwlzd, Schoolmentor prod aalujumpwlnwlemnqrus.
-- 실행: supabase db query --linked --project-ref <ref> -f supabase/data/20261123151000_class_names_normalize.sql
--
-- 범위: 모든 학급. 이름이 정규화한 값과 다른 학급 C, 같은 (기관, 학년도, 학년, 그룹, 소문자 정규화 이름)에 둘 이상인 묶음 M.
-- 허용하는 상태 (C, M): (1, 0) dev 실행 전, (22, 8) Schoolmentor prod 실행 전, (0, 0) 실행 후와 Winning prod. 그 밖이면 숫자를 보이며 멈춘다.
-- 정규화하면 빈 문자열이 되는 학급이 있어도 멈춘다.
-- 묶음 안에서 남길 학급은 이름이 이미 정규화한 값인 학급, 없으면 가장 오래된 학급(created_at, id)이다.
--   묶음 안에 담임 배정이 있는 학급이 둘 이상이면 멈춘다(사람이 정한다).
--   나머지 학급의 참조(담임 배정, 학적, 가입 전 명단, 변경 신청)를 남길 학급으로 옮기고, 참조가 0 인지 확인한 뒤 지운다.
-- 그 뒤 이름이 정규화한 값과 다른 학급을 모두 정규화한 값으로 바꾼다.
-- 학적 번호가 옮기는 학급의 기존 번호와 겹치면 student_enrollments 의 UNIQUE 위반으로 멈춘다.
-- 한 DO 블록(한 트랜잭션)이라 중간에 멈추면 아무것도 바뀌지 않는다. 다시 실행하면 (0, 0) 이라 아무것도 바꾸지 않는다.

do $$
declare
  v_c integer;
  v_m integer;
  v_empty integer;
  v_teachers integer;
  v_left integer;
  v_dup integer;
  v_refs integer;
  v_renamed integer := 0;
  v_deleted integer := 0;
  rec record;
begin
  lock table public.classes in share row exclusive mode;

  drop table if exists pg_temp.cls_scope;
  create temp table cls_scope as
  select c.id, c.tenant_id, c.school_year, c.grade, c.group_id, c.name, n.norm,
         first_value(c.id) over w as keeper_id,
         count(*) over (partition by c.tenant_id, c.school_year, c.grade, c.group_id, lower(n.norm)) as group_size
    from public.classes c
    cross join lateral (
      select case when r.rest ~ '^[0-9]+$' then ltrim(r.rest, '0') else r.rest end as norm
        from (select regexp_replace(regexp_replace(regexp_replace(c.name, '^\s+|\s+$', '', 'g'), '반$', ''), '^\s+|\s+$', '', 'g') as rest) r
    ) n
  window w as (
    partition by c.tenant_id, c.school_year, c.grade, c.group_id, lower(n.norm)
    order by (c.name = n.norm) desc, c.created_at, c.id
  );

  select count(*) into v_empty from cls_scope where norm = '';
  if v_empty > 0 then
    raise exception 'classes that normalize to an empty name: %', v_empty;
  end if;

  select count(*) into v_c from cls_scope where name <> norm;
  select count(distinct keeper_id) into v_m from cls_scope where group_size > 1;
  if (v_c, v_m) not in ((1, 0), (22, 8), (0, 0)) then
    raise exception 'unexpected class state: renamable=%, merge groups=%', v_c, v_m;
  end if;

  select count(*) into v_teachers from (
    select s.keeper_id
      from cls_scope s
     where s.group_size > 1
       and exists (select 1 from public.teacher_class_assignments a where a.class_id = s.id)
     group by s.keeper_id
    having count(*) > 1) t;
  if v_teachers > 0 then
    raise exception 'merge groups with more than one homeroom assignment: %', v_teachers;
  end if;

  for rec in select id, keeper_id from cls_scope where group_size > 1 and id <> keeper_id loop
    update public.teacher_class_assignments set class_id = rec.keeper_id where class_id = rec.id;
    update public.student_enrollments set class_id = rec.keeper_id where class_id = rec.id;
    update public.roster_pending_students set class_id = rec.keeper_id where class_id = rec.id;
    update public.enrollment_changes set from_class_id = rec.keeper_id where from_class_id = rec.id;
    update public.enrollment_changes set to_class_id = rec.keeper_id where to_class_id = rec.id;

    select (select count(*) from public.teacher_class_assignments where class_id = rec.id)
         + (select count(*) from public.student_enrollments where class_id = rec.id)
         + (select count(*) from public.roster_pending_students where class_id = rec.id)
         + (select count(*) from public.enrollment_changes where from_class_id = rec.id or to_class_id = rec.id)
      into v_refs;
    if v_refs > 0 then
      raise exception 'source class still has % references', v_refs;
    end if;

    delete from public.classes where id = rec.id;
    v_deleted := v_deleted + 1;
  end loop;

  update public.classes c
     set name = s.norm
    from cls_scope s
   where c.id = s.id and c.name <> s.norm;
  get diagnostics v_renamed = row_count;

  select count(*) into v_left
    from public.classes c
    cross join lateral (
      select case when r.rest ~ '^[0-9]+$' then ltrim(r.rest, '0') else r.rest end as norm
        from (select regexp_replace(regexp_replace(regexp_replace(c.name, '^\s+|\s+$', '', 'g'), '반$', ''), '^\s+|\s+$', '', 'g') as rest) r
    ) n
   where c.name <> n.norm;
  if v_left > 0 then
    raise exception 'classes with a non-normalized name remain: %', v_left;
  end if;

  select count(*) into v_dup from (
    select 1 from public.classes
     group by tenant_id, school_year, grade, group_id, lower(name)
    having count(*) > 1) d;
  if v_dup > 0 then
    raise exception 'duplicate class groups remain: %', v_dup;
  end if;

  drop table cls_scope;
  raise notice 'class names normalize: renamed=%, merged=%, deleted=%', v_renamed, v_m, v_deleted;
end
$$;

-- 실행 기록
-- 2026-11-23 dev gjowqdiopinhixfivnkx: 실행 전 (C, M) = (1, 0), 이름 바꾸기 1, 합치기 0, 지우기 0. 다시 실행해도 변경 없음. 학급 1 그대로.
-- 2026-11-23 Winning prod ykrpjcsubmbenfcnwlzd: 실행 전 (0, 0), 변경 없음. 다시 실행해도 변경 없음. 학급 0.
-- 2026-11-23 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 (22, 8), 합치기 8(담임 8건을 숫자 반으로 옮기고 N반 8개 삭제), 이름 바꾸기 14. 학급 50 에서 42. 다시 실행해도 변경 없음. 글자 반 1 그대로.
