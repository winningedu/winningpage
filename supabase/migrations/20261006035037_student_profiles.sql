-- 학생 공용 프로필 — 여섯 서비스가 함께 쓰는 학생 기본 정보(학생당 1행).
--
-- 배경: 성장설계를 시작으로 서비스마다 학년·학교유형·희망 진로를 따로 묻고 따로
-- 저장하면 같은 학생의 값이 서비스별로 갈라진다. 데이터만 중앙에 모으고, 각
-- 서비스는 이 값이 비어 있어도 단독으로 동작해야 한다(선택 입력 + 대체 경로).
-- 성장설계 전용 값(설문 응답, 트랙)은 여기에 넣지 않고 growth_profiles 에 둔다.
--
-- school_type 은 goal_students_school_type_check 의 고등 3종만 허용한다
-- (중학교·초등학교는 이 프로필의 대상이 아니다).
--
-- 읽기: 본인 / 승인 연결된 학부모(fn_is_linked_pair) / 관리자.
-- 쓰기: 본인만 insert·update. delete 정책은 없다 — 탈퇴는 fn_delete_account
-- (SECURITY DEFINER)가 지운다.

create table public.student_profiles (
  profile_id uuid primary key
    references public.profiles(id) on delete cascade,
  school_type text
    check (school_type in ('일반고', '특목고', '특목,자사,영재고')),
  admission_year integer
    check (admission_year between 2000 and 2100),
  grade text
    check (grade in ('고1', '고2', '고3', '졸업', 'N수')),
  semester smallint
    check (semester in (1, 2)),
  career text,
  department text,
  universities text[] not null default '{}'
    check (cardinality(universities) <= 2),
  updated_by uuid
    references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.student_profiles is
  '학생 공용 프로필(학생당 1행). 여섯 서비스가 공유하는 학년·학교유형·진로·희망 대학(최대 2개)만 둔다. 성장설계 전용 값(설문 응답·트랙)은 growth_profiles 에 둔다. 읽기=본인/연결 학부모/관리자, 쓰기=본인, delete 정책 없음(탈퇴는 fn_delete_account).';

alter table public.student_profiles enable row level security;

create policy "student_profiles select own linked admin"
  on public.student_profiles for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.fn_is_linked_pair(auth.uid(), profile_id)
    or public.is_winning_admin()
  );

create policy "student_profiles insert own"
  on public.student_profiles for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "student_profiles update own"
  on public.student_profiles for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update on public.student_profiles to authenticated;
grant all on public.student_profiles to service_role;
