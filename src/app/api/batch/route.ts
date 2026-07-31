import { NextRequest } from 'next/server';
import { redirectTo } from '@/http';
import { getDb, MEDIA_BUCKET } from '@/db';

// 批次操作：kind=task|event|note|file，ids 多值。
// task/event/note：confirm（清待確認）/ ignore / restore / done（僅 task）——與單筆 update 路由同一套欄位慣例。
// file：project（指定專案）/ delete（需勾確認；連 Storage 原檔一併刪除）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const kind = String(form.get('kind') ?? '');
  const action = String(form.get('action') ?? '');
  const ids = form.getAll('ids').map(String).filter(Boolean);
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : '/';
  if (!ids.length) return redirectTo(back);

  const db = getDb();
  const now = new Date().toISOString();
  const table = ({ task: 'tasks', event: 'events', note: 'notes' } as Record<string, string>)[kind];

  if (table) {
    const patch: Record<string, unknown> | null =
      action === 'confirm'
        ? { needs_confirmation: false }
        : action === 'ignore'
          ? { status: 'ignored' }
          : action === 'done' && kind === 'task'
            ? { status: 'done', needs_confirmation: false }
            : action === 'restore'
              ? { status: kind === 'task' ? 'open' : 'active' }
              : null;
    if (patch) {
      const { error } = await db.from(table).update({ ...patch, updated_at: now }).in('id', ids);
      if (error) console.error('批次操作失敗', kind, action, error);
    }
  } else if (kind === 'file') {
    if (action === 'project') {
      const project = String(form.get('project') ?? '').trim().slice(0, 40);
      if (project) {
        const { error } = await db.from('media_assets').update({ project }).in('id', ids);
        if (error) console.error('批次指定專案失敗', error); // migration 007 未跑時在此浮現
      }
    } else if (action === 'delete' && form.get('confirm_delete') === 'on') {
      const { data: rows } = await db.from('media_assets').select('storage_path').in('id', ids);
      const paths = (rows ?? []).map((r) => r.storage_path);
      if (paths.length) await db.storage.from(MEDIA_BUCKET).remove(paths);
      const { error } = await db.from('media_assets').delete().in('id', ids);
      if (error) console.error('批次刪除檔案失敗', error);
    }
  }
  return redirectTo(back);
}
