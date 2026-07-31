-- 計劃步驟 0 的獨立迁移：groups / notes 表與 groups_view 重建
-- 用途：若整份 schema.sql 重跑在中途語句報錯（如 storage.buckets 權限）而沒跑到這段，
--       可單獨貼此檔到 Supabase SQL Editor 執行。全部冪等，可重複跑。

create table if not exists groups (
  group_id text primary key,
  name text,
  picture_url text,
  category text,
  left_at timestamptz,
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

drop view if exists groups_view;
create view groups_view as
  select m.group_id, g.name, g.picture_url, g.category, g.left_at,
         count(*)::int as message_count, max(m.created_at) as last_at
  from messages m
  left join groups g on g.group_id = m.group_id
  group by m.group_id, g.name, g.picture_url, g.category, g.left_at;

alter table groups enable row level security;
alter table notes enable row level security;
