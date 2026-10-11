-- 035：AI 用量按「用途」拆開記（抽取／索引／問答／語音／記帳判斷…）
-- 為什麼：api_usage 只有總數，評估要不要換判斷模型時全靠推估（±20%）。先量再說。
-- 程式在表還沒建時只警告一次、照常運作（向後相容鐵則）。
create table if not exists api_usage_purpose (
  day date not null,                 -- 以 Asia/Taipei 為日界
  purpose text not null,             -- extract / embed / answer / vision / audio / profile / files / expense_text / expense_price / other
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, purpose)
);
alter table api_usage_purpose enable row level security;

create or replace function bump_usage_purpose(p_purpose text, p_calls int, p_in bigint, p_out bigint)
returns void language sql security definer set search_path = public as $$
  insert into api_usage_purpose as u (day, purpose, calls, input_tokens, output_tokens)
  values ((now() at time zone 'Asia/Taipei')::date, p_purpose, p_calls, p_in, p_out)
  on conflict (day, purpose) do update set
    calls = u.calls + excluded.calls,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens;
$$;
