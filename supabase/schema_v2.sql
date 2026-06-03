-- Kids & Fun CRM - Schema v2 Additions
-- הרץ אחרי schema.sql
-- מוסיף: registration_timeline, bot_sessions, שדה id_message בשיחות

-- =========================================
-- ציר זמן לרישומים — כל אירוע מתועד
-- =========================================
create table if not exists registration_timeline (
  id uuid primary key default uuid_generate_v4(),
  registration_id uuid references registrations(id) on delete cascade,
  parent_id uuid references parents(id) on delete cascade not null,
  event_type text not null check (event_type in (
    'status_change',    -- שינוי סטטוס
    'message_sent',     -- הודעה נשלחה
    'message_received', -- הודעה התקבלה
    'payment',          -- אירוע תשלום
    'task_created',     -- נוצרה משימה
    'task_resolved',    -- משימה טופלה
    'system_note',      -- הערה מערכתית
    'escalation'        -- הסלמה לנציג
  )),
  old_value text,       -- ערך לפני השינוי
  new_value text,       -- ערך אחרי השינוי
  description text not null,
  performed_by text default 'בוט' check (performed_by in ('בוט', 'נציג', 'מערכת', 'הורה')),
  metadata jsonb,       -- נתונים נוספים (intent, amount, כו')
  branch_id uuid references branches(id),
  created_at timestamptz default now()
);

create index if not exists idx_timeline_parent on registration_timeline(parent_id);
create index if not exists idx_timeline_registration on registration_timeline(registration_id);
create index if not exists idx_timeline_created on registration_timeline(created_at desc);

alter table registration_timeline enable row level security;
create policy "authenticated users only" on registration_timeline
  for all using (auth.role() = 'authenticated');

-- =========================================
-- סשן בוט — שמירת מצב שיחה ב-DB
-- =========================================
create table if not exists bot_sessions (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  parent_id uuid references parents(id),
  current_flow text,           -- register_child_name / camp_late_name / etc.
  collected_data jsonb default '{}',
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- session expires after 30 min of inactivity (cleanup by cron)
  expires_at timestamptz default (now() + interval '30 minutes'),
  unique (phone)               -- phone = primary key for session lookup
);

create index if not exists idx_bot_sessions_phone on bot_sessions(phone);

alter table bot_sessions enable row level security;
create policy "service role only" on bot_sessions
  for all using (auth.role() = 'service_role');

-- =========================================
-- שדה id_message להודעות — למניעת כפילויות
-- =========================================
alter table conversations add column if not exists id_message text unique;

-- =========================================
-- הוסף registered_at לרישומים
-- =========================================
alter table registrations add column if not exists registered_at timestamptz default now();

-- =========================================
-- לוג הודעות WhatsApp — מעקב מלא
-- =========================================
create table if not exists whatsapp_message_log (
  id uuid primary key default uuid_generate_v4(),
  id_message text unique not null,  -- מזהה ייחודי מ-WhatsApp API
  phone text not null,
  direction text not null check (direction in ('נכנס', 'יוצא')),
  message_text text not null,
  message_type text default 'text',
  status text default 'נשלח' check (status in ('נשלח', 'נמסר', 'נקרא', 'נכשל')),
  parent_id uuid references parents(id),
  session_id text,
  raw_payload jsonb,             -- ה-payload המלא מ-WhatsApp
  processed boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_wa_log_phone on whatsapp_message_log(phone);
create index if not exists idx_wa_log_id_message on whatsapp_message_log(id_message);
create index if not exists idx_wa_log_created on whatsapp_message_log(created_at desc);

alter table whatsapp_message_log enable row level security;
create policy "service role only" on whatsapp_message_log
  for all using (auth.role() = 'service_role');

-- =========================================
-- trigger: timeline entry on registration status change
-- =========================================
create or replace function on_registration_status_change()
returns trigger as $$
begin
  if OLD.status <> NEW.status then
    insert into registration_timeline (
      registration_id, parent_id, event_type,
      old_value, new_value, description, performed_by
    ) values (
      NEW.id,
      NEW.parent_id,
      'status_change',
      OLD.status,
      NEW.status,
      'שינוי סטטוס: ' || OLD.status || ' → ' || NEW.status,
      'מערכת'
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists registration_status_change_trigger on registrations;
create trigger registration_status_change_trigger
  after update on registrations
  for each row
  execute function on_registration_status_change();

-- =========================================
-- trigger: timeline entry on task creation
-- =========================================
create or replace function on_task_created()
returns trigger as $$
begin
  if NEW.parent_id is not null then
    insert into registration_timeline (
      parent_id, event_type,
      new_value, description, performed_by,
      metadata
    ) values (
      NEW.parent_id,
      'task_created',
      NEW.type,
      'נוצרה משימה: ' || NEW.description,
      'בוט',
      jsonb_build_object('task_id', NEW.id, 'priority', NEW.priority, 'type', NEW.type)
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists task_created_trigger on tasks;
create trigger task_created_trigger
  after insert on tasks
  for each row
  execute function on_task_created();

-- =========================================
-- view: parent full summary
-- =========================================
create or replace view parent_summary as
select
  p.id,
  p.name,
  p.phone,
  p.email,
  p.notes,
  p.created_at,
  -- ילדים
  (select jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name,
    'class_name', c.class_name, 'framework', c.framework
  )) from children c where c.parent_id = p.id) as children,
  -- סטטוס תשלום אחרון
  (select pay.status from payments pay
   where pay.parent_id = p.id
   order by pay.created_at desc limit 1) as latest_payment_status,
  -- סכום תשלום
  (select pay.amount from payments pay
   where pay.parent_id = p.id
   order by pay.created_at desc limit 1) as latest_payment_amount,
  -- רישום פעיל
  (select reg.status from registrations reg
   where reg.parent_id = p.id
   order by reg.created_at desc limit 1) as latest_registration_status,
  -- מספר שיחות
  (select count(*) from conversations cv where cv.parent_id = p.id) as conversation_count,
  -- פניות פתוחות
  (select count(*) from tasks t where t.parent_id = p.id and t.status != 'טופל') as open_tasks_count
from parents p;

comment on view parent_summary is 'תצוגה מרוכזת של מידע הורה לדשבורד';
