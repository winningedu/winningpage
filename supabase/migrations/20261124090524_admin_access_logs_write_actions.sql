-- 관리자 쓰기 라우트가 남기는 감사 행의 등록, 삭제 동작을 허용한다.
alter table public.admin_access_logs drop constraint if exists admin_access_logs_action_check;

alter table public.admin_access_logs add constraint admin_access_logs_action_check check (
  action = any (array[
    'download', 'unmask', 'view', 'report_view', 'update', 'export',
    'account_issue', 'account_reissue', 'account_status', 'account_delete',
    'password_set', 'teacher_import', 'proxy_start', 'proxy_end',
    'settings_change', 'member_purge', 'create', 'delete'
  ]::text[])
);
