-- 一次性清理：舊版提取（無過期過濾）灌進來的陳舊資料。可重複執行（冪等）。
-- 皆為可復原的狀態變更：status 改回 open / needs_confirmation 改回 true 即還原，資料不刪。

-- 過期超過 7 天的 open 待辦 → 忽略（2026-07-19 統計為 241 筆；7 天內逾期的保留，可能還要做）
update tasks set status = 'ignored'
where status = 'open' and due_at < '2026-07-12';

-- 已過去的事件清除「待確認」標記（統計為 697 筆；過去的事沒什麼好確認，留在月曆當歷史紀錄）
update events set needs_confirmation = false
where needs_confirmation and starts_at < '2026-07-19';
