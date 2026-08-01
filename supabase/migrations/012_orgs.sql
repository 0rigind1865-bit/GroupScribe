-- 多租戶地基（migration 012）：orgs / org_members / org_settings
--
-- 為什麼現在做：plan.md B.1 記錄的重議觸發條件「服務第二家公司 → 多租戶」已觸發
-- （考勤模組要服務多家公司）。org_id 只掛 groups 與 channels 兩個「實體」表；
-- messages/events/tasks/notes 等表以 group_id 為界、經 group 間接歸屬——
-- 不動任何熱路徑查詢，隔離執行點放在「選 group」那一層（src/org/orgs.ts）。
--
-- 冪等，可重複執行。純新增：先跑 migration、舊程式碼照常運作
-- （org_id 有 default_org_id() 預設值，切換期間的寫入自動歸預設 org）。

-- 組織：租戶邊界
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'), -- URL 用（/o/[slug]/...）
  name text not null,
  created_at timestamptz not null default now()
);

-- 既有生產資料歸入預設 org
insert into orgs (slug, name) values ('main', '預設組織') on conflict (slug) do nothing;

-- 欄位預設值函式：舊程式碼在切換期間寫入的列自動歸預設 org
create or replace function default_org_id() returns uuid stable
language sql set search_path = public as $$
  select id from orgs where slug = 'main'
$$;

alter table groups   add column if not exists org_id uuid references orgs(id) default default_org_id();
alter table channels add column if not exists org_id uuid references orgs(id) default default_org_id();
update groups   set org_id = default_org_id() where org_id is null;
update channels set org_id = default_org_id() where org_id is null;
alter table groups alter column org_id set not null;
create index if not exists groups_org on groups (org_id);

-- org 管理員：LINE 帳號為身分（比照 ADMIN_LINE_USER_ID 先例——LINE 帳號即後台鑰匙）。
-- 管理身分不進 cookie，每次請求查表決定（requireOrgAdmin），撤權立即生效。
create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  line_user_id text not null,
  role text not null default 'admin' check (role in ('owner','admin')),
  display_name text,
  created_at timestamptz not null default now(),
  primary key (org_id, line_user_id)
);

-- app_settings 單列 → per-org 設定（相同欄位；app_settings 保留到 cutover 完成後再清理）
create table if not exists org_settings (
  org_id uuid primary key references orgs(id) on delete cascade,
  join_notice_enabled boolean not null default true,
  join_notice_text text,
  monthly_budget_usd numeric,
  gen_model text,
  embedding_model text,
  ai_daily_free_calls int,
  last_webhook_at timestamptz,
  attend_join_code text,            -- 員工加入碼（考勤模組：/a/join）
  updated_at timestamptz not null default now()
);
insert into org_settings (org_id, join_notice_enabled, join_notice_text, monthly_budget_usd,
                          gen_model, embedding_model, ai_daily_free_calls, last_webhook_at)
select default_org_id(), join_notice_enabled, join_notice_text, monthly_budget_usd,
       gen_model, embedding_model, ai_daily_free_calls, last_webhook_at
from app_settings where id = 1
on conflict (org_id) do nothing;

-- groups_view 加上 org_id（Dashboard 群組清單依 org 過濾的依據）。
-- coalesce：只有 messages 沒有 groups 列的孤兒群組歸預設 org，不會從清單消失。
drop view if exists groups_view;
create view groups_view as
  select m.group_id, g.name, g.picture_url, g.category, g.left_at,
         coalesce(g.org_id, default_org_id()) as org_id,
         count(*)::int as message_count, max(m.created_at) as last_at
  from messages m
  left join groups g on g.group_id = m.group_id
  group by m.group_id, g.name, g.picture_url, g.category, g.left_at, g.org_id;
alter view groups_view set (security_invoker = on);

-- 比照既有慣例：開 RLS 不建 policy，anon key 完全碰不到（全走伺服端 service role）
alter table orgs enable row level security;
alter table org_members enable row level security;
alter table org_settings enable row level security;
