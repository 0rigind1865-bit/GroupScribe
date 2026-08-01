-- 薪資引擎資料層（migration 014）：規則版本與月結快照
--
-- 版本化的理由（計畫定案）：規則改了不能影響已結算的歷史月份。
--   salary_rule_sets  ＝ append-only：改規則＝插新版本，舊版本永不修改
--   payroll_snapshots ＝ 月結時把「輸入＋規則＋逐日結果」整包凍結；
--                        歷史月份永遠讀快照不重算；要重算必須先明確解除結算（留操作痕跡）
--
-- 冪等，可重複執行。

create table if not exists salary_rule_sets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  version int not null,
  rules jsonb not null,               -- SalaryRules（src/attend/salary.ts）
  script text,                        -- 進階租戶自訂計算腳本；null = 只用結構化規則
  script_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text,                    -- line_user_id；平台擁有者為 null
  unique (org_id, version)
);

create table if not exists payroll_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  month date not null,                -- 該月 1 號
  rule_set_id uuid not null references salary_rule_sets(id),
  monthly_salary numeric not null,    -- 結算當下的月薪快照
  input jsonb not null,               -- 該月採計的打卡與假日輸入
  result jsonb not null,              -- computeMonth / computeMonthHybrid 完整輸出
  finalized_by text,
  finalized_at timestamptz not null default now(),
  unique (org_id, employee_id, month)
);

alter table salary_rule_sets enable row level security;
alter table payroll_snapshots enable row level security;
