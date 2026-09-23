import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { extractGroup } from '@/core/extract';
import { gsAccess } from '@/org/orgs';

export const maxDuration = 300;

// 提取狀態：GET /api/extract?group_id=...（匯入頁進度輪詢用）→ { pending: 未提取則數 }
export async function GET(req: NextRequest) {
  const access = await gsAccess(req, null);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const groupId = req.nextUrl.searchParams.get('group_id') ?? '';
  if (!groupId || !access.inOrg(groupId)) return NextResponse.json({ pending: 0 });
  const { count, error } = await getDb()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .is('extracted_at', null); // 與 extractBatch 的認領範圍一致：不再排除媒體/低資訊，否則會謊報「已全部提取」
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); // 別把查詢失敗謊報成 0（=已全部提取）
  return NextResponse.json({ pending: count ?? 0 });
}

// 手動/回補抽取：POST /api/extract（form 參數 group_id，省略 = 本 org 全部群組）
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const groupId = form ? String(form.get('group_id') ?? '').trim() : '';
  if (groupId && !access.inOrg(groupId)) return NextResponse.json({ error: '群組不屬於此組織' }, { status: 403 });
  const groups = groupId ? [groupId] : access.groupIds;

  const stats = [];
  for (const gid of groups) {
    stats.push({ group_id: gid, ...(await extractGroup(gid)) });
  }
  return NextResponse.json(stats);
}
