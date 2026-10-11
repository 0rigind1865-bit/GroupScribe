-- 036：記帳加「收支種類」kind——個人也能記收入（薪水、進帳）。
-- 收據照永遠是支出；收入不進「申請核銷」；統計分「支出／收入／結餘」。
-- 向後相容：欄位還沒建時，支出照舊寫入（store.ts 自動拿掉 kind）；收入則不記、不誤記成支出。
alter table expenses add column if not exists kind text not null default 'expense' check (kind in ('expense', 'income'));
