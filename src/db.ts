import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const MEDIA_BUCKET = 'media';

// 尚未設定 Supabase 時，Dashboard 顯示設定指引而不是錯誤頁
export const dbConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// 延遲建立：build 階段沒有環境變數也能編譯；service role 只在伺服器端使用
let client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 環境變數');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
