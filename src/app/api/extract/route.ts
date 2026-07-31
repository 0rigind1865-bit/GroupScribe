import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { extractGroup } from '@/core/extract';

export const maxDuration = 300;

// 提取狀態：GET /api/extract?group_id=...（匯入頁進度輪詢用）→ { pending: 未提取則數 }
export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get('group_id') ?? '';
  if (!groupId) return NextResponse.json({ pending: 0 });
  const { count, error } = await getDb()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .is('extracted_at', null); // 與 extractBatch 的認領範圍一致：不再排除媒體/低資訊，否則會謊報「已全部提取」
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); // 別把查詢失敗謊報成 0（=已全部提取）
  return NextResponse.json({ pending: count ?? 0 });
}

// 手動/回補抽取：POST /api/extract（form 參數 group_id，省略 = 全部群組）
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const groupId = form ? String(form.get('group_id') ?? '').trim() : '';
  const groups = groupId
    ? [groupId]
    : ((await getDb().from('groups_view').select('group_id')).data ?? []).map((g: any) => g.group_id);

  const stats = [];
  for (const gid of groups) {
    stats.push({ group_id: gid, ...(await extractGroup(gid)) });
  }
  return NextResponse.json(stats);
}
