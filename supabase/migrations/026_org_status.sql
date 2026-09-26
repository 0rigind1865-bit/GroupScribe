-- 026：公司停權狀態（商業計劃 A8 的最小版）。suspended＝停所有 AI（整理、讀圖、問答、記帳解析），訊息照常保存。
-- 不做自動退群、刪資料、私訊通知（不可逆或對外，等有真實逾期案例再做）。
-- 應用端：欄位不存在時視為 active。
alter table org_settings add column if not exists status text not null default 'active';
alter table org_settings drop constraint if exists org_settings_status_check;
alter table org_settings add constraint org_settings_status_check check (status in ('active', 'suspended'));
