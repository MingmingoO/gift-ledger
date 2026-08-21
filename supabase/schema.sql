-- ============================================================
-- 礼金往来记账 · Supabase 数据库结构
-- 用法：在 Supabase 控制台 → SQL Editor 中粘贴本文件全部内容并执行
-- 作用：建表 + 开启行级安全(RLS)，保证每个登录用户只能看自己的数据
-- ============================================================

-- 主表：礼金往来记录
-- 注：gen_random_uuid() 在 Supabase 的 Postgres(13+) 中已内置，无需额外扩展
create table if not exists public.gift_records (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         not null references auth.users(id) on delete cascade,
  type        text         not null check (type in ('in', 'out')), -- in=收礼, out=送礼
  person      text         not null,                              -- 往来人
  event_type  text         not null default '其他',              -- 事件类型
  amount      numeric(12,2) not null check (amount >= 0),        -- 金额(元)
  record_date date         not null,                             -- 往来日期
  note        text         default '',                           -- 备注/回礼情况
  created_at  timestamptz  not null default now()
);

-- 索引：提升按用户/人/日期的查询速度
create index if not exists gift_records_user_idx   on public.gift_records(user_id);
create index if not exists gift_records_person_idx on public.gift_records(user_id, person);
create index if not exists gift_records_date_idx   on public.gift_records(user_id, record_date);

-- 开启行级安全：没有策略前，任何行都不可访问
alter table public.gift_records enable row level security;

-- 四条策略：仅允许操作属于自己的数据
-- 先删除旧策略（用 exists 避免首次报错），每条语句以分号结尾
drop policy if exists "own_records_select" on public.gift_records;
create policy "own_records_select" on public.gift_records
  for select using (auth.uid() = user_id);

drop policy if exists "own_records_insert" on public.gift_records;
create policy "own_records_insert" on public.gift_records
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_records_update" on public.gift_records;
create policy "own_records_update" on public.gift_records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_records_delete" on public.gift_records;
create policy "own_records_delete" on public.gift_records
  for delete using (auth.uid() = user_id);
