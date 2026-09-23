import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { importChat } from '@/core/importer';
import { claimGroup, gsAccess } from '@/org/orgs';

export const maxDuration = 300; // 匯入幾個月的歷史要跑一陣子；自架長跑無限制

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const back = `${access.base}/import`;
  // 群組：補的新群組優先，否則用下拉選的
  const groupId = String(form.get('new_group') ?? '').trim() || String(form.get('group_id') ?? '').trim();
  // 內容：貼上的文字優先，否則讀上傳檔案
  let txt = String(form.get('text') ?? '').trim();
  const file = form.get('file');
  if (!txt && file instanceof File && file.size > 0) txt = await file.text();

  if (!groupId || !txt) return redirectTo(`${back}?error=1`);
  // 新群組在此認領進本 org（匯入只寫 messages、不建 groups 列，不認領就會落到預設 org）
  if (!(await claimGroup(access.org.id, groupId))) return redirectTo(`${back}?error=3`);

  try {
    const { inserted, indexed, archived } = await importChat(groupId, txt);
    return redirectTo(
      `${back}?inserted=${inserted}&indexed=${indexed}&archived=${archived}&group=${encodeURIComponent(groupId)}`,
    );
  } catch (e) {
    console.error('匯入中途失敗', e); // 最常見：Gemini 配額/花費上限用完，embedding 索引失敗
    return redirectTo(`${back}?error=2`);
  }
}
