import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { classifyFiles } from '@/core/files';
import { gsAccess } from '@/org/orgs';

export const maxDuration = 300;

// AI 依專案分類檔案：POST form 參數 group_id（檔案頁按鈕觸發）
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const groupId = String(form.get('group_id') ?? '').trim();
  const back = `${access.base}/files?group=${encodeURIComponent(groupId)}`;
  if (!groupId || !access.inOrg(groupId)) return redirectTo(`${access.base}/files`);

  try {
    const { classified, total } = await classifyFiles(groupId);
    return redirectTo(`${back}&classified=${classified}&ctotal=${total}`);
  } catch (e) {
    console.error('檔案專案分類失敗', groupId, e);
    const msg = String((e as Error).message ?? e);
    // 與 /api/profile 同一套誠實分類：quota=AI 配額、db=欄位未建（migration 007）、1=其他
    const code = /429|RESOURCE_EXHAUSTED|spending cap|額度已用完/i.test(msg) ? 'quota' : msg.includes('migration 007') ? 'db' : '1';
    if (req.headers.get('accept')?.includes('text/html')) return redirectTo(`${back}&cerror=${code}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
