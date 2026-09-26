-- 025：內容表帶 org_id（商業計劃 G3）——為日後 RLS（per-org JWT）鋪路。應用程式目前不讀這些欄位。
--
-- 做法：不寫 transfer_group() 讓應用端呼叫，改在 groups 表掛觸發器——
-- 群組換公司（任何入口：認領、平台移轉、個人筆記歸戶、手動 SQL）時自動把內容表的 org_id 跟著改。
-- 新內容 insert 時由觸發器從 groups 帶入。groups.org_id 為 null 的舊群，比照 groups_view 視為預設 org。
--
-- ⚠ 大表 backfill（messages、embeddings）可能跑比較久，請離峰貼。
-- ⚠ 之後群組換公司會變成跨 7 張表的批次 UPDATE（大群數十萬列），認領那一下會慢一點。

alter table messages           add column if not exists org_id uuid;
alter table media_assets       add column if not exists org_id uuid;
alter table embeddings         add column if not exists org_id uuid;
alter table events             add column if not exists org_id uuid;
alter table tasks              add column if not exists org_id uuid;
alter table notes              add column if not exists org_id uuid;
alter table push_subscriptions add column if not exists org_id uuid;

-- 新列：從 groups 帶入
create or replace function fill_org_id_from_group() returns trigger language plpgsql as $$
begin
  if new.org_id is null then
    select coalesce(g.org_id, default_org_id()) into new.org_id from groups g where g.group_id = new.group_id;
  end if;
  return new;
end $$;

-- media_assets 沒有 group_id，經 messages 取
create or replace function fill_org_id_from_message() returns trigger language plpgsql as $$
begin
  if new.org_id is null then
    select m.org_id into new.org_id from messages m where m.id = new.message_id;
  end if;
  return new;
end $$;

drop trigger if exists messages_fill_org on messages;
create trigger messages_fill_org before insert on messages for each row execute function fill_org_id_from_group();
drop trigger if exists embeddings_fill_org on embeddings;
create trigger embeddings_fill_org before insert on embeddings for each row execute function fill_org_id_from_group();
drop trigger if exists events_fill_org on events;
create trigger events_fill_org before insert on events for each row execute function fill_org_id_from_group();
drop trigger if exists tasks_fill_org on tasks;
create trigger tasks_fill_org before insert on tasks for each row execute function fill_org_id_from_group();
drop trigger if exists notes_fill_org on notes;
create trigger notes_fill_org before insert on notes for each row execute function fill_org_id_from_group();
drop trigger if exists push_subs_fill_org on push_subscriptions;
create trigger push_subs_fill_org before insert on push_subscriptions for each row execute function fill_org_id_from_group();
drop trigger if exists media_fill_org on media_assets;
create trigger media_fill_org before insert on media_assets for each row execute function fill_org_id_from_message();

-- 群組換公司（或第一次建 groups 列）→ 內容表跟著改
create or replace function cascade_group_org() returns trigger language plpgsql as $$
declare o uuid := coalesce(new.org_id, default_org_id());
begin
  update messages           set org_id = o where group_id = new.group_id and org_id is distinct from o;
  update embeddings         set org_id = o where group_id = new.group_id and org_id is distinct from o;
  update events             set org_id = o where group_id = new.group_id and org_id is distinct from o;
  update tasks              set org_id = o where group_id = new.group_id and org_id is distinct from o;
  update notes              set org_id = o where group_id = new.group_id and org_id is distinct from o;
  update push_subscriptions set org_id = o where group_id = new.group_id and org_id is distinct from o;
  update media_assets a     set org_id = o from messages m
   where m.id = a.message_id and m.group_id = new.group_id and a.org_id is distinct from o;
  return null;
end $$;

drop trigger if exists groups_cascade_org_upd on groups;
create trigger groups_cascade_org_upd after update of org_id on groups
  for each row when (old.org_id is distinct from new.org_id) execute function cascade_group_org();
drop trigger if exists groups_cascade_org_ins on groups;
create trigger groups_cascade_org_ins after insert on groups
  for each row execute function cascade_group_org();

-- 既有資料 backfill（可重跑：只補還是 null 的）
update messages t set org_id = coalesce(g.org_id, default_org_id()) from groups g where t.group_id = g.group_id and t.org_id is null;
update embeddings t set org_id = coalesce(g.org_id, default_org_id()) from groups g where t.group_id = g.group_id and t.org_id is null;
update events t set org_id = coalesce(g.org_id, default_org_id()) from groups g where t.group_id = g.group_id and t.org_id is null;
update tasks t set org_id = coalesce(g.org_id, default_org_id()) from groups g where t.group_id = g.group_id and t.org_id is null;
update notes t set org_id = coalesce(g.org_id, default_org_id()) from groups g where t.group_id = g.group_id and t.org_id is null;
update push_subscriptions t set org_id = coalesce(g.org_id, default_org_id()) from groups g where t.group_id = g.group_id and t.org_id is null;
update media_assets a set org_id = m.org_id from messages m where m.id = a.message_id and a.org_id is null and m.org_id is not null;
