import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { profileGroup } from '@/core/profile';

export const maxDuration = 120;

// 產生/更新群組理解：POST form 參數 group_id。
// 匯入頁抽取完成後由 fetch 呼叫（回 JSON）；總覽卡片「重新產生」表單送出（導回總覽）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const groupId = String(form.get('group_id') ?? '').trim();
  const wantsHtml = req.headers.get('accept')?.includes('text/html');
  if (!groupId) return wantsHtml ? redirectTo('/') : NextResponse.json({ error: '缺 group_id' }, { status: 400 });

  try {
    const profile = await profileGroup(groupId);
    return wantsHtml ? redirectTo(`/groups?group=${encodeURIComponent(groupId)}`) : NextResponse.json({ profile });
  } catch (e) {
    console.error('產生群組理解失敗', groupId, e);
    // 分類失敗原因，紅字才不會誤導：quota=AI 配額/花費上限、db=欄位未建（migration 004）、1=其他
    const msg = String((e as Error).message ?? e);
    const code = /429|RESOURCE_EXHAUSTED|spending cap/i.test(msg) ? 'quota' : msg.includes('migration 004') ? 'db' : '1';
    return wantsHtml
      ? redirectTo(`/groups?profile_error=${code}&group=${encodeURIComponent(groupId)}`)
      : NextResponse.json({ error: msg }, { status: 500 });
  }
}
