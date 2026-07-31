-- 檔案的專案歸屬：AI 依前後對話上下文判斷檔案屬於哪個工作專案/案子（檔案頁可依此篩選、分組）
-- 使用方式：貼到 Supabase SQL Editor 執行。冪等，可重複跑。
alter table media_assets add column if not exists project text;
