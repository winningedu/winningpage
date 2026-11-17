-- 목적: 스쿨멘토 자주하는 질문(public.faqs)의 노출 중인 학생 문장 7개에서 "아이디"를 "이메일"로 바꾼다.
--   2026-11-17 결정: 선생님만 아이디로 로그인하고, 학생은 가입 때 인증한 이메일로 로그인한다(스쿨멘토 학생 아이디 폐지).
--   노출 FAQ 중 "아이디"가 든 행은 12개다. 학생 문장 7개(sort_order 11, 14, 15, 19, 20, 21, 69)만 바꾼다.
--   선생님 문장 5개(sort_order 56, 57, 58, 59, 60)는 선생님이 지금도 아이디로 로그인하므로 그대로 둔다.
--   소유자가 문안을 승인했다.
--
-- 화면 이름은 그대로 인용한다: 로그인 화면은 선생님과 함께 쓰므로 버튼 이름이 '아이디 저장', '아이디 찾기',
--   '비밀번호를 잊으셨나요?' 다(src/pages/Login.tsx). FAQ는 이 이름을 따옴표로 적는다.
--   21번의 "일정 시간"은 클라이언트 원문대로 둔다(실제 잠금은 10분, 잠금 시간을 바꿀 때 FAQ를 고치지 않아도 되게).
--
-- 바꾸는 말 (행마다 문장 조각을 바꾼다. 조각이 없으면 그 행은 바뀌지 않는다):
--   11 답변 "이름, 아이디, 비밀번호, 휴대폰번호(인증), 이메일, 학년" 를 "이름, 비밀번호, 휴대폰번호(인증), 이메일(인증), 학년" 로
--   14 답변 "아이디 찾기를 이용해 주세요." 를 "'아이디 찾기'에서 가입한 이메일을 확인해 주세요." 로
--   15 답변 "아이디는 전체에서 하나만 쓸 수 있으므로 두 번째 계정은 다른 아이디로 가입해 주세요." 를
--          "이메일은 계정마다 달라야 하므로 두 번째 계정은 다른 이메일로 가입해 주세요." 로
--   19 답변 "아이디, 비밀번호를 입력해요." 를 "이메일과 비밀번호를 입력해요." 로,
--          "'아이디 저장'을 체크할 수 있고," 를 "'아이디 저장'을 체크하면 입력한 이메일을 기억해요." 로
--   20 질문 "아이디나 비밀번호를 잊어버렸어요." 를 "이메일이나 비밀번호를 잊어버렸어요." 로, 답변은 통째로 새 문장으로
--   21 답변 "아이디나 비밀번호를 연속 5회" 를 "이메일(선생님은 아이디)이나 비밀번호를 연속 5회" 로,
--          "아이디와 비밀번호 중" 을 "이메일과 비밀번호 중" 으로
--   69 답변 "학생은 이름, 아이디, 비밀번호" 를 "학생은 이름, 비밀번호" 로
--
-- 건드리지 않는 것: is_active = false 인 행, 다른 노출 행, content_json.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 스쿨멘토 전용이라 README의 "dev 먼저" 단계를 건너뛴다(20261117131100_schoolmentor_faq_glossary.sql 과 같은 방식).
-- 위닝 DB에서는 아래 0번 가드에서 멈춘다.
--
-- 실행 전 조회 (읽기 전용):
--   select count(*) filter (where is_active) as active,
--          count(*) filter (where is_active and (question || coalesce(answer, '')) like '%아이디%') as with_id,
--          md5(string_agg(id::text || question || coalesce(answer, '') || is_active::text, '|' order by id)
--              filter (where not (is_active and sort_order in (11, 14, 15, 19, 20, 21, 69)))) as rest_md5
--     from public.faqs;
--     -- 읽은 값(2026-11-17): 노출 73, 아이디가 든 노출 행 12, rest_md5 2d509d6d91ef19d2d090090519fbf091.
-- 실행 후 확인: 같은 조회를 다시 실행한다. 노출 73, rest_md5 그대로.
--   with_id 는 9가 된다: 선생님 5행과, 화면 이름이나 선생님 안내로 "아이디"가 남는 14, 19, 20, 21.
--
-- 멱등: 바꿀 조각이 남아 있는 행만 갱신한다. 다시 실행하면 0행이 바뀌고 그대로 끝난다.
--   일부 행만 바뀌면(클라이언트가 관리자에서 문장을 고친 경우) 예외를 던지고 전부 되돌린다.
--   하드코딩한 uuid 는 없다. 삭제 없음.

begin;

-- 0. 대상 DB 가드. Schoolmentor prod 만 통과한다 (20261117131100 과 같은 가드).
do $$
begin
  if not exists (
    select 1 from public.page_contents
     where slug = 'company-intro' and menu_label = '공지-회사소개'
  ) then
    raise exception 'Schoolmentor prod 전용 파일입니다. 대상 DB가 맞는지 확인하세요 (company-intro menu_label 이 공지-회사소개 가 아님).';
  end if;
end $$;

-- 1. 학생 문장 7행을 바꾼다. 바뀐 행 수가 0(이미 실행함) 또는 7이 아니면 되돌린다.
do $$
declare
  changed int;
begin
  with edits(so, q_old, q_new, a_old1, a_new1, a_old2, a_new2) as (
    values
      (11, null, null,
        $t$이름, 아이디, 비밀번호, 휴대폰번호(인증), 이메일, 학년$t$,
        $t$이름, 비밀번호, 휴대폰번호(인증), 이메일(인증), 학년$t$,
        null, null),
      (14, null, null,
        $t$아이디 찾기를 이용해 주세요.$t$,
        $t$'아이디 찾기'에서 가입한 이메일을 확인해 주세요.$t$,
        null, null),
      (15, null, null,
        $t$아이디는 전체에서 하나만 쓸 수 있으므로 두 번째 계정은 다른 아이디로 가입해 주세요.$t$,
        $t$이메일은 계정마다 달라야 하므로 두 번째 계정은 다른 이메일로 가입해 주세요.$t$,
        null, null),
      (19, null, null,
        $t$아이디, 비밀번호를 입력해요.$t$,
        $t$이메일과 비밀번호를 입력해요.$t$,
        $t$'아이디 저장'을 체크할 수 있고,$t$,
        $t$'아이디 저장'을 체크하면 입력한 이메일을 기억해요.$t$),
      (20,
        $t$아이디나 비밀번호를 잊어버렸어요.$t$,
        $t$이메일이나 비밀번호를 잊어버렸어요.$t$,
        $t$로그인 화면의 아이디・비밀번호 찾기에서 가입한 휴대폰번호로 인증하면 아이디를 확인하고 비밀번호를 새로 설정할 수 있어요.$t$,
        $t$로그인 화면의 '아이디 찾기'에서 가입한 휴대폰번호로 인증하면 가입한 이메일을 일부 가려서 보여 드려요. 비밀번호는 '비밀번호를 잊으셨나요?'에서 새로 설정할 수 있어요.$t$,
        null, null),
      (21, null, null,
        $t$아이디나 비밀번호를 연속 5회$t$,
        $t$이메일(선생님은 아이디)이나 비밀번호를 연속 5회$t$,
        $t$아이디와 비밀번호 중$t$,
        $t$이메일과 비밀번호 중$t$),
      (69, null, null,
        $t$학생은 이름, 아이디, 비밀번호$t$,
        $t$학생은 이름, 비밀번호$t$,
        null, null)
  )
  update public.faqs f
     set question = coalesce(replace(f.question, e.q_old, e.q_new), f.question),
         answer = coalesce(
                    replace(replace(f.answer, e.a_old1, e.a_new1), e.a_old2, e.a_new2),
                    replace(f.answer, e.a_old1, e.a_new1))
    from edits e
   where f.is_active
     and f.sort_order = e.so
     and position(e.a_old1 in f.answer) > 0
     and (e.a_old2 is null or position(e.a_old2 in f.answer) > 0)
     and (e.q_old is null or f.question = e.q_old);

  get diagnostics changed = row_count;
  if changed not in (0, 7) then
    raise exception '바뀐 행이 %개입니다(기대 7). 관리자에서 문장이 바뀌었는지 확인하세요. 아무것도 바꾸지 않았습니다.', changed;
  end if;
  raise notice 'faq email wording rows changed: %', changed;
end $$;

commit;

-- 실행 기록
-- 2026-11-17 Schoolmentor prod (aalujumpwlnwlemnqrus) 실행.
--   실행 전: 노출 73행, 아이디가 든 노출 행 12개, rest_md5 2d509d6d91ef19d2d090090519fbf091.
--   읽기 전용 미리보기로 같은 식의 결과 7행이 승인 문안과 같은지 확인한 뒤 실행했다.
--   실행 후: 노출 73행 그대로, 아이디가 든 노출 행 9개 (sort_order 14, 19, 20, 21, 56, 57, 58, 59, 60),
--     rest_md5 그대로 (바꾸지 않은 103행의 질문, 답변, 노출 여부가 같다).
--   다시 실행할 때 바뀔 행: 0 (미리보기 재조회 0행).
