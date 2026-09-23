-- 模組開關（商業計劃 2.1 節 A1/A11）：每個 org 開哪些工作區。
--
-- 為什麼要有：群組助理原本是平台擁有者專屬（middleware 硬牆），第二個租戶的管理員進不來。
-- 開放後「誰能看哪個模組」得有資料依據，不能再用「是不是平台擁有者」推。
-- 值：'gs'（群組助理）、'attend'（考勤）。平台擁有者不受此欄位限制（永遠看得到全部）。
--
-- 冪等，可重複執行。
alter table org_settings add column if not exists modules text[] not null default '{gs}';

-- 既有租戶回填：預設組織兩個都開；其餘目前只用考勤（開放前的實際狀態），不改變任何人看到的東西
update org_settings set modules = '{gs,attend}' where org_id = default_org_id() and modules = '{gs}';
update org_settings set modules = '{attend}' where org_id <> default_org_id() and modules = '{gs}';
-- 沒有 org_settings 列的 org 視同只開考勤（程式端 null → attend），要開群組助理請插一列
