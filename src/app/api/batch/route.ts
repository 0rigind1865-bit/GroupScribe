import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { getDb, MEDIA_BUCKET } from '@/db';
import { gsAccess } from '@/org/orgs';

// 批次操作：kind=task|event|note|file|inbox，ids 多值（inbox 的 ids 為 `kind:id`，三表混排）。
// task/event/note：confirm（清待確認）/ ignore / restore / done（僅 task）——與單筆 update 路由同一套欄位慣例。
// inbox：confirm / ignore / restore（ignore 後轉回時帶 ?undo=，給收件匣的「復原」橫幅用；
//        勾選的帶 kind:id，「選取全部 N 筆」帶 all@<毫秒>＝那次 update 寫進 updated_at 的時間）。
// file：project（指定專案）/ delete（需勾確認，沒勾回 400 講清楚；連 Storage 原檔一併刪除）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const kind = String(form.get('kind') ?? '');
  const action = String(form.get('action') ?? '');
  const ids = form.getAll('ids').map(String).filter(Boolean);
  const backRaw = String(form.get('back') ?? '');
  let back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : access.base;

  const db = getDb();
  const now = new Date().toISOString();
  const TABLE: Record<string, string> = { task: 'tasks', event: 'events', note: 'notes' };
  // hasOwn 不用直接取值：kind=constructor 之類會從原型鏈拿到函式、被當成表名
  const table = Object.hasOwn(TABLE, kind) ? TABLE[kind] : undefined;

  // 收件匣「選取全部 N 筆」（all=1）：不靠 ids，照收件匣頁同一組條件處理全部——連沒顯示的也算。
  // 範圍一律綁本公司的群；帶了 group 卻不是本公司的群＝什麼都不做（不擴大成整家公司）。
  // before：頁面算出 N 筆的時間點。用 updated_at 比：之後才進來的、被 AI 改過又重標待確認的都不算（你還沒看過）
  if (kind === 'inbox' && form.get('all') === '1' && (action === 'confirm' || action === 'ignore')) {
    const g = String(form.get('group') ?? '');
    if (g && !access.groupIds.includes(g)) return redirectTo(back);
    const scope = g ? [g] : access.groupIds;
    const before = String(form.get('before') ?? '');
    const cutoff = before && !Number.isNaN(Date.parse(before)) ? before : now;
    const patch = action === 'confirm' ? { needs_confirmation: false } : { status: 'ignored' };
    const pending = {
      events: (q: any) => q.neq('status', 'ignored'),
      tasks: (q: any) => q.eq('status', 'open'),
      notes: (q: any) => q.eq('status', 'active'),
    };
    for (const [t, only] of Object.entries(pending)) {
      const { error } = await only(
        db.from(t).update({ ...patch, updated_at: now }).in('group_id', scope).eq('needs_confirmation', true).lte('updated_at', cutoff),
      );
      if (error) console.error('收件匣全部處理失敗', t, action, error);
    }
    // 全部忽略也要救得回來（principles.md：可逆性優先）：這次每一筆的 updated_at 都是同一個 now，
    // 拿它當復原憑證帶回收件匣，不用把幾百個 id 塞進網址
    if (action === 'ignore') {
      const u = new URL(back, 'http://x');
      u.searchParams.set('undo', `all@${Date.parse(now)}`);
      back = u.pathname + u.search;
    }
    return redirectTo(back);
  }
  if (!ids.length) return redirectTo(back);

  if (kind === 'inbox' && (action === 'confirm' || action === 'ignore' || action === 'restore')) {
    // 收件匣全選：依前綴拆回三表，各下一次 update（同樣綁 group_id ∈ 本 org）
    const byKind = new Map<string, string[]>();
    for (const raw of ids) {
      const [k, id] = raw.split(':');
      if (Object.hasOwn(TABLE, k) && id) byKind.set(k, [...(byKind.get(k) ?? []), id]);
    }
    for (const [k, list] of byKind) {
      // restore＝收件匣「已忽略…」橫幅的「復原」：只動目前還是 ignored 的，不會把別處完成的待辦翻回進行中
      const patch =
        action === 'confirm'
          ? { needs_confirmation: false }
          : action === 'ignore'
            ? { status: 'ignored' }
            : { status: k === 'task' ? 'open' : 'active' };
      let q = db.from(TABLE[k]).update({ ...patch, updated_at: now }).in('id', list).in('group_id', access.groupIds);
      if (action === 'restore') q = q.eq('status', 'ignored');
      const { error } = await q;
      if (error) console.error('收件匣批次操作失敗', k, action, error);
    }
    // 「選取全部 N 筆」忽略的復原（all@<毫秒>）：同一刻被忽略、現在還是 ignored、仍待確認的一起翻回。
    // 那之後被改過的（updated_at 變了）就不動，同 kind:id 那條只動還是 ignored 的
    if (action === 'restore') {
      for (const raw of ids) {
        if (!/^all@\d{10,15}$/.test(raw)) continue;
        const at = new Date(Number(raw.slice(4))).toISOString();
        for (const [k, t] of Object.entries(TABLE)) {
          const { error } = await db
            .from(t)
            .update({ status: k === 'task' ? 'open' : 'active', updated_at: now })
            .in('group_id', access.groupIds)
            .eq('updated_at', at)
            .eq('status', 'ignored')
            .eq('needs_confirmation', true);
          if (error) console.error('收件匣全部復原失敗', t, error);
        }
      }
    }
    // 批次忽略後回收件匣帶 ?undo=（kind:id 逗號串）：頁面據此顯示「已忽略 N 筆」＋「復原」。
    // 勾選的 id 只有伺服器拿得到（表單的 back 是渲染時就寫死的），所以由這裡補；「選取全部 N 筆」那條路不帶
    if (action === 'ignore') {
      const undo = [...byKind].flatMap(([k, list]) => list.map((id) => `${k}:${id}`));
      if (undo.length) {
        const u = new URL(back, 'http://x');
        u.searchParams.set('undo', undo.join(','));
        back = u.pathname + u.search;
      }
    }
  } else if (table) {
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
      // 以 id 操作的一律再綁 group_id ∈ 本 org
      const { error } = await db.from(table).update({ ...patch, updated_at: now }).in('id', ids).in('group_id', access.groupIds);
      if (error) console.error('批次操作失敗', kind, action, error);
    }
  } else if (kind === 'file') {
    // 刪除沒勾「刪了無法復原」：以前是靜默轉回原頁，看起來像按了沒反應（或以為刪掉了）。
    // 畫面上沒勾時按鈕本來就按不下去（globals.css 的 data-ack），走到這裡的是鍵盤送出或舊瀏覽器——講清楚沒刪
    if (action === 'delete' && form.get('confirm_delete') !== 'on') {
      return NextResponse.json({ error: '要先勾「刪了無法復原」才會刪除，這次沒有刪任何檔案' }, { status: 400 });
    }
    // media_assets 沒有 group_id，經 messages 反查：先把 ids 縮到本 org 的，再動手
    const { data: mine } = await db
      .from('media_assets')
      .select('id, storage_path, messages!inner(group_id)')
      .in('id', ids)
      .in('messages.group_id', access.groupIds);
    const okIds = (mine ?? []).map((r) => r.id);
    if (!okIds.length) return redirectTo(back);
    if (action === 'project') {
      const project = String(form.get('project') ?? '').trim().slice(0, 40);
      if (project) {
        const { error } = await db.from('media_assets').update({ project }).in('id', okIds);
        if (error) console.error('批次指定專案失敗', error); // migration 007 未跑時在此浮現
      }
    } else if (action === 'delete') {
      const paths = (mine ?? []).map((r) => r.storage_path);
      if (paths.length) await db.storage.from(MEDIA_BUCKET).remove(paths);
      const { error } = await db.from('media_assets').delete().in('id', okIds);
      if (error) console.error('批次刪除檔案失敗', error);
    }
  }
  return redirectTo(back);
}
