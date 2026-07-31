-- 主動送達（計劃 B.8）：1:1 私訊、每個人自己決定訂不訂閱、群組永遠零聲量。
-- consent 落在個人層級：誰想收誰自己在 LIFF 打開。
-- 使用方式：貼到 Supabase SQL Editor 執行。冪等，可重複跑。

create table if not exists push_subscriptions (
  group_id text not null,
  line_user_id text not null,
  enabled boolean not null default true,
  last_sent_on date,                      -- 以 Asia/Taipei 為界，防同日重複推送
  fail_count int not null default 0,      -- 連續推送失敗次數（403=封鎖/解除好友時自動停用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, line_user_id)
);
create index if not exists push_subs_enabled on push_subscriptions (enabled) where enabled;
alter table push_subscriptions enable row level security;

-- 送達健康：最後一次收到 webhook 的時間（漏收不可回補，靜默流失要看得見）
alter table app_settings add column if not exists last_webhook_at timestamptz;

-- 抽取認領租約（計劃 H 節第四批）：認領時只寫 claimed_at，成功套用後才寫 extracted_at。
-- 程序被殺（部署重啟、crash）時租約逾期自動放回隊列，不會讓整批訊息永久被視為已抽取。
alter table messages add column if not exists claimed_at timestamptz;
create index if not exists messages_claim on messages (group_id, extracted_at, claimed_at);
