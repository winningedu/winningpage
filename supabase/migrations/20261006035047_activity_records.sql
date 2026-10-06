-- 활동 기록 저장소 — 수행평가·심화탐구·자기평가서·직접 입력·업로드에서 나온 활동을
-- 한 표로 모아 성장설계가 재료로 읽는다.
--
-- status 의미:
--   planned   계획만 있는 활동. 재료 조회에서 제외한다.
--   draft     직접 입력(manual)한 작성 중 기록.
--   confirmed 수행평가 최종본, 심화탐구 확정본.
--   final     자기평가서 최종본.
-- source_program = 'upload' 는 growth_uploads.id 를 source_ref_id 로 쓴다.
-- 같은 원본이 두 번 승격되지 않도록 (source_program, source_ref_id) 를 부분 유니크로 건다.
--
-- 읽기: 본인 / 승인 연결된 학부모(fn_is_linked_pair) / 관리자.
-- 쓰기: 본인은 source_program = 'manual' 행만 insert·update·delete 한다.
--       나머지 source 는 각 서비스 API(service_role)만 쓴다.

create table public.activity_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  source_program text not null
    check (source_program in ('performance', 'deep', 'self', 'manual', 'upload')),
  source_ref_id uuid,
  status text not null
    check (status in ('planned', 'draft', 'confirmed', 'final')),
  grade_label text
    check (grade_label in ('고1', '고2', '고3')),
  semester smallint
    check (semester in (1, 2)),
  subject_group text,
  subject text,
  topic text,
  concept text,
  method text,
  result text,
  limitation text,
  numbers jsonb,
  sources jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_records_manual_shape_check
    check (source_program <> 'manual'
           or (status in ('planned', 'draft') and source_ref_id is null)),
  constraint activity_records_upload_ref_check
    check (source_program <> 'upload' or source_ref_id is not null)
);

comment on table public.activity_records is
  '활동 기록 저장소. status: planned(재료 조회 제외) / draft(직접 입력 작성 중) / confirmed(수행평가 최종본·심화탐구 확정본) / final(자기평가서 최종본). source_program=upload 는 growth_uploads.id 를 source_ref_id 로 쓴다. (source_program, source_ref_id) 부분 유니크로 중복 승격을 막는다. 본인은 manual 행만 쓰고 나머지 source 는 service_role 만 쓴다. 직접 입력(manual)은 planned/draft 까지만 허용하고 확정 승격(confirmed/final)은 service_role 이 한다.';

comment on column public.activity_records.subject_group is
  '교과/창체 등 활동 구분.';

create unique index activity_records_source_uniq
  on public.activity_records (source_program, source_ref_id)
  where source_ref_id is not null;

create index activity_records_profile_grade_semester_idx
  on public.activity_records (profile_id, grade_label, semester);

alter table public.activity_records enable row level security;

create policy "activity_records select own linked admin"
  on public.activity_records for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.fn_is_linked_pair(auth.uid(), profile_id)
    or public.is_winning_admin()
  );

create policy "activity_records insert own manual"
  on public.activity_records for insert
  to authenticated
  with check (profile_id = auth.uid() and source_program = 'manual');

create policy "activity_records update own manual"
  on public.activity_records for update
  to authenticated
  using (profile_id = auth.uid() and source_program = 'manual')
  with check (profile_id = auth.uid() and source_program = 'manual');

create policy "activity_records delete own manual"
  on public.activity_records for delete
  to authenticated
  using (profile_id = auth.uid() and source_program = 'manual');

create trigger trg_activity_records_updated_at
  before update on public.activity_records
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.activity_records to authenticated;
grant all on public.activity_records to service_role;
