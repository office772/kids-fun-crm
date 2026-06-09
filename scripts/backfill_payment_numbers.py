#!/usr/bin/env python3
"""
Backfill payment_number on existing PayPlus payments.
Reads RecurringPaymentsList.csv (exported from PayPlus dashboard),
matches by phone number → updates payments.payment_number.
"""

import csv
import os
import re
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CSV_PATH     = os.environ.get(
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
        reader = csv.DictReader(f)
        for row in reader:
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

    stats = {"updated": 0, "no_parent": 0, "no_payment": 0, "skipped_zero": 0}
    no_parent_names = []

    for row in rows:
        phone_raw     = row.get("טלפון הלקוח", "")
        name          = row.get("שם לקוח", "")
        payment_num   = row.get("מספר תשלומים", "").strip()
        status        = row.get("סטטוס", "")

        # Skip rows with no payment yet
        if not payment_num:
            stats["skipped_zero"] += 1
            continue
        try:
            pn = int(payment_num)
        except ValueError:
            stats["skipped_zero"] += 1
            continue
        if pn == 0:
            stats["skipped_zero"] += 1
            continue

        phone = norm_phone(phone_raw)
        parent_id = phone_to_parent.get(phone) if phone else None

        if not parent_id:
            stats["no_parent"] += 1
            no_parent_names.append(f"{name} ({phone_raw})")
            continue

        # Find payment for this parent from payplus sources
        pay_res = sb.table("payments") \
            .select("id, payment_number") \
            .eq("parent_id", parent_id) \
            .in_("source", ["payplus_recurring", "payplus_webhook", "payplus"]) \
            .limit(1).execute()

        if not pay_res.data:
            stats["no_payment"] += 1
            continue

        payment_id = pay_res.data[0]["id"]
        sb.table("payments").update({"payment_number": pn}).eq("id", payment_id).execute()
        stats["updated"] += 1

    print("\n" + "="*50)
    print("✅ עדכון payment_number הסתיים!")
    print(f"  עודכנו:          {stats['updated']}")
    print(f"  ללא הורה ב-DB:  {stats['no_parent']}")
    print(f"  ללא תשלום ב-DB: {stats['no_payment']}")
    print(f"  דולגו (0 תשלומים): {stats['skipped_zero']}")

    if no_parent_names:
        print(f"\n📋 הורים שלא נמצאו ב-DB ({len(no_parent_names)}):")
        for n in no_parent_names[:20]:
            print(f"  {n}")
        if len(no_parent_names) > 20:
            print(f"  ... ועוד {len(no_parent_names)-20}")

if __name__ == "__main__":
    main()
