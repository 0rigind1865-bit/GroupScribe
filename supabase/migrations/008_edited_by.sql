-- LIFF v2 成員可操作（計劃 B.3）：記錄最後修改者的 LINE userId。
-- 管理者從 Dashboard 改的維持 null（admin 身分不是 LINE 帳號）。
-- 使用方式：貼到 Supabase SQL Editor 執行。冪等，可重複跑。
alter table events add column if not exists edited_by text;
alter table tasks  add column if not exists edited_by text;
alter table notes  add column if not exists edited_by text;
