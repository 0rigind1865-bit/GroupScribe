-- embeddings 依群查詢的索引（商業計劃 K3-1）：match_embeddings 以 where group_id 過濾，
-- 刪群／reindex 也依 group_id 刪；原本只有向量與 source_id 索引，群多了就是全表掃。
-- 冪等，可重複執行。
create index if not exists embeddings_group on embeddings (group_id);
