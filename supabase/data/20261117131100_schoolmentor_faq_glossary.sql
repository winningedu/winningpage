-- 목적: 스쿨멘토 자주하는 질문(public.faqs)의 노출 중인 행에서 옛 용어를 2026-11-17 표준 용어(PR #416)로 바꾼다.
--   FAQ 문구는 클라이언트 원문이고, 클라이언트가 관리자 화면에서 계속 고칠 수 있다. 이 파일은 용어만 바꾸고 문장은 그대로 둔다.
--   한 답변은 더 이상 없는 메뉴 이름 "[교사 계정 관리]"를 가리키고 있다(지금 이름은 "선생님 계정 관리").
--   소유자가 노출 중인 행의 용어 교체를 승인했다.
--
-- 바꾸는 말 (아래 순서 그대로 question 과 answer 두 열에 적용한다. 앞 쌍이 뒤 쌍의 앞부분이라 순서가 중요하다):
--   1. "담임선생님 화면" 를 "선생님 화면" 로
--   2. "담임선생님" 를 "담임 선생님" 로
--   3. "학교 전체 관리자" 를 "전체 관리자" 로
--   4. "학교 관리자" 를 "전체 관리자" 로
--   5. "교사용 통합관리 화면" 를 "선생님 화면" 로
--   6. "교사 계정 관리" 를 "선생님 계정 관리" 로
--   7. "학급" 를 "반" 로
--   8. "반 미정" 를 "미배정" 로
--   9. "사용 횟수" 를 "이용 횟수" 로
--
-- 건드리지 않는 것:
--   is_active = false 인 행(내려 둔 이전 행)은 건드리지 않는다.
--   content_json 은 건드리지 않는다. 바뀌는 행에는 content_json 이 없다(읽기 전용 미리보기로 확인).
--   "학교 및 교육기관" 문장 세 개(FAQ sort_order 1, 27, 56)는 서비스 소개 문구라 쓰인 그대로 둔다.
--   이 파일의 바꾸는 말에는 그 문구가 걸리지 않는다.
--
-- 읽기 전용 미리보기 값(2026-11-17, Schoolmentor prod): 노출 73행 중 14행이 바뀐다
--   (sort_order 10, 13, 17, 18, 31, 38, 50, 57, 58, 61, 62, 63, 64, 66). 질문 2개, 답변 14개가 바뀌고 교체 뒤 옛 용어는 0개다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. 소유자가 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 이 내용은 스쿨멘토 전용이다. 그래서 README의 "dev 먼저" 단계를 건너뛰고 Schoolmentor prod 에 바로 실행한다
-- (20261114110948_schoolmentor_faq_v2.sql 과 같은 방식). 위닝 DB에서는 이 파일이 아래 0번 가드에서 멈춘다.
--
-- 실행 전 조회 (결과를 실행 기록에 남긴다):
--   select count(*) filter (where is_active) as active,
--          count(*) filter (where is_active
--            and (question || ' ' || coalesce(answer, '')) ~ '담임선생님|학교 전체 관리자|학교 관리자|교사용 통합관리 화면|교사 계정 관리|학급|반 미정|사용 횟수') as with_old_terms
--     from public.faqs;
--   select sort_order from public.faqs
--    where is_active
--      and (question || ' ' || coalesce(answer, '')) ~ '담임선생님|학교 전체 관리자|학교 관리자|교사용 통합관리 화면|교사 계정 관리|학급|반 미정|사용 횟수'
--    order by sort_order;
--     -- 기대: 노출 73, 옛 용어 14행, sort_order 10, 13, 17, 18, 31, 38, 50, 57, 58, 61, 62, 63, 64, 66.
-- 실행 후 확인: 위 두 조회를 다시 실행한다.
--     -- 기대: 노출 73 (그대로), 옛 용어 0행, 두 번째 조회는 0행.
--
-- 멱등: 바뀐 결과가 지금 값과 다를 때만 갱신한다(is distinct from). 다시 실행하면 아무것도 바뀌지 않는다.
--   자연 키가 아니라 같은 행의 값만 보고 갱신하므로 하드코딩한 uuid 는 없다. 삭제 없음.
--   함수는 만들지 않는다. 한 문장이라 한 트랜잭션에서 중간 실패 시 아무것도 바뀌지 않는다.
--   주의: 클라이언트가 관리자에서 옛 용어를 새로 적으면 다시 실행할 때 그 말도 바뀐다.

begin;

-- 0. 대상 DB 가드. Schoolmentor prod 만 통과한다 (20261114110948 과 같은 가드).
do $$
begin
  if not exists (
    select 1 from public.page_contents
     where slug = 'company-intro' and menu_label = '공지-회사소개'
  ) then
    raise exception 'Schoolmentor prod 전용 파일입니다. 대상 DB가 맞는지 확인하세요 (company-intro menu_label 이 공지-회사소개 가 아님).';
  end if;
end $$;

-- 1. 노출 중인 행의 질문과 답변에서 용어를 바꾼다. 바뀐 식은 한 번만 쓴다 (질문, 답변 순서의 배열에 적용).
with replaced as (
  select f.id, n.r[1] as question, n.r[2] as answer
    from public.faqs f
   cross join lateral (
     select array_agg(
              replace(
              replace(
              replace(
              replace(
              replace(
              replace(
              replace(
              replace(
              replace(u.t,
                '담임선생님 화면', '선생님 화면'),
                '담임선생님', '담임 선생님'),
                '학교 전체 관리자', '전체 관리자'),
                '학교 관리자', '전체 관리자'),
                '교사용 통합관리 화면', '선생님 화면'),
                '교사 계정 관리', '선생님 계정 관리'),
                '학급', '반'),
                '반 미정', '미배정'),
                '사용 횟수', '이용 횟수')
              order by u.o) as r
       from unnest(array[f.question, f.answer]) with ordinality as u(t, o)
   ) n
   where f.is_active
)
update public.faqs f
   set question = r.question,
       answer = r.answer
  from replaced r
 where f.id = r.id
   and f.is_active
   and (f.question, f.answer) is distinct from (r.question, r.answer);

commit;

-- 실행 기록 (소유자가 실행한 뒤 채운다)
-- 2026-11-17 Schoolmentor prod (aalujumpwlnwlemnqrus) 실행.
--   실행 전: 노출 73행, 옛 용어가 든 노출 행 14개 (sort_order 10, 13, 17, 18, 31, 38, 50, 57, 58, 61, 62, 63, 64, 66).
--   실행 후: 노출 73행 그대로, 옛 용어가 든 노출 행 0개. 질문 2개와 답변 14개가 바뀌었다.
--   바뀌지 않은 것: 숨긴 37행과 나머지 노출 59행의 질문, 답변 (실행 전후 md5 가 같다).
--   예: 58번 답변의 [교사 계정 관리] 가 [선생님 계정 관리] 로, 18번 답변의 '반 미정' 이 '미배정' 으로 바뀌었다.
