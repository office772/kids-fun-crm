#!/usr/bin/env python3
"""
יצירת רשומות תשלום מ-RecurringPaymentsList.csv עבור הורים שנמצאים ב-DB
אבל אין להם עדיין רשומת תשלום מ-PayPlus.
"""

import csv
import os
import re
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CSV_PATH = os.environ.get(
    "CSV_PATH",
    "/Users/einatganel/Documents/claude-projects/kids-fun-app/RecurringPaymentsList.csv"
)

def norm_phone(raw):
    if not raw:
        return None
    p = re.sub(r"[\s\-\.\(\)\+]", "", str(raw).strip())
    if p.startswith("972"):
        p = "0" + p[3:]
    if not p.startswith("0") and len(p) == 9:
        p = "0" + p
    if not re.match(r"^0\d{8,9}$", p):
        return None
    return p

def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Load CSV
    rows = []
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    print(f"CSV: {len(rows)} הוראות קבע")

    # Load all parents (phone → id)
    parents_res = sb.table("parents").select("id,phone").execute()
    phone_to_parent = {}
    for p in parents_res.data:
        n = norm_phone(p["phone"])
        if n:
            phone_to_parent[n] = p["id"]
    print(f"DB: {len(phone_to_parent)} הורים")

    # Load existing payplus payments (parent_id → list)
    pays_res = sb.table("payments").select("id,parent_id,source,payment_number").in_(
        "source", ["payplus_recurring", "payplus_webhook", "payplus"]
    ).execute()
    parents_with_payment = set(p["parent_id"] for p in pays_res.data)
    print(f"הורים עם תשלום PayPlus קיים: {len(parents_with_payment)}")

    stats = {"created": 0, "updated": 0, "no_parent": 0, "already_has_payment": 0,
             "no_payment_num": 0, "skipped_zero": 0}

    # Group rows by phone — take the row with the highest payment_number (most recent)
    from collections import defaultdict
    phone_rows = defaultdict(list)
    for row in rows:
        phone = norm_phone(row.get("טלפון הלקוח", ""))
        if phone:
            phone_rows[phone].append(row)

    processed_phones = set()

    for phone, phone_row_list in phone_rows.items():
        parent_id = phone_to_parent.get(phone)
        if not parent_id:
            stats["no_parent"] += len(phone_row_list)
            continue

        # Prefer active rows, then highest payment_number
        active_rows = [r for r in phone_row_list if r.get("סטטוס", "") == "פעיל"]
        source_rows = active_rows if active_rows else phone_row_list

        best_row = None
        best_pn = -1
        for r in source_rows:
            try:
                pn = int(r.get("מספר תשלומים", "0").strip() or "0")
            except ValueError:
                pn = 0
            if pn > best_pn:
                best_pn = pn
                best_row = r

        if not best_row:
            stats["skipped_zero"] += 1
            continue

        payment_num = best_pn
        status = best_row.get("סטטוס", "")
        is_active = (status == "פעיל")

        try:
            amount = float(best_row.get("סכום הוראה", "0").replace(",", "").strip() or "0")
        except ValueError:
            amount = 0

        date_str = best_row.get("תאריך העסקה", "").strip()
        name = best_row.get("שם לקוח", "")

        # אם כבר יש תשלום — רק עדכן payment_number אם לא הוגדר
        if parent_id in parents_with_payment:
            if payment_num > 0:
                # עדכן רק אם payment_number חסר
                pay_res = sb.table("payments").select("id,payment_number").eq("parent_id", parent_id).in_(
                    "source", ["payplus_recurring", "payplus_webhook", "payplus"]
                ).order("created_at", desc=True).limit(1).execute()
                if pay_res.data and pay_res.data[0].get("payment_number") is None:
                    sb.table("payments").update({"payment_number": payment_num}).eq("id", pay_res.data[0]["id"]).execute()
                    stats["updated"] += 1
                else:
                    stats["already_has_payment"] += 1
            else:
                stats["already_has_payment"] += 1
            continue

        # צור רשומת תשלום חדשה
        if payment_num == 0 and not is_active:
            stats["skipped_zero"] += 1
            continue

        payment_status = "שולם" if (is_active and payment_num > 0) else "ממתין"

        insert_data = {
            "parent_id": parent_id,
            "amount": amount if amount > 0 else None,
            "status": payment_status,
            "payment_type": "הוראת קבע",
            "source": "payplus_recurring",
            "payment_number": payment_num if payment_num > 0 else None,
        }
        # תאריך
        if date_str:
            try:
                parts = date_str.split("/")
                if len(parts) == 3:
                    d, m, y = parts
                    insert_data["paid_at"] = f"20{y}-{m.zfill(2)}-{d.zfill(2)}T00:00:00" if len(y) == 2 else f"{y}-{m.zfill(2)}-{d.zfill(2)}T00:00:00"
            except Exception:
                pass

        try:
            sb.table("payments").insert(insert_data).execute()
            stats["created"] += 1
            if stats["created"] % 50 == 0:
                print(f"  נוצרו {stats['created']} עד כה...")
        except Exception as e:
            print(f"  ❌ שגיאה עבור {name}: {e}")

    print("\n" + "=" * 50)
    print("✅ יצירת רשומות תשלום הסתיימה!")
    print(f"  נוצרו:               {stats['created']}")
    print(f"  עודכנו (payment_num): {stats['updated']}")
    print(f"  כבר יש תשלום:        {stats['already_has_payment']}")
    print(f"  ללא הורה ב-DB:       {stats['no_parent']}")
    print(f"  דולגו (0 תשלומים):  {stats['skipped_zero']}")

if __name__ == "__main__":
    main()
