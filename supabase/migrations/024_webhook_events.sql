-- 024：webhook 先落地再回 200（商業計劃 G4）——處理失敗或容器重啟也不會漏。
-- 應用端：這張表不存在時 webhook 自動走舊路徑（直接處理），先部署後貼也不壞。
create table if not exists webhook_events (
  id bigserial primary key,
  channel_id text,
  webhook_event_id text unique,        -- LINE 的 webhookEventId；重送（redelivery）靠它冪等
  is_redelivery boolean,
  payload jsonb not null,              -- LINE 原始的單一 event（不是解析後的結果）
  received_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  attempts int not null default 0,
  error text
);
create index if not exists webhook_events_pending on webhook_events (id) where processed_at is null;
alter table webhook_events enable row level security;

-- 認領待處理事件（租約 10 分鐘、最多試 5 次）。skip locked：兩個處理者同時跑也不會拿到同一筆
create or replace function claim_webhook_events(n int default 50)
returns setof webhook_events
language sql
as $$
  update webhook_events w
     set claimed_at = now(), attempts = w.attempts + 1
   where w.id in (
     select id from webhook_events
      where processed_at is null
        and attempts < 5
        and (claimed_at is null or claimed_at < now() - interval '10 minutes')
      order by id
      limit n
      for update skip locked
   )
  returning w.*;
$$;
