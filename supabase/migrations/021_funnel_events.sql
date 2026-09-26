-- 021：漏斗事件（商業計劃 L1）——成員從哪個觸點打開 LIFF。
-- 沒有這張表，「LIFF 開啟率 <20% 就重評」的止損線永遠量不到。
-- 應用端寫入失敗只 warn（見 src/core/funnel.ts），所以先部署、後貼這段也不會壞。
create table if not exists funnel_events (
  id bigserial primary key,
  org_id uuid,
  group_id text,
  line_user_id text,
  step text not null,          -- liff_open（之後：share、join、claim…）
  source text,                 -- notice／answer／digest；其他或沒帶＝null
  at timestamptz not null default now()
);
create index if not exists funnel_events_step_at on funnel_events (step, at);
alter table funnel_events enable row level security;
