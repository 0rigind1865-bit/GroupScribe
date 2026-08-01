import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { liffUser, verifyIdToken } from '@/core/liff';

// 員工加入 org（對等舊制「首次 LINE 登入自動寫入員工名單、未啟用」）：
// 管理員把加入碼（org_settings.attend_join_code）連同 LIFF 連結給員工 →
// 員工填碼送出 → 建 pending 員工列 → 管理員在員工管理頁啟用並設薪資。
// 加入碼擋的是陌生人亂註冊，不是安全邊界——啟用與否才是。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '').trim().toLowerCase();
  const code = String(form.get('code') ?? '').trim();
  const name = String(form.get('name') ?? '').trim();
  if (!slug || !code) return redirectTo('/a/join?err=ERR_JOIN_PARAMS');

  const uid = await liffUser();
  if (!uid) return redirectTo('/a?err=ERR_SESSION');

  const db = getDb();
  const { data: org } = await db.from('orgs').select('id').eq('slug', slug).maybeSingle();
  if (!org) return redirectTo(`/a/join?err=ERR_JOIN_CODE&org=${encodeURIComponent(slug)}`);
  const { data: st } = await db.from('org_settings').select('attend_join_code').eq('org_id', org.id).maybeSingle();
  if (!st?.attend_join_code || st.attend_join_code !== code) {
    return redirectTo(`/a/join?err=ERR_JOIN_CODE&org=${encodeURIComponent(slug)}`);
  }

  // LINE 顯示名稱做預設名（表單可覆寫）；idToken 已在 session 建立時驗過，這裡拿不到 name 就用表單值
  const display = name || `LINE 使用者 ${uid.slice(-6)}`;
  const { error } = await db.from('employees').upsert(
    { org_id: org.id, line_user_id: uid, display_name: display },
    { onConflict: 'org_id,line_user_id', ignoreDuplicates: true }, // 已存在（含 disabled）不覆寫狀態
  );
  if (error) {
    console.error('join 寫入失敗', error);
    return redirectTo('/a/join?err=ERR_WRITE');
  }
  return redirectTo('/a?joined=1');
}
