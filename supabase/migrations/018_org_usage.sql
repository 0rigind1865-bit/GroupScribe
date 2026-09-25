-- 每家 org 的 AI 用量與月上限（商業計劃 B5/B7 費用煞車）。
--
-- 為什麼：api_usage 是全站一張表，免費用戶可以無限丟訊息燒 Gemini 額度而沒有任何東西擋。
-- 這裡按 org × 月記 calls/tokens；org_settings.monthly_ai_calls 是上限（null＝不限，平台自己用）。
-- 六個 AI 入口（抽取／索引／問答／媒體解析／群組理解／檔案分類）進門先查，用完就停：
-- 訊息照存、不整理，管理員在方案頁看得到用量。
--
-- 冪等，可重複執行。
create table if not exists org_usage (
  org_id uuid not null references orgs(id) on delete cascade,
  month date not null,                 -- 該月 1 號（Asia/Taipei）
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

alter table org_settings add column if not exists monthly_ai_calls int;  -- null = 不限
update org_settings set monthly_ai_calls = case plan
  when 'free' then 1500 when 'starter' then 6000 when 'team' then 20000 else null end
where monthly_ai_calls is null and plan <> 'internal';
