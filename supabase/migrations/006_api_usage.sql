-- AI 用量自記帳：Google 沒有提供「查詢剩餘額度」的 API（金鑰查不到用量），
-- 所以應用自己記每次呼叫的 token 數，設定頁據此估算費用並畫進度條。
-- 使用方式：貼到 Supabase SQL Editor 執行。冪等，可重複跑。

create table if not exists api_usage (
  day date primary key,               -- 以 Asia/Taipei 為日界
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  embed_tokens bigint not null default 0,   -- embedding 無官方用量欄位，以字元數估
  blocked int not null default 0            -- 429（配額/花費上限用完）次數
);
alter table api_usage enable row level security;

-- 原子累加（supabase-js 無法 increment，走 RPC）
create or replace function bump_usage(p_calls int, p_in bigint, p_out bigint, p_embed bigint, p_blocked int)
-- search_path 釘死：security definer 函式不釘會被 Supabase linter 0011 標警告
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

-- 月預算（美元）：設定頁的進度條對照值
alter table app_settings add column if not exists monthly_budget_usd numeric;
