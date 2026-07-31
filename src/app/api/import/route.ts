import { NextRequest } from 'next/server';
import { redirectTo } from '@/http';
import { importChat } from '@/core/importer';

export const maxDuration = 300; // 匯入幾個月的歷史要跑一陣子；自架長跑無限制

export async function POST(req: NextRequest) {
  const form = await req.formData();
  // 群組：補的新群組優先，否則用下拉選的
  const groupId = String(form.get('new_group') ?? '').trim() || String(form.get('group_id') ?? '').trim();
  // 內容：貼上的文字優先，否則讀上傳檔案
  let txt = String(form.get('text') ?? '').trim();
  const file = form.get('file');
  if (!txt && file instanceof File && file.size > 0) txt = await file.text();

  if (!groupId || !txt) return redirectTo('/import?error=1');

  try {
    const { inserted, indexed, archived } = await importChat(groupId, txt);
    return redirectTo(
      `/import?inserted=${inserted}&indexed=${indexed}&archived=${archived}&group=${encodeURIComponent(groupId)}`,
    );
  } catch (e) {
    console.error('匯入中途失敗', e); // 最常見：Gemini 配額/花費上限用完，embedding 索引失敗
    return redirectTo('/import?error=2');
  }
}
