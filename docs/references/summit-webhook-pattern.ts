// ─── Summit Webhook Pattern — Reference Implementation ───────────────────────
// מקור: אפליקציית Pantarei (Base44)
// עיקרון: webhook מגיע → חפש לפי email → phone → שם → צור אם לא קיים
// אותו עיקרון מיושם ב: api/webhooks/payplus + api/webhooks/greeninvoice
// ─────────────────────────────────────────────────────────────────────────────

// ── חלק 1: Webhook Handler (Summit → Base44) ─────────────────────────────────
// Deno.serve(async (req) => {
//   const base44 = createClientFromRequest(req);
//   const payload = await req.json();
//   const properties = payload.Properties || {};
//
//   const customerName  = properties.Property_2?.[0]?.Name || null;
//   const customerEmail = properties.Property_6?.[0] || null;
//   const customerPhone = properties.Property_7?.[0] || 'לא זמין';
//   const courseName    = properties.Property_3?.[0]?.Name || null;
//
//   // חיפוש רב-שלבי (Multi-step lookup)
//   let existingStudent = null;
//   if (customerEmail) {
//     const byEmail = await base44.entities.Student.filter({ email: customerEmail });
//     if (byEmail?.[0]) existingStudent = byEmail[0];
//   }
//   if (!existingStudent && customerPhone !== 'לא זמין') {
//     const byPhone = await base44.entities.Student.filter({ phone: customerPhone });
//     if (byPhone?.[0]) existingStudent = byPhone[0];
//   }
//   if (!existingStudent) {
//     const byName = await base44.entities.Student.filter({ full_name: customerName });
//     if (byName?.[0]) existingStudent = byName[0];
//   }
//
//   // צור אם לא קיים (Create if not found)
//   if (existingStudent) {
//     student = await base44.entities.Student.update(existingStudent.id, studentData);
//   } else {
//     student = await base44.entities.Student.create({ ...studentData, lead_source: 'Summit' });
//   }
// });

// ── חלק 2: Pull Data from Summit API ─────────────────────────────────────────
// const listRes = await fetch("https://api.sumit.co.il/crm/data/listentities/", {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     Credentials: { CompanyID: COMPANY_ID, APIKey: SUMIT_TOKEN },
//     Folder: FOLDER_ID,
//     PageSize: 10, PageNumber: 1
//   })
// });
// const entities = listData?.Data?.Entities || [];
// for (const entity of entities) {
//   // getentity → שם, טלפון, אימייל
// }

// ── המקבילה שלנו ─────────────────────────────────────────────────────────────
// Summit API      → PayPlus API (restapi.payplus.co.il) + GreenInvoice API
// Student entity  → parents table (Supabase)
// Course entity   → registrations table (Supabase)
// Webhook handler → /api/webhooks/payplus + /api/webhooks/greeninvoice
// Pull data       → /api/sync/payplus + /api/sync/greeninvoice
