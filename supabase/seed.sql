-- Kids & Fun - נתוני Demo לבדיקה
-- הרץ אחרי schema.sql

-- קבלת ה-branch_id הראשי
do $$
declare
  branch_uuid uuid;
  parent1_id uuid;
  parent2_id uuid;
  parent3_id uuid;
  parent4_id uuid;
  parent5_id uuid;
  child1_id uuid;
  child2_id uuid;
  child3_id uuid;
  child4_id uuid;
  child5_id uuid;
begin
  select id into branch_uuid from branches limit 1;

  -- הורים
  insert into parents (id, phone, name, email, branch_id) values
    (uuid_generate_v4(), '972501234567', 'רונית כהן', 'ronit@example.com', branch_uuid)
    returning id into parent1_id;

  insert into parents (id, phone, name, email, branch_id) values
    (uuid_generate_v4(), '972521234567', 'אבי לוי', 'avi@example.com', branch_uuid)
    returning id into parent2_id;

  insert into parents (id, phone, name, email, branch_id) values
    (uuid_generate_v4(), '972531234567', 'מיכל גולן', 'michal@example.com', branch_uuid)
    returning id into parent3_id;

  insert into parents (id, phone, name, email, branch_id) values
    (uuid_generate_v4(), '972541234567', 'דני פרץ', 'dani@example.com', branch_uuid)
    returning id into parent4_id;

  insert into parents (id, phone, name, email, branch_id) values
    (uuid_generate_v4(), '972551234567', 'שרה אברהם', 'sara@example.com', branch_uuid)
    returning id into parent5_id;

  -- ילדים
  insert into children (id, parent_id, name, class_name, framework, branch_id) values
    (uuid_generate_v4(), parent1_id, 'נועה כהן', 'א1', 'צהרון', branch_uuid)
    returning id into child1_id;

  insert into children (id, parent_id, name, class_name, framework, branch_id) values
    (uuid_generate_v4(), parent2_id, 'יוסי לוי', 'ב2', 'צהרון', branch_uuid)
    returning id into child2_id;

  insert into children (id, parent_id, name, class_name, framework, branch_id) values
    (uuid_generate_v4(), parent3_id, 'תמר גולן', 'ג1', 'קייטנה', branch_uuid)
    returning id into child3_id;

  insert into children (id, parent_id, name, class_name, framework, branch_id) values
    (uuid_generate_v4(), parent4_id, 'אורי פרץ', 'א3', 'צהרון', branch_uuid)
    returning id into child4_id;

  insert into children (id, parent_id, name, class_name, framework, branch_id) values
    (uuid_generate_v4(), parent5_id, 'מיה אברהם', 'ב1', 'צהרון', branch_uuid)
    returning id into child5_id;

  -- רישומים
  insert into registrations (parent_id, child_id, type, status, branch_id) values
    (parent1_id, child1_id, 'צהרון', 'מאושר', branch_uuid),
    (parent2_id, child2_id, 'צהרון', 'מאושר', branch_uuid),
    (parent3_id, child3_id, 'קייטנה', 'ממתין לאישור', branch_uuid),
    (parent4_id, child4_id, 'צהרון', 'רשימת המתנה', branch_uuid),
    (parent5_id, child5_id, 'צהרון', 'מאושר', branch_uuid);

  -- תשלומים - כולל כשל לדוגמה
  insert into payments (parent_id, child_id, amount, status, due_date, branch_id) values
    (parent1_id, child1_id, 800, 'שולם', current_date - 5, branch_uuid),
    (parent2_id, child2_id, 800, 'ממתין', current_date + 10, branch_uuid),
    (parent3_id, child3_id, 1200, 'שולם', current_date - 2, branch_uuid),
    (parent4_id, child4_id, 800, 'נכשל', current_date - 3, branch_uuid),
    (parent5_id, child5_id, 800, 'נכשל', current_date - 1, branch_uuid);

  -- שיחות לדוגמה
  insert into conversations (parent_id, phone, direction, message_text, intent, handled_by, session_id) values
    (parent1_id, '972501234567', 'נכנס', 'שלום, אני רוצה לדעת מה שעות הצהרון?', 'שאלת_לוז', 'בוט', 'sess1'),
    (parent1_id, '972501234567', 'יוצא', 'שלום רונית! הצהרון פתוח ראשון-חמישי 13:00-18:00. יש לך שאלות נוספות? 😊', 'שאלת_לוז', 'בוט', 'sess1'),
    (parent4_id, '972541234567', 'נכנס', 'שלום, יש לי בעיה עם התשלום', 'כשל_תשלום', 'בוט', 'sess2'),
    (parent4_id, '972541234567', 'יוצא', 'היי דני! קיבלנו את פנייתך. ניצור קשר בהמשך היום לטיפול בנושא התשלום.', 'כשל_תשלום', 'בוט', 'sess2'),
    (parent5_id, '972551234567', 'יוצא', 'היי שרה, מה שלומך? הבנק ניסה לחייב את הכרטיס שלך אבל לא הצלחנו. האם החלפת כרטיס אולי?', 'כשל_תשלום_יזום', 'בוט', 'sess3'),
    (parent2_id, '972521234567', 'נכנס', 'מתי מגיש בקשת ביטול?', 'ביטול', 'בוט', 'sess4'),
    (parent2_id, '972521234567', 'יוצא', 'שלום אבי! לפי התקנון, ביטול עד ה-15 לחודש מזכה בזיכוי מלא לחודש הבא. ביטול אחרי ה-15 — זיכוי לחצי חודש הבא.', 'ביטול', 'בוט', 'sess4');

  -- משימות פתוחות
  insert into tasks (parent_id, type, description, status, priority, branch_id) values
    (parent4_id, 'כשל תשלום', 'כרטיס אשראי נכשל — יצירת קשר לעדכון פרטים', 'פתוח', 'דחוף', branch_uuid),
    (parent5_id, 'כשל תשלום', 'הוראת קבע נכשלה, נשלחה הודעה יזומה — ממתין לתגובה', 'בטיפול', 'דחוף', branch_uuid),
    (parent3_id, 'רישום מאוחר', 'בקשת רישום לקייטנה אחרי סגירת המועד — לבדוק מקום', 'פתוח', 'גבוה', branch_uuid);

  -- אירועי לוח שנה
  insert into calendar_events (title, event_date, event_type, is_closed, notes) values
    ('שבועות', '2026-06-02', 'חג', true, 'הצהרון סגור'),
    ('ט באב', '2026-08-03', 'חג', true, 'הצהרון סגור'),
    ('יום עיון צוות', '2026-06-15', 'יום עיון', true, 'הצהרון סגור — יום עיון שנתי'),
    ('ראש השנה', '2026-09-20', 'חג', true, 'ראש השנה תשפ"ז — סגור'),
    ('יום כיפור', '2026-09-29', 'חג', true, 'יום כיפור תשפ"ז — סגור');

end $$;
