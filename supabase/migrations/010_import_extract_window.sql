-- 010：匯入抽取時間窗 ＋ Supabase 安全掃描修正

-- 1) groups_view 改用「查詢者權限」（linter 0010 security_definer_view）。
--    伺服端一律用 service role（繞過 RLS），行為不變；anon 從此看不到彙總，正是預期。
alter view public.groups_view set (security_invoker = on);

-- 2) match_embeddings 釘住 search_path（linter 0011）。vector 型別與 <=> 都在 public。
alter function public.match_embeddings(vector, text, text, integer) set search_path = public;

-- 3) 匯入的歷史訊息只當「群組理解」的素材，不進抽取隊列。
--    政策與 core/importer.ts 的 EXTRACT_WINDOW_DAYS 相同，這裡是既有資料的一次性回填：
--    窗外的匯入訊息標為已處理（向量索引早已建好，問答與群組歸納照樣找得到），
--    窗內與 webhook 收到的維持 null，照常排隊抽取。
update messages
   set extracted_at = now()
 where source = 'import'
   and extracted_at is null
   and created_at < now() - interval '30 days';
