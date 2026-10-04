-- 029：推薦獎勵（2026-10-04）。
-- 規則：別家用你的推薦連結建立組織，等他「第一次升級付費方案」時，雙方各得 30 天服務。
-- 只在對方付費時發——商業計劃第 4 節「Free 不做推薦解鎖」不變：免費方案的群數與 AI 額度不會因推薦增加。
--
-- 獎勵以「天數」記：付費中（plan 為 starter/team 且有 paid_until）直接延長到期日；
-- 免費方案或沒有到期日的先存在 referral_credit_days，之後改成付費方案時自動加上去（src/org/referral.ts）。
--
-- 冪等，可重複執行。應用端：表或欄位不存在時推薦功能靜默關閉，不擋註冊與改方案。

-- 推薦碼：每家組織一組，第一次打開「推薦好友」頁時才產生（既有組織不用回填）
alter table orgs add column if not exists referral_code text unique;

-- 還沒用掉的獎勵天數
alter table org_settings add column if not exists referral_credit_days int not null default 0;

-- 一筆推薦＝一家被推薦的組織（unique：一家只算一個推薦人）
create table if not exists referrals (
  id bigserial primary key,
  referrer_org_id uuid not null references orgs(id) on delete cascade,
  referred_org_id uuid not null unique references orgs(id) on delete cascade,
  referred_line_user_id text,                -- 用推薦連結建立組織的人
  status text not null default 'signed_up' check (status in ('signed_up', 'rewarded', 'void')),
  referrer_days int not null default 0,      -- 實際發給推薦人的天數（超過上限＝0）
  referred_days int not null default 0,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
create index if not exists referrals_referrer on referrals (referrer_org_id, status);
alter table referrals enable row level security;
