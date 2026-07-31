-- 群組理解檔案：AI 從該群組自己的紀錄歸納「產業/業務、常用術語、成員角色、進行中案子」，
-- 注入抽取與 @提及回答的 prompt，讓助理逐群學會該群的行話與脈絡（各行業通用，不預設任何產業）。
-- 使用方式：貼到 Supabase SQL Editor 執行。冪等，可重複跑。
alter table groups add column if not exists profile text;
alter table groups add column if not exists profile_updated_at timestamptz;
