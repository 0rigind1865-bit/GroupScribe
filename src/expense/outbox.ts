// 離線暫存（Snaptab 全功能移植）：沒網路時記的帳先存在手機（localStorage），恢復網路自動補送。
// 照片以壓縮後的 dataURL 存（約 300KB）；localStorage 約 5MB，所以最多暫存 12 筆有照片的。
// client_id 讓伺服器認得「同一筆補送了兩次」只記一次。
export type Pending = { client_id: string; fields: Record<string, string>; photo?: string; at: number };

const KEY = 'gs-expense-outbox';
export const MAX_PENDING = 12;

export function readOutbox(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Pending[];
  } catch {
    return [];
  }
}

function write(list: Pending[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** 放進暫存；滿了或存不下（容量）回 false */
export function enqueue(p: Pending): boolean {
  const list = readOutbox();
  if (list.length >= MAX_PENDING) return false;
  try {
    write([...list, p]);
    return true;
  } catch {
    return false;
  }
}

/** 逐筆補送；send 回 true 才移除。回剩下幾筆 */
export async function flushOutbox(send: (p: Pending) => Promise<boolean>): Promise<number> {
  for (const p of readOutbox()) {
    if (!(await send(p).catch(() => false))) break; // 還是送不出去：保留順序，下次再試
    write(readOutbox().filter((x) => x.client_id !== p.client_id));
  }
  return readOutbox().length;
}
