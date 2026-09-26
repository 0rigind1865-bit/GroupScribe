-- 022：報帳（X1，整合 Snaptab）——員工私訊群記一張收據照 → 自動記一筆。
-- 應用端：表不存在時記帳只 warn、管理頁顯示「請先執行 migration」，先部署後貼也不壞。
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  line_user_id text not null,          -- 誰墊的
  person_name text,                    -- 顯示用快照
  media_asset_id uuid unique references media_assets(id) on delete cascade, -- unique：重試不重複記；收回照片即刪
  spent_on date not null,
  amount int not null check (amount >= 0),
  category text not null default '雜支',
  vendor text not null default '',
  note text not null default '',
  project text not null default '',    -- Snaptab 的「案場」，UI 叫「專案」
  invoice_no text not null default '',
  reimbursed_at timestamptz,           -- null＝還沒報
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_org_date on expenses (org_id, spent_on desc);
alter table expenses enable row level security;

-- 預設 org（平台擁有者自己的公司）先開報帳模組；其他公司由平台擁有者之後再開
update org_settings set modules = array_append(modules, 'expense')
where org_id = default_org_id() and not ('expense' = any(modules));
