-- on_conflict(payplus_transaction_uid) לא יכול להשתמש באינדקס חלקי (42P10) —
-- זה שבר את payplus-sync ואת ה-webhook של PayPlus (אף תשלום PayPlus לא נרשם מסוף יוני).
-- אינדקס ייחודי מלא: NULL-ים נחשבים שונים ב-Postgres, כך שהסמנטיקה זהה.
create unique index if not exists payments_payplus_tx_uidx on public.payments (payplus_transaction_uid);
drop index if exists public.payments_payplus_tx_unique;
drop index if exists public.idx_payments_payplus_tx;
