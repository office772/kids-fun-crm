-- Kids & Fun CRM - Database Schema
-- הרץ את הקוד הזה ב-Supabase SQL Editor

-- =========================================
-- Extensions
-- =========================================
create extension if not exists "uuid-ossp";

-- =========================================
-- סניפים (גמיש לעתיד)
-- =========================================
create table if not exists branches (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  city text,
  phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

insert into branches (name, city) values ('ראשי', 'רמת גן') on conflict do nothing;

-- =========================================
-- הורים / לקוחות
-- =========================================
create table if not exists parents (
  id uuid primary key default uuid_generate_v4(),
  phone text unique not null,          -- מספר הטלפון מ-WhatsApp (עם קידומת 972)
  name text,
  email text,
  notes text,
  branch_id uuid references branches(id),
  is_archived boolean not null default false,  -- ארכיון: לקוחות קייטנה/חד-פעמי (לא נמחקים!)
  archive_reason text,                          -- 'קייטנה' | 'אחר'
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_parents_archived on parents(is_archived) where is_archived;

-- =========================================
-- ילדים (כל הורה יכול להיות עם מספר ילדים)
-- =========================================
create table if not exists children (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid references parents(id) on delete cascade not null,
  name text not null,
  birth_date date,
  class_name text,                     -- שם כיתה
  framework text check (framework in ('צהרון', 'קייטנה', 'שניהם')),
  allergies text,
  medical_notes text,
  branch_id uuid references branches(id),
  created_at timestamptz default now()
);

-- =========================================
-- רישומים
-- =========================================
create table if not exists registrations (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid references parents(id) on delete cascade not null,
  child_id uuid references children(id) on delete cascade,
  type text not null check (type in ('צהרון', 'קייטנה')),
  status text not null default 'ממתין לאישור'
    check (status in ('ממתין לאישור', 'מאושר', 'נדחה', 'רשימת המתנה', 'בוטל')),
  waiting_list_position integer,
  approved_at timestamptz,
  notes text,
  branch_id uuid references branches(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================
-- תשלומים (סטטוס בלבד — עיבוד ב-PayPlus)
-- =========================================
create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid references parents(id) on delete cascade not null,
  child_id uuid references children(id),
  amount numeric(10,2),
  currency text default 'ILS',
  status text not null default 'ממתין'
    check (status in ('שולם', 'ממתין', 'נכשל', 'חלקי', 'זיכוי')),
  due_date date,
  paid_at timestamptz,
  payplus_ref text,                    -- מזהה ב-PayPlus
  failure_reason text,                 -- סיבת כשל אם רלוונטי
  proactive_sent boolean default false, -- האם נשלחה הודעה יזומה
  last_checked timestamptz default now(),
  created_at timestamptz default now()
);

-- =========================================
-- שיחות / הודעות
-- =========================================
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid references parents(id) on delete cascade,
  phone text not null,                 -- אם ההורה עוד לא זוהה
  platform text default 'whatsapp' check (platform in ('whatsapp', 'simulator')),
  direction text not null check (direction in ('נכנס', 'יוצא')),
  message_text text not null,
  intent text,                         -- הכוונה שזוהתה
  handled_by text default 'בוט' check (handled_by in ('בוט', 'נציג')),
  session_id text,                     -- קיבוץ הודעות לשיחה אחת
  branch_id uuid references branches(id),
  created_at timestamptz default now()
);

-- =========================================
-- משימות לטיפול ידני
-- =========================================
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid references parents(id) on delete cascade,
  type text not null check (type in (
    'ביטול חריג', 'כשל תשלום', 'רישום מאוחר', 'שאלה כללית',
    'רשימת המתנה', 'תלונה', 'אחר'
  )),
  description text not null,
  status text not null default 'פתוח'
    check (status in ('פתוח', 'בטיפול', 'טופל')),
  priority text default 'רגיל' check (priority in ('דחוף', 'גבוה', 'רגיל')),
  assigned_to text,
  branch_id uuid references branches(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================
-- לוח שנה (ימי פתיחה / חגים / חופשות)
-- =========================================
create table if not exists calendar_events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  event_date date not null,
  event_type text check (event_type in ('חג', 'חופשה', 'יום עיון', 'אחר')),
  is_closed boolean default true,      -- האם הצהרון סגור ביום זה
  notes text,
  branch_id uuid references branches(id),
  created_at timestamptz default now()
);

-- =========================================
-- הגדרות מערכת
-- =========================================
create table if not exists settings (
  key text primary key,
  value text not null,
  description text
);

insert into settings (key, value, description) values
  ('business_hours_start', '8', 'שעת פתיחה לטיפול ידני'),
  ('business_hours_end', '17', 'שעת סגירה לטיפול ידני'),
  ('business_days', '0,1,2,3,4', 'ימי פעילות (0=ראשון, 6=שבת)'),
  ('bot_name', 'קידס ופאן', 'שם הבוט בשיחות'),
  ('max_waiting_list', '20', 'מספר מקסימלי ברשימת המתנה')
on conflict (key) do nothing;

-- =========================================
-- Row Level Security
-- =========================================
alter table parents enable row level security;
alter table children enable row level security;
alter table registrations enable row level security;
alter table payments enable row level security;
alter table conversations enable row level security;
alter table tasks enable row level security;
alter table calendar_events enable row level security;

-- מדיניות: רק משתמשים מאומתים רואים נתונים
create policy "authenticated users only" on parents
  for all using (auth.role() = 'authenticated');

create policy "authenticated users only" on children
  for all using (auth.role() = 'authenticated');

create policy "authenticated users only" on registrations
  for all using (auth.role() = 'authenticated');

create policy "authenticated users only" on payments
  for all using (auth.role() = 'authenticated');

create policy "authenticated users only" on conversations
  for all using (auth.role() = 'authenticated');

create policy "authenticated users only" on tasks
  for all using (auth.role() = 'authenticated');

create policy "authenticated users only" on calendar_events
  for all using (auth.role() = 'authenticated');

-- =========================================
-- Indexes לביצועים
-- =========================================
create index if not exists idx_parents_phone on parents(phone);
create index if not exists idx_conversations_parent on conversations(parent_id);
create index if not exists idx_conversations_created on conversations(created_at desc);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_payments_status on payments(status);
create index if not exists idx_registrations_status on registrations(status);
