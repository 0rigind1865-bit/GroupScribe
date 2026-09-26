-- 023：報帳 v2（X2，Snaptab 其餘功能）——一次加齊，貼一段就好。
-- 應用端：欄位不存在時寫入會自動退回只寫 v1 欄位（src/expense/store.ts），先部署後貼也不壞。
alter table expenses add column if not exists pay_method text not null default '代墊';
alter table expenses drop constraint if exists expenses_pay_method_check;
alter table expenses add constraint expenses_pay_method_check check (pay_method in ('代墊', '公司卡', '現金'));
alter table expenses add column if not exists source text not null default 'photo';  -- photo／web／text
alter table expenses add column if not exists photo_path text;                        -- 網頁上傳的收據照（Storage 路徑）
alter table expenses add column if not exists lat double precision;
alter table expenses add column if not exists lng double precision;
alter table expenses add column if not exists place_name text not null default '';
create index if not exists expenses_org_person on expenses (org_id, line_user_id, spent_on desc);

-- 自訂分類（null＝用預設六類）
alter table org_settings add column if not exists expense_categories text[];
