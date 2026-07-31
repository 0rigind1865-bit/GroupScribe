-- 全域設定：進群告知訊息的內容與開關（可在 /settings 網頁編輯）
-- 冪等，可重複執行。
create table if not exists app_settings (
  id int primary key,                              -- 固定單列 id=1
  join_notice_enabled boolean not null default true,
  join_notice_text text,                           -- null = 用程式內建預設
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict (id) do nothing;
alter table app_settings enable row level security;
