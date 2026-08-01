import { SelectAll } from './select-all';

// 批次操作列：一頁一張 <form id="batch">，各列的核取方塊用 form="batch" 掛上來（避免巢狀表單）
export interface BatchAction {
  action: string;
  label: string;
  danger?: boolean;
}

export function BatchBar({
  kind,
  back,
  actions,
  projects,
}: {
  kind: 'task' | 'event' | 'note' | 'file';
  back: string;
  actions: BatchAction[];
  projects?: string[]; // 檔案頁：指定專案的 datalist 候選
}) {
  return (
    <form
      id="batch"
      action="/api/batch"
      method="post"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="back" value={back} />
      <SelectAll />
      <span className="text-gray-300">|</span>
      {/* 「勾選後批次：」拿掉了——這列現在只在勾選後才浮出，語境自明（principles.md：別讓我想） */}
      {actions.map((a) => (
        <button
          key={a.action}
          name="action"
          value={a.action}
          className={`${a.danger ? 'btn-danger' : 'btn'} px-2 py-1 text-xs`}
        >
          {a.label}
        </button>
      ))}
      {kind === 'file' && projects && (
        <>
          <span className="text-gray-300">|</span>
          <input className="input w-36 py-1 text-xs" name="project" list="batch-projects" placeholder="專案名稱" />
          <datalist id="batch-projects">
            {projects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <button name="action" value="project" className="btn px-2 py-1 text-xs">
            指定專案
          </button>
        </>
      )}
      {kind === 'file' && (
        <>
          <span className="text-gray-300">|</span>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" name="confirm_delete" /> 確認
          </label>
          <button name="action" value="delete" className="btn-danger px-2 py-1 text-xs">
            刪除
          </button>
        </>
      )}
    </form>
  );
}

// 各列的批次核取方塊（form 屬性跨區掛到 #batch，不與列內既有表單巢狀）
export function BatchBox({ id }: { id: string }) {
  return <input type="checkbox" name="ids" value={id} form="batch" className="batch-box" aria-label="選取此項" />;
}
