-- 考勤模組資料模型（migration 013）：employees / punch_locations / punch_records /
-- adjustment_requests / holidays
--
-- 取代舊 Attendance-System（GAS + Google Sheets）。兩個刻意的語意修正（對等的是規格不是 bug）：
--   1. punch_records 只存「有效卡」——補卡申請獨立在 adjustment_requests，核准才落地成卡；
--      舊系統把待審的卡直接寫進打卡表（audit=?），未審核的卡會混進工時計算。
--   2. holidays 表是日別類型判定的權威來源；舊系統的 isHoliday 從未被後端填值，
--      週末實際上都被算成平日。
--
-- 冪等，可重複執行。

-- 員工：org 內的人員實體（GroupScribe plan.md D 表懸置的「人物身分對應」在此補上）
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  line_user_id text not null,
  display_name text not null,
  email text,
  picture_url text,
  dept text,
  monthly_salary numeric not null default 30000,   -- 舊系統預設值（2025 最低月薪）
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, line_user_id)
);
create index if not exists employees_line on employees (line_user_id);

-- 打卡地點（GPS + 半徑；伺服端 haversine 驗證，舊系統在 GAS 端驗、半徑寫死 100m）
create table if not exists punch_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- 打卡紀錄：只存有效卡
create table if not exists punch_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  type text not null check (type in ('in','out')),
  punched_at timestamptz not null,
  work_date date not null,                          -- Asia/Taipei 日界，寫入時計算；月查詢與日分組的唯一鍵
  lat double precision,
  lng double precision,
  location_id uuid references punch_locations(id),
  location_name text,                               -- 快照：地點改名/刪除不影響歷史
  source text not null default 'gps' check (source in ('gps','adjustment')), -- 'line_group' 留為擴充點
  note text,
  created_at timestamptz not null default now()
);
create index if not exists punch_org_emp_date on punch_records (org_id, employee_id, work_date);

-- 補卡申請與審核流
create table if not exists adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  type text not null check (type in ('in','out')),
  requested_at timestamptz not null,                -- 要補的打卡時間
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by text,                                 -- 審核者 line_user_id（平台擁有者為 null）
  reviewed_at timestamptz,
  punch_record_id uuid references punch_records(id),-- 核准後生成的卡
  created_at timestamptz not null default now()
);
create index if not exists adjust_org_status on adjustment_requests (org_id, status);

-- 假日表：國定假日 + 補班日覆寫（day type 判定的權威來源）
create table if not exists holidays (
  org_id uuid not null references orgs(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('national','workday_override')), -- workday_override = 補班日（強制平日）
  name text,
  primary key (org_id, day)
);

-- 比照既有慣例：開 RLS 不建 policy，anon key 完全碰不到（全走伺服端 service role）
alter table employees enable row level security;
alter table punch_locations enable row level security;
alter table punch_records enable row level security;
alter table adjustment_requests enable row level security;
alter table holidays enable row level security;
