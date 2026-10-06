-- 030：員工「申請核銷」（2026-10）
-- 員工記好一筆＝還沒申請；在「我的清單」勾好按「申請核銷」才送到公司的「還沒核銷」清單。
-- 應用端：欄位不存在時全部當成已申請（照舊），先部署後貼也不壞。
-- 舊資料只在第一次加欄位時補成已申請（以前記好就算送出），重貼不會把新的「還沒申請」洗掉。
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'expenses' and column_name = 'submitted_at') then
    alter table expenses add column submitted_at timestamptz;
    update expenses set submitted_at = coalesce(reimbursed_at, created_at);
  end if;
end $$;
