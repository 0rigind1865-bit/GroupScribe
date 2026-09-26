-- 027：報帳 v3（Snaptab 全功能移植）
-- 應用端：這些欄位／表不存在時照舊運作（時間退回用日期、案場退回用記過的名稱、圖示用預設），先部署後貼也不壞。

-- 花費的精確時間（Snaptab 記到分鐘，用來分辨午餐／晚餐）；舊資料為 null，顯示時只用 spent_on
alter table expenses add column if not exists spent_at timestamptz;

-- 案場／專案清單（Snaptab 的 events）：新增、改名（改名會連同 expenses.project 一起改）
create table if not exists expense_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
alter table expense_projects enable row level security;

-- 分類圖示：{ "餐飲": "meal", ... }，沒設的用預設對照
alter table org_settings add column if not exists expense_category_icons jsonb not null default '{}'::jsonb;
