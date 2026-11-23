-- 숫자로 바꿀 수 없는 반 이름("A" 처럼 정규화한 이름이 빈 문자열)의 학급을 지운다.
-- 규칙(fn_normalize_class_name 과 같다): 바깥 공백을 지우고, 끝의 "반" 한 번을 떼고, 앞의 0 을 뗀 값이 1 이상의 정수 문자열이 아니면 빈 문자열.
--
-- 대상 DB: dev gjowqdiopinhixfivnkx, Winning prod ykrpjcsubmbenfcnwlzd, Schoolmentor prod aalujumpwlnwlemnqrus.
-- 실행: supabase db query --linked --project-ref <ref> -f supabase/data/20261123050600_delete_class_without_digits.sql
--
-- 허용하는 상태: 대상 학급이 0개 또는 1개. 1개이면 학교가 아닌 기관의 학급이고 담임 배정, 학적, 가입 전 명단,
--   변경 신청 참조가 모두 0 이어야 한다. 참조가 있으면 어느 표에 몇 건인지(이름 없이) 보이며 멈춘다.
-- 한 DO 블록(한 트랜잭션)이다. 다시 실행하면 대상이 없어 아무것도 바꾸지 않는다.

do $$
declare
  v_count integer;
  v_id uuid;
  v_org_type text;
  v_tca integer;
  v_enr integer;
  v_pend integer;
  v_chg integer;
begin
  lock table public.classes in share row exclusive mode;

  select count(*) into v_count
    from public.classes c
   where c.name !~ '^[1-9][0-9]*$'
     and ltrim(regexp_replace(regexp_replace(c.name, '^\s+|\s+$', '', 'g'), '반$', ''), '0') !~ '^[1-9][0-9]*$';
  if v_count not in (0, 1) then
    raise exception 'unexpected number of classes without digits: %', v_count;
  end if;
  if v_count = 0 then
    raise notice 'delete class without digits: nothing to delete';
    return;
  end if;

  select c.id, t.org_type into v_id, v_org_type
    from public.classes c
    join public.tenants t on t.id = c.tenant_id
   where c.name !~ '^[1-9][0-9]*$'
     and ltrim(regexp_replace(regexp_replace(c.name, '^\s+|\s+$', '', 'g'), '반$', ''), '0') !~ '^[1-9][0-9]*$';
  if v_org_type = '학교' then
    raise exception 'the class without digits belongs to a school';
  end if;

  select (select count(*) from public.teacher_class_assignments where class_id = v_id),
         (select count(*) from public.student_enrollments where class_id = v_id),
         (select count(*) from public.roster_pending_students where class_id = v_id),
         (select count(*) from public.enrollment_changes where from_class_id = v_id or to_class_id = v_id)
    into v_tca, v_enr, v_pend, v_chg;
  if v_tca + v_enr + v_pend + v_chg > 0 then
    raise exception 'the class without digits is still referenced: teacher_class_assignments=%, student_enrollments=%, roster_pending_students=%, enrollment_changes=%',
      v_tca, v_enr, v_pend, v_chg;
  end if;

  delete from public.classes where id = v_id;
  raise notice 'delete class without digits: deleted=1';
end
$$;
