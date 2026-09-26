// 金額計算機（從 Snaptab AddView 搬來，報帳全功能移植）：鍵盤可以打 120+35×2，不用 eval。

export const PAD_KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', 'del', '0', '=', '+'];
export const OPS = ['÷', '×', '−', '+'];
export const isOp = (k: string) => OPS.includes(k);
const MAX_LEN = 18;

/** 算出運算式的值：先乘除後加減；除以 0 忽略該運算；結尾沒打完的運算子略過；四捨五入到小數 2 位 */
export function evaluate(expr: string): number {
  if (!expr) return 0;
  const s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const tokens = s.match(/(\d+(?:\.\d+)?)|[+\-*/]/g);
  if (!tokens) return 0;
  while (tokens.length && /[+\-*/]/.test(tokens[tokens.length - 1])) tokens.pop();
  if (!tokens.length) return 0;
  const acc: (number | string)[] = [Number(tokens[0])];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]);
    if (Number.isNaN(n)) break;
    const last = acc[acc.length - 1] as number;
    if (op === '*') acc[acc.length - 1] = last * n;
    else if (op === '/') acc[acc.length - 1] = n === 0 ? last : last / n;
    else acc.push(op, n);
  }
  let res = acc[0] as number;
  for (let i = 1; i < acc.length; i += 2) res = acc[i] === '+' ? res + (acc[i + 1] as number) : res - (acc[i + 1] as number);
  return Math.round(res * 100) / 100;
}

/** 按一個鍵之後的新運算式 */
export function tap(expr: string, k: string): string {
  if (k === 'del') return expr.slice(0, -1);
  if (k === '=') return expr ? String(evaluate(expr)) : '';
  if (isOp(k)) {
    if (!expr) return ''; // 不能用運算子開頭
    if (isOp(expr.slice(-1))) return expr.slice(0, -1) + k; // 連按運算子：換掉最後一個
    return expr.length >= MAX_LEN ? expr : expr + k;
  }
  if (expr.length >= MAX_LEN) return expr;
  const lastNum = expr.split(/[÷×−+]/).pop() ?? '';
  if (lastNum === '0') return expr.slice(0, -1) + k; // 單獨的前導 0 被取代
  return expr + k;
}
