#!/usr/bin/env python3
"""
Non-destructive reconciliation script (ONLY UPDATE / INSERT, zero DELETE):
Syncs all cross-cycle readings and assignments for June 2026 (PMCKOD30) properties
from their accidental September 2026 cycle assignments onto their canonical June 2026
cycle assignments, so that June 2026 Excel exports and Bulk Assign see 100% of completed
readings (Pallavi's 1,108 readings, Omkar Jadhav's 230 readings, etc.).
Also backfills 3 missing photo_urls on September 2026 readings from June 2026 readings.
"""
import base64
import time
import uuid
import requests

CF_ACC = base64.b64decode('MmNjYTVlNWI3ZDQzYjg3MTVmYzA5MGNlNGY3MGY3MTU=').decode().strip()
CF_DB  = base64.b64decode('YzNjYWMwOWItOGVhMS00MTFjLTgzYmYtZDNmZTU0MzVjNDQ2').decode().strip()
CF_TOK = base64.b64decode('Y2Z1dF9FbGFRQXQwdFdHZHpYcVVib21sMXFabFUzSEhVNGpSS0lSOHlUTTNZYjIwNWY0NGI=').decode().strip()
URL    = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACC}/d1/database/{CF_DB}/query"

JUNE_CYCLE = 'b50b81c7-201f-4fcc-ada7-9d5d2c5790cf'
SEPT_CYCLE = '83b91bca-44fc-46b2-abf2-31390e94189e'

def query_d1(sql, params=None):
    if params is None:
        params = []
    for attempt in range(5):
        try:
            r = requests.post(
                URL,
                headers={'Authorization': f'Bearer {CF_TOK}', 'Content-Type': 'application/json'},
                json={'sql': sql, 'params': params},
                timeout=45
            )
            data = r.json()
            if not data.get('success'):
                raise Exception(f"D1 error: {data.get('errors')}")
            res = data.get('result', [])
            return res[0].get('results', []) if res else []
        except Exception as e:
            if attempt == 4:
                raise e
            time.sleep(1 + attempt)

def batch_d1(statements):
    for attempt in range(5):
        try:
            r = requests.post(
                URL,
                headers={'Authorization': f'Bearer {CF_TOK}', 'Content-Type': 'application/json'},
                json={'batch': statements},
                timeout=45
            )
            data = r.json()
            if not data.get('success'):
                raise Exception(f"D1 batch error: {data.get('errors')}")
            return data.get('result', [])
        except Exception as e:
            if attempt == 4:
                raise e
            time.sleep(1 + attempt)

def main():
    print("1. Fetching June 2026 properties with readings on September 2026 cycle assignments...")
    rows = query_d1("""
        SELECT 
          p.id as property_id,
          asg_june.id as june_asg_id,
          asg_june.agent_id as june_agent_id,
          asg_sep.id as sep_asg_id,
          asg_sep.agent_id as sep_agent_id,
          r_june.id as june_rd_id,
          r_june.status_code as june_status,
          r_june.photo_url as june_photo,
          r_sep.id as sep_rd_id,
          r_sep.reading_value as sep_val,
          r_sep.status_code as sep_status,
          r_sep.photo_url as sep_photo,
          r_sep.note as sep_note,
          r_sep.submitted_at as sep_submitted_at
        FROM properties p
        JOIN imports i ON p.import_id = i.id
        JOIN assignments asg_june ON asg_june.property_id = p.id AND asg_june.cycle_id = ?
        JOIN assignments asg_sep ON asg_sep.property_id = p.id AND asg_sep.cycle_id = ?
        JOIN readings r_sep ON r_sep.assignment_id = asg_sep.id
        LEFT JOIN readings r_june ON r_june.assignment_id = asg_june.id
        WHERE i.billing_month = 'June 2026'
    """, [JUNE_CYCLE, SEPT_CYCLE])

    print(f"Found {len(rows)} June 2026 rows with September cycle readings.")

    stmts = []
    inserted_rds = 0
    updated_rds = 0

    for idx, r in enumerate(rows):
        june_asg_id = r['june_asg_id']
        sep_agent_id = r['sep_agent_id'] or r['june_agent_id']

        # Ensure June assignment is marked completed and credited to the agent who completed it
        stmts.append({
            'sql': "UPDATE assignments SET agent_id = ?, is_completed = 1 WHERE id = ?",
            'params': [sep_agent_id, june_asg_id]
        })

        photo = r['sep_photo'] if r['sep_photo'] else r['june_photo']
        if r['june_rd_id']:
            # Update existing June reading (e.g. door_locked -> reading_taken)
            stmts.append({
                'sql': "UPDATE readings SET reading_value = ?, status_code = ?, photo_url = ?, note = ?, submitted_at = ? WHERE id = ?",
                'params': [r['sep_val'], r['sep_status'], photo, r['sep_note'], r['sep_submitted_at'], r['june_rd_id']]
            })
            updated_rds += 1
        else:
            # Insert new reading onto June assignment
            rd_id = f"rd_{uuid.uuid4()}"
            idemp_key = f"idemp_sync_{june_asg_id}_{idx}"
            stmts.append({
                'sql': "INSERT INTO readings (id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note, submitted_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                'params': [rd_id, june_asg_id, idemp_key, r['sep_val'], r['sep_status'], photo, r['sep_note'], r['sep_submitted_at']]
            })
            inserted_rds += 1

    print(f"Prepared {len(stmts)} statements ({inserted_rds} inserts, {updated_rds} updates).")

    CHUNK = 60
    total_chunks = (len(stmts) + CHUNK - 1) // CHUNK
    for c_idx in range(total_chunks):
        chunk = stmts[c_idx * CHUNK : (c_idx + 1) * CHUNK]
        batch_d1(chunk)
        if (c_idx + 1) % 10 == 0 or (c_idx + 1) == total_chunks:
            print(f"  Executed chunk {c_idx + 1}/{total_chunks}")

    print("\n2. Also syncing agent_id on pending June 2026 properties reassigned to Pallavi...")
    query_d1("""
        UPDATE assignments
        SET agent_id = '33bdb6c4-a678-4cdf-912d-c3112c3db201'
        WHERE cycle_id = ?
          AND property_id IN (
            SELECT p.id
            FROM properties p
            JOIN imports i ON p.import_id = i.id
            JOIN assignments asg_sep ON asg_sep.property_id = p.id AND asg_sep.cycle_id = ?
            WHERE i.billing_month = 'June 2026'
              AND asg_sep.agent_id = '33bdb6c4-a678-4cdf-912d-c3112c3db201'
          )
    """, [JUNE_CYCLE, SEPT_CYCLE])
    print("  Synced pending Pallavi assignments on June 2026 cycle.")

    print("\n3. Backfilling any missing photo_url on September 2026 readings from June 2026 cycle...")
    missing_photos = query_d1("""
        SELECT r_sep.id as sep_rd_id, r_june.photo_url as june_photo
        FROM properties p
        JOIN imports i ON p.import_id = i.id
        JOIN assignments asg_june ON asg_june.property_id = p.id AND asg_june.cycle_id = ?
        JOIN readings r_june ON r_june.assignment_id = asg_june.id
        JOIN assignments asg_sep ON asg_sep.property_id = p.id AND asg_sep.cycle_id = ?
        JOIN readings r_sep ON r_sep.assignment_id = asg_sep.id
        WHERE i.billing_month = 'September 2026'
          AND (r_sep.photo_url IS NULL OR r_sep.photo_url = '')
          AND r_june.photo_url IS NOT NULL AND r_june.photo_url != ''
    """, [JUNE_CYCLE, SEPT_CYCLE])
    for mp in missing_photos:
        query_d1("UPDATE readings SET photo_url = ? WHERE id = ?", [mp['june_photo'], mp['sep_rd_id']])
    print(f"  Backfilled {len(missing_photos)} missing photos on September 2026 readings.")

    print("\nDone!")

if __name__ == '__main__':
    main()
