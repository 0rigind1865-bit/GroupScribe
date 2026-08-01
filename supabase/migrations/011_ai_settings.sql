-- 可在 /settings 網頁調整的 AI 設定（migration 011）。
-- 為什麼進 DB 而不是留在 .env.local：改一次模型要 ssh 進機器改檔案再重建容器，
-- 而這是會反覆調的東西（換模型、試成本）。金鑰仍然只在環境變數，不進 DB——
-- service-role 讀得到整張表，把 API key 放進來等於多開一條外洩路徑。
--
-- 冪等，可重複執行。
alter table app_settings add column if not exists gen_model text;          -- null = 用環境變數/程式預設
alter table app_settings add column if not exists embedding_model text;    -- 同上；改了要重建向量（/api/reindex）
alter table app_settings add column if not exists ai_daily_free_calls int; -- 免費層每日請求上限，自填（Google 無查詢 API）
