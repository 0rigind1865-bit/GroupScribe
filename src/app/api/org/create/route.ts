import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { liffUser } from '@/core/liff';
import { PLAN_LIMITS } from '@/org/plans';
import { normalizeRefCode, recordReferral, REFERRAL } from '@/org/referral';

// 自助建立組織：LINE 身分即 owner；免費方案（modules=gs、max_groups=1）。
// 不走 gsAccess——這是「還沒有 org」的人唯一能打的寫入端點；守門測試以白名單註明。
export async function POST(req: NextRequest) {
  const uid = await liffUser();
  if (!uid) return NextResponse.json({ error: '請先用 LINE 登入' }, { status: 403 });
  const form = await req.formData();
  const name = String(form.get('name') ?? '').trim();
  const nextRaw = String(form.get('next') ?? '');
  const next = /^\/(?!\/)/.test(nextRaw) ? nextRaw : '';
  // 推薦碼：表單（/start 帶過來）優先，沒有就看推薦連結留下的 cookie
  const ref = normalizeRefCode(form.get('ref')) || normalizeRefCode(req.cookies.get(REFERRAL.cookie)?.value);
  const back = (err: string) =>
    redirectTo(`/start?error=${err}${next ? `&next=${encodeURIComponent(next)}` : ''}${ref ? `&ref=${ref}` : ''}`);
  if (name.length < 2 || name.length > 40) return back('name');

  const db = getDb();
  // ponytail: 一個帳號最多 3 個 org，擋濫建；正式節流等有濫用再說
  const { count } = await db.from('org_members').select('org_id', { count: 'exact', head: true }).eq('line_user_id', uid).eq('role', 'owner');
  if ((count ?? 0) >= 3) return back('limit');

  const slug = `o-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`; // 客戶不需要知道 slug；碰撞機率可忽略
  const { data: org, error } = await db.from('orgs').insert({ slug, name }).select('id').single();
  if (error || !org) {
    console.error('建立 org 失敗', error);
    return NextResponse.json({ error: error?.message ?? '建立失敗' }, { status: 500 });
  }
  const now = new Date().toISOString();
  await db.from('org_settings').upsert({ org_id: org.id, modules: ['gs'], plan: 'free', max_groups: PLAN_LIMITS.free.groups, monthly_ai_calls: PLAN_LIMITS.free.aiCalls, updated_at: now }, { onConflict: 'org_id' });
  await db.from('org_members').upsert({ org_id: org.id, line_user_id: uid, role: 'owner' }, { onConflict: 'org_id,line_user_id' });
  // 推薦只記不發：獎勵等這家第一次付費才發（src/org/referral.ts）。記失敗也不擋註冊
  if (ref) await recordReferral(ref, org.id, uid);
  const res = redirectTo(next || `/o/${slug}`);
  if (req.cookies.get(REFERRAL.cookie)) res.cookies.set(REFERRAL.cookie, '', { path: '/', maxAge: 0 }); // 用過就清：同一人再開第二家不再算同一個推薦
  return res;
}
