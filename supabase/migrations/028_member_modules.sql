-- 管理權依模組授權（身分切換改版的前置）
--
-- 原本 org_members 一列＝整家公司的管理權。在考勤「員工管理」把某人設成管理員，
-- 他也同時能進群組助理，讀到全公司 LINE 群組的整理內容。
--
-- modules：這位管理者能管哪些模組（'gs' | 'attend' | 'expense'）
--   null ＝ 公司開的全部模組（既有管理員維持原狀，這支 migration 不改變任何人現有的權限）
--   owner 一律視為全部，不受此欄限制（程式端 scopedModuleIds）
alter table org_members add column if not exists modules text[];

comment on column org_members.modules is
  '可管理的模組（gs/attend/expense）；null＝公司開的全部；owner 不受限';
