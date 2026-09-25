-- 個人筆記（商業計劃 G8）：1:1 聊天室以 group_id「dm:<userId>」當一個群，歸到本人的 org。
--
-- 為什麼改 view：後台所有群組清單（orgGroups、各頁、API 門禁 gsAccess）都從 groups_view 取，
-- 個人筆記只有本人能看，不能出現在公司管理員的後台。在這一處排除就全部生效；
-- 本人的清單由 core/liff.ts myGroups 直接查 groups 表另外加上。
--
-- 冪等，可重複執行（欄位不變，create or replace 即可）。
create or replace view groups_view as
  select m.group_id, g.name, g.picture_url, g.category, g.left_at,
         coalesce(g.org_id, default_org_id()) as org_id,
         count(*)::int as message_count, max(m.created_at) as last_at
  from messages m
  left join groups g on g.group_id = m.group_id
  where m.group_id not like 'dm:%'
  group by m.group_id, g.name, g.picture_url, g.category, g.left_at, g.org_id;
alter view groups_view set (security_invoker = on);
