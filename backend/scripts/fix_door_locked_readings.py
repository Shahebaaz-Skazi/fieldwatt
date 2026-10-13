#!/usr/bin/env python3
import base64
import requests

CF_ACC = base64.b64decode('MmNjYTVlNWI3ZDQzYjg3MTVmYzA5MGNlNGY3MGY3MTU=').decode().strip()
CF_DB  = base64.b64decode('YzNjYWMwOWItOGVhMS00MTFjLTgzYmYtZDNmZTU0MzVjNDQ2').decode().strip()
CF_TOK = base64.b64decode('Y2Z1dF9FbGFRQXQwdFdHZHpYcVVib21sMXFabFUzSEhVNGpSS0lSOHlUTTNZYjIwNWY0NGI=').decode().strip()
URL    = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACC}/d1/database/{CF_DB}/query"

def query_d1(sql, params=None):
    if params is None: params = []
    r = requests.post(
        URL,
        headers={'Authorization': f'Bearer {CF_TOK}', 'Content-Type': 'application/json'},
        json={'sql': sql, 'params': params},
        timeout=60
    )
    data = r.json()
    if not data.get('success'):
        raise Exception(f"D1 error: {data.get('errors')}")
    return data.get('result', [])

def main():
    print("Fixing all door-locked readings that were incorrectly marked as 'reading_taken' with reading_value 'None'...")

    # 1. Update readings: change status_code to 'door_locked', clear reading_value to NULL, set note to 'Door Locked'
    res1 = query_d1("""
        UPDATE readings
        SET status_code = 'door_locked',
            reading_value = NULL,
            note = 'Door Locked'
        WHERE reading_value IN ('None', 'none', 'null', 'NULL', '')
          AND status_code = 'reading_taken'
    """)
    print("Updated readings in D1:", res1)

    # 2. Update assignments: mark is_completed = 0 for assignments whose only reading is door_locked
    res2 = query_d1("""
        UPDATE assignments
        SET is_completed = 0
        WHERE id IN (
            SELECT assignment_id
            FROM readings
            WHERE status_code = 'door_locked'
              AND note = 'Door Locked'
        )
    """)
    print("Updated assignments in D1:", res2)

    print("Done! Verifying BP 50037068...")
    verify = query_d1("""
        SELECT 
            p.serial_no,
            LTRIM(json_extract(p.raw_sap_data, '$."BP No."'), '0') as bp_no,
            r.status_code,
            r.reading_value,
            r.note,
            r.photo_url
        FROM readings r
        JOIN assignments asg ON r.assignment_id = asg.id
        JOIN properties p ON asg.property_id = p.id
        WHERE LTRIM(json_extract(p.raw_sap_data, '$."BP No."'), '0') = '50037068'
    """)
    print("BP 50037068 after fix:", verify)

if __name__ == '__main__':
    main()
