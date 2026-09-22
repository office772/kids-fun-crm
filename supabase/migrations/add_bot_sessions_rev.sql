-- מיגרציה: add_bot_sessions_rev (astra R3, 22.9.2026)
-- מוסיפה עמודת גרסה (rev) ל-bot_sessions לבקרת-מקביליות אטומית:
-- loadSession עושה bump אטומי של rev (UPDATE...RETURNING), וכל כתיבה (save/clear)
-- מותנית ב-rev שנטען. שתי הודעות מקבילות → revים שונים → רק המאוחרת כותבת.
--
-- ⚠️ יש להחיל לפני פריסת ה-webhook המעודכן (הקוד קורא/כותב את העמודה). additive ובטוח.
-- הרצה דרך Supabase MCP apply_migration או ה-SQL editor.

alter table bot_sessions add column if not exists rev uuid;
