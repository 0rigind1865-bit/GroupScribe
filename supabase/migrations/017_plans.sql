-- 方案欄位（商業計劃 A8 最小版）：自助註冊後每個 org 有方案與群組上限。
-- free＝1 群（永久免費）；付費方案（starter 3 群／team 10 群）待 PAYUNi 串接後由結帳寫入；
-- 平台擁有者的預設組織不受限。認領群組時以 max_groups 擋（/api/group/claim）。
--
-- 冪等，可重複執行。
alter table org_settings add column if not exists plan text not null default 'free';
alter table org_settings add column if not exists max_groups int not null default 1;
alter table org_settings add column if not exists paid_until date;

-- 既有租戶不受新上限影響：預設組織不限；其餘既有組織維持目前群數（至少 1）
update org_settings set plan = 'internal', max_groups = 999 where org_id = (select id from orgs where slug = 'main');
update org_settings s set max_groups = greatest(s.max_groups, (select count(*) from groups g where g.org_id = s.org_id and g.left_at is null))
 where s.plan = 'free';
