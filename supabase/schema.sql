-- GroupScribe 資料庫 schema（Supabase：Postgres + pgvector）
-- 使用方式：貼到 Supabase SQL Editor 執行（或 psql -f schema.sql）
-- facts / insights / projects 為 Phase 1 資料表，屆時再加（規劃書第 9 節）

create extension if not exists vector;

-- 通訊帳號（多 channel 地基：換 LINE 帳號、加 Telegram 都只是多一列，規劃書 6.3）
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  platform text not null,                 -- line / telegram / ...
  credentials_ref text,                   -- 金鑰來源標記（如 env）；金鑰本身絕不進 DB
  provider_scope text,                    -- LINE Provider 範圍標記（userId 以 Provider 為界）
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id),
  group_id text not null,
  sender_id text,
  sender_name text,
  type text not null,                     -- text / image / pdf / other
  text text,
  message_id text,                        -- 平台訊息 ID（webhook 重送去重、unsend 對應用）
  thread_id text,                         -- 跨平台預留（Slack/Discord thread）
  edited_at timestamptz,                  -- 跨平台預留（Telegram 編輯）
  is_low_info boolean not null default false,
  source text not null default 'webhook', -- webhook / import / backfill
  created_at timestamptz not null default now()
);
create unique index if not exists messages_platform_msg
  on messages (channel_id, message_id) where message_id is not null;
create index if not exists messages_group_time on messages (group_id, created_at desc);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  kind text not null,                     -- image / pdf
  storage_path text not null,
  ocr_text text,
  vision_summary text,
  category text,
  status text not null default 'pending', -- pending / done
  processed_at timestamptz
);
create index if not exists media_status on media_assets (status);

create table if not exists embeddings (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  source_type text not null,              -- message / media
  source_id uuid not null,
  chunk_text text not null,
  embedding vector(768),
  model_id text not null,                 -- 換 embedding 模型必備：檢索只比對同模型（規劃書 6.2）
  created_at timestamptz not null default now()  -- 存「訊息時間」；時間加權檢索靠它
);
create index if not exists embeddings_vec on embeddings using hnsw (embedding vector_cosine_ops);
create index if not exists embeddings_source on embeddings (source_id);

create table if not exists consent_log (
  id bigint generated always as identity primary key,
  group_id text not null,
  channel_id uuid references channels(id),
  notified_at timestamptz not null default now(),
  notice_version text not null
);

-- ── Phase 2：群組身分（名稱/頭貼/分類/生命週期）與筆記（公告/決議）──
create table if not exists groups (
  group_id text primary key,
  name text,                -- LINE summary API 取得；null = 尚未取得或取不到（已嘗試的以列存在＋updated_at 區分）
  picture_url text,
  category text,            -- 自由文字分類；null = 未分類
  left_at timestamptz,      -- bot 被移出群組的時間（leave 事件）；名稱回補跳過
  updated_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  kind text not null,                     -- announcement（公告）/ decision（決議）
  title text not null,
  body text,
  pinned boolean not null default false,
  status text not null default 'active',  -- active / ignored
  needs_confirmation boolean not null default true,
  source text not null default 'ai',      -- ai / manual
  source_message_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_group_status on notes (group_id, status);

-- Dashboard 群組清單（欄位有變動，須 drop 重建；create or replace 不允許改既有欄位）
drop view if exists groups_view;
create view groups_view as
  select m.group_id, g.name, g.picture_url, g.category, g.left_at,
         count(*)::int as message_count, max(m.created_at) as last_at
  from messages m
  left join groups g on g.group_id = m.group_id
  group by m.group_id, g.name, g.picture_url, g.category, g.left_at;
-- 用查詢者權限（migration 010，Supabase linter 0010）：伺服端一律 service role 不受影響，
-- anon 從此看不到彙總。
alter view groups_view set (security_invoker = on);

-- 向量檢索：只比對同一 embedding 模型的向量
create or replace function match_embeddings(
  query_embedding vector(768),
  p_group_id text,
  p_model_id text,
  match_count int default 50
) returns table (id uuid, source_type text, source_id uuid, chunk_text text, similarity float, created_at timestamptz)
-- search_path 釘死（migration 010，linter 0011）；vector 型別與 <=> 都在 public
language sql stable set search_path = public as $$
  select e.id, e.source_type, e.source_id, e.chunk_text,
         1 - (e.embedding <=> query_embedding) as similarity,
         e.created_at
  from embeddings e
  where e.group_id = p_group_id and e.model_id = p_model_id
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- 媒體原檔的私有 bucket
insert into storage.buckets (id, name, public) values ('media', 'media', false)
on conflict (id) do nothing;

-- ── Phase 1：結構化抽取（事件與待辦）─────────────────────────
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  title text not null,
  starts_at date not null,                -- 日曆日（與時間分開存，月曆分桶零時區問題）
  start_time time,                        -- 沒講時間就是 null（全天/未定）
  location text,
  note text,
  status text not null default 'active',  -- active / ignored
  needs_confirmation boolean not null default true,
  source text not null default 'ai',      -- ai / manual（未來手動 CRUD 用）
  source_message_ids uuid[] not null default '{}',  -- 不設 FK：unsend 後 dangling id 無害
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_group_date on events (group_id, starts_at);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  title text not null,
  assignee text,
  due_at date,
  note text,
  status text not null default 'open',    -- open / done / ignored
  needs_confirmation boolean not null default true,
  source text not null default 'ai',
  source_message_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_group_status on tasks (group_id, status);

-- 抽取游標：null = 尚未抽取
alter table messages add column if not exists extracted_at timestamptz;
create index if not exists messages_unextracted
  on messages (group_id, created_at) where extracted_at is null;

-- 全部資料只透過後端 service role 存取；開 RLS 且不建 policy，anon key 就碰不到任何資料
alter table channels enable row level security;
alter table messages enable row level security;
alter table media_assets enable row level security;
alter table embeddings enable row level security;
alter table consent_log enable row level security;
alter table events enable row level security;
alter table tasks enable row level security;
alter table groups enable row level security;
alter table notes enable row level security;

-- 全域設定：進群告知訊息的內容與開關（可在 /settings 網頁編輯）
create table if not exists app_settings (
  id int primary key,
  join_notice_enabled boolean not null default true,
  join_notice_text text,
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict (id) do nothing;
alter table app_settings enable row level security;

-- ── 後續增補（migrations 004/006/007 回寫；005 為一次性資料清理不屬 schema）──

-- 群組理解檔案（migration 004）：AI 從該群紀錄歸納產業/術語/成員/案子，注入抽取與回答 prompt
alter table groups add column if not exists profile text;
alter table groups add column if not exists profile_updated_at timestamptz;

-- AI 用量自記帳（migration 006）：Google 無查詢額度 API，應用自己記 token 估費用畫進度條
create table if not exists api_usage (
  day date primary key,               -- 以 Asia/Taipei 為日界
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  embed_tokens bigint not null default 0,   -- embedding 無官方用量欄位，以字元數估
  blocked int not null default 0            -- 429（配額/花費上限用完）次數
);
alter table api_usage enable row level security;

create or replace function bump_usage(p_calls int, p_in bigint, p_out bigint, p_embed bigint, p_blocked int)
-- search_path 釘死：security definer 函式不釘會被 linter 0011 標警告
returns void language sql security definer set search_path = public as $$
  insert into api_usage as u (day, calls, input_tokens, output_tokens, embed_tokens, blocked)
  values ((now() at time zone 'Asia/Taipei')::date, p_calls, p_in, p_out, p_embed, p_blocked)
  on conflict (day) do update set
    calls = u.calls + excluded.calls,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    embed_tokens = u.embed_tokens + excluded.embed_tokens,
    blocked = u.blocked + excluded.blocked;
$$;

alter table app_settings add column if not exists monthly_budget_usd numeric;

-- 可在 /settings 網頁調整的 AI 設定（migration 011）。金鑰不進 DB，只讀環境變數。
alter table app_settings add column if not exists gen_model text;          -- null = 用環境變數/程式預設
alter table app_settings add column if not exists embedding_model text;    -- 同上；改了要重建向量（/api/reindex）
alter table app_settings add column if not exists ai_daily_free_calls int; -- 免費層每日請求上限，自填（Google 無查詢 API）

-- 檔案的專案歸屬（migration 007）：AI 依前後對話判斷檔案屬於哪個案子
alter table media_assets add column if not exists project text;

-- LIFF v2 成員可操作（migration 008）：最後修改者的 LINE userId（管理者從 Dashboard 改則為 null）
alter table events add column if not exists edited_by text;
alter table tasks  add column if not exists edited_by text;
alter table notes  add column if not exists edited_by text;

-- 主動送達訂閱（migration 009）：1:1 私訊、逐人訂閱、群組零聲量（計劃 B.8）
create table if not exists push_subscriptions (
  group_id text not null,
  line_user_id text not null,
  enabled boolean not null default true,
  last_sent_on date,
  fail_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, line_user_id)
);
create index if not exists push_subs_enabled on push_subscriptions (enabled) where enabled;
alter table push_subscriptions enable row level security;
alter table app_settings add column if not exists last_webhook_at timestamptz;
-- 抽取認領租約（migration 009）
alter table messages add column if not exists claimed_at timestamptz;
create index if not exists messages_claim on messages (group_id, extracted_at, claimed_at);

-- ── 多租戶（migration 012 回寫）：orgs / org_members / org_settings ──────────
-- 詳細註解見 supabase/migrations/012_orgs.sql
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  name text not null,
  created_at timestamptz not null default now()
);
insert into orgs (slug, name) values ('main', '預設組織') on conflict (slug) do nothing;

-- 新群的預設歸戶＝未認領（migration 016）：認領前不落地、不抽取；認領後 groups.org_id 才是真相
insert into orgs (slug, name) values ('unclaimed', '未認領') on conflict (slug) do nothing;
create or replace function default_org_id() returns uuid stable
language sql set search_path = public as $$
  select id from orgs where slug = 'unclaimed'
$$;

alter table groups   add column if not exists org_id uuid references orgs(id) default default_org_id();
alter table groups   add column if not exists claimed_at timestamptz;   -- 認領時間（migration 016）
alter table channels add column if not exists org_id uuid references orgs(id) default default_org_id();
create index if not exists groups_org on groups (org_id);

create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  line_user_id text not null,
  role text not null default 'admin' check (role in ('owner','admin')),
  display_name text,
  created_at timestamptz not null default now(),
  primary key (org_id, line_user_id)
);

create table if not exists org_settings (
  org_id uuid primary key references orgs(id) on delete cascade,
  join_notice_enabled boolean not null default true,
  join_notice_text text,
  monthly_budget_usd numeric,
  gen_model text,
  embedding_model text,
  ai_daily_free_calls int,
  last_webhook_at timestamptz,
  attend_join_code text,
  modules text[] not null default '{gs}',   -- 開哪些工作區：gs / attend（migration 015）
  plan text not null default 'free',        -- free / starter / team / internal（migration 017）
  max_groups int not null default 1,        -- 可認領的群組數上限（migration 017）
  paid_until date,                          -- 付費方案有效日（migration 017；PAYUNi 結帳寫入）
  monthly_ai_calls int,                     -- 每月 AI 呼叫上限，null＝不限（migration 018）
  updated_at timestamptz not null default now()
);

-- groups_view 加 org_id（清單過濾依據；孤兒群組 coalesce 歸預設 org）
drop view if exists groups_view;
create view groups_view as
  select m.group_id, g.name, g.picture_url, g.category, g.left_at,
         coalesce(g.org_id, default_org_id()) as org_id,
         count(*)::int as message_count, max(m.created_at) as last_at
  from messages m
  left join groups g on g.group_id = m.group_id
  group by m.group_id, g.name, g.picture_url, g.category, g.left_at, g.org_id;
alter view groups_view set (security_invoker = on);

alter table orgs enable row level security;
alter table org_members enable row level security;
alter table org_settings enable row level security;

-- 每 org × 月的 AI 用量（migration 018）；記帳走 bump_org_usage RPC
create table if not exists org_usage (
  org_id uuid not null references orgs(id) on delete cascade,
  month date not null,
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  embed_tokens bigint not null default 0,
  primary key (org_id, month)
);
alter table org_usage enable row level security;
create or replace function bump_org_usage(p_org uuid, p_month date, p_calls int, p_in bigint, p_out bigint, p_embed bigint)
returns void language sql security definer set search_path = public as $$
  insert into org_usage as u (org_id, month, calls, input_tokens, output_tokens, embed_tokens)
  values (p_org, p_month, p_calls, p_in, p_out, p_embed)
  on conflict (org_id, month) do update set
    calls = u.calls + excluded.calls,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    embed_tokens = u.embed_tokens + excluded.embed_tokens;
$$;

-- ── 考勤模組（migration 013 回寫）────────────────────────────
-- 詳細註解見 supabase/migrations/013_attendance.sql
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  line_user_id text not null,
  display_name text not null,
  email text,
  picture_url text,
  dept text,
  monthly_salary numeric not null default 30000,
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, line_user_id)
);
create index if not exists employees_line on employees (line_user_id);

create table if not exists punch_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists punch_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  type text not null check (type in ('in','out')),
  punched_at timestamptz not null,
  work_date date not null,
  lat double precision,
  lng double precision,
  location_id uuid references punch_locations(id),
  location_name text,
  source text not null default 'gps' check (source in ('gps','adjustment')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists punch_org_emp_date on punch_records (org_id, employee_id, work_date);

create table if not exists adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  type text not null check (type in ('in','out')),
  requested_at timestamptz not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  punch_record_id uuid references punch_records(id),
  created_at timestamptz not null default now()
);
create index if not exists adjust_org_status on adjustment_requests (org_id, status);

create table if not exists holidays (
  org_id uuid not null references orgs(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('national','workday_override')),
  name text,
  primary key (org_id, day)
);

alter table employees enable row level security;
alter table punch_locations enable row level security;
alter table punch_records enable row level security;
alter table adjustment_requests enable row level security;
alter table holidays enable row level security;

-- ── 薪資引擎（migration 014 回寫）────────────────────────────
-- 詳細註解見 supabase/migrations/014_salary.sql
create table if not exists salary_rule_sets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  version int not null,
  rules jsonb not null,
  script text,
  script_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text,
  unique (org_id, version)
);

create table if not exists payroll_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  month date not null,
  rule_set_id uuid not null references salary_rule_sets(id),
  monthly_salary numeric not null,
  input jsonb not null,
  result jsonb not null,
  finalized_by text,
  finalized_at timestamptz not null default now(),
  unique (org_id, employee_id, month)
);

alter table salary_rule_sets enable row level security;
alter table payroll_snapshots enable row level security;
