-- 034：成員端「AI 猜這是你的，對嗎？」的回答（2026-10 設計畫布「成員端」）
-- tasks.assignee 是自由文字暱稱，成員頁拿 LINE 顯示名稱寬鬆比對來猜「這筆是你的」；
-- 成員按「是我／不是我」後記在這裡，只影響他自己的「我的待辦」，不改待辦本身（負責人欄位是全群共用的）。
-- 應用端：表不存在時不顯示這兩顆鈕、照舊用名字猜（先部署後貼也不壞）。
-- 使用方式：貼到 Supabase SQL Editor 執行。冪等，可重複跑。
create table if not exists task_claims (
  task_id uuid not null references tasks(id) on delete cascade,
  line_user_id text not null,
  mine boolean not null,
  created_at timestamptz not null default now(),
  primary key (task_id, line_user_id)
);
-- 成員頁一次撈「自己按過的全部」：以 LINE 帳號查
create index if not exists task_claims_user on task_claims (line_user_id);
alter table task_claims enable row level security;
