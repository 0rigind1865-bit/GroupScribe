-- 未認領歸戶（商業計劃 2.1 節 A5）：共用一個 bot 時，新群不知道屬於哪家公司。
--
-- 以前：新群預設歸 main（平台擁有者自己的組織）——第二個客戶的群會落到你這裡。
-- 現在：新群預設歸 'unclaimed'；認領前不落地訊息、不抽取、不索引，bot 只回認領連結，
-- 7 天沒人認領自動退群。認領＝把 groups.org_id 改成該公司（唯一真相，K2）。
--
-- 冪等，可重複執行。
insert into orgs (slug, name) values ('unclaimed', '未認領') on conflict (slug) do nothing;

-- 歷史孤兒群（有 messages 沒 groups 列）先補列歸 main：
-- 否則下一步把預設 org 換成 unclaimed 後，groups_view 的 coalesce 會讓它們從 main 的清單消失
insert into groups (group_id, org_id)
select distinct m.group_id, (select id from orgs where slug = 'main')
from messages m
left join groups g on g.group_id = m.group_id
where g.group_id is null
on conflict (group_id) do nothing;

-- 預設 org 改為 unclaimed（groups/channels 的欄位預設與 groups_view 的 coalesce 都吃這個函式）
create or replace function default_org_id() returns uuid stable
language sql set search_path = public as $$
  select id from orgs where slug = 'unclaimed'
$$;

alter table groups add column if not exists claimed_at timestamptz;
