import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';
import { forgetGroupOrg } from '@/core/ingest';
import { verifyClaimToken } from '@/core/liff';
import { gsAccess } from '@/org/orgs';

// 認領／移轉群組（A5）：把 groups.org_id 改成目標 org——這是歸戶的唯一真相（K2）。
// 兩條路進來：
//   認領頁（客戶管理員）：需帶群內連結的 token，且群目前必須是未認領（先認領者得）
//   群組頁的「移轉」下拉（平台擁有者）：不需 token，可在任意 org 之間搬
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form); // slug 來自表單 org＝目標組織
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const groupId = String(form.get('group_id') ?? '').trim();
  if (!groupId) return NextResponse.json({ error: '缺 group_id' }, { status: 400 });
  const platform = access.via === 'platform';
  if (!platform && !verifyClaimToken(groupId, String(form.get('t') ?? ''))) {
    return NextResponse.json({ error: '認領連結無效' }, { status: 403 });
  }

  const db = getDb();
  const [{ data: cur }, { data: unc }] = await Promise.all([
    db.from('groups').select('org_id').eq('group_id', groupId).maybeSingle(),
    db.from('orgs').select('id').eq('slug', 'unclaimed').maybeSingle(),
  ]);
  if (!platform) {
    if (access.slug === 'unclaimed') return NextResponse.json({ error: '不能認領到未認領' }, { status: 403 });
    if (cur && unc && cur.org_id !== unc.id) return NextResponse.json({ error: '這個群已被認領' }, { status: 409 });
    // 方案上限（migration 017）：free＝1 群；滿了導去升級頁
    const [{ data: st }, { count }] = await Promise.all([
      db.from('org_settings').select('max_groups').eq('org_id', access.org.id).maybeSingle(),
      db.from('groups').select('group_id', { count: 'exact', head: true }).eq('org_id', access.org.id).is('left_at', null).not('group_id', 'like', 'dm:%'),
    ]);
    if ((count ?? 0) >= (st?.max_groups ?? 1)) return redirectTo(`${access.base}/upgrade?limit=1`);
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from('groups')
    .upsert({ group_id: groupId, org_id: access.org.id, claimed_at: now, updated_at: now }, { onConflict: 'group_id' });
  if (error) {
    console.error('認領失敗', groupId, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  forgetGroupOrg(groupId); // 下一則訊息立刻開始記錄，不等快取過期

  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : `${access.base}/groups?group=${encodeURIComponent(groupId)}&claimed=1`;
  return redirectTo(back);
}
