#!/usr/bin/env python3
import openpyxl
import requests
import base64
from collections import Counter

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
    return data.get('result', [])[0].get('results', [])

def main():
    file_path = r'f:\fieldwatt\pallavi_files\Pallavi upload 14.10.2026.xlsx'
    wb = openpyxl.load_workbook(file_path, read_only=True)
    ws = wb['Sheet1']
    data = list(ws.iter_rows(values_only=True))[1:]
    wb.close()

    bps = [str(r[0]).strip().lstrip('0') for r in data if r[0]]
    print(f"Total BPs in file: {len(bps)}")

    all_props = []
    for i in range(0, len(bps), 80):
        batch = bps[i:i+80]
        p_holders = ','.join(['?']*len(batch))
        sql = f"""
          SELECT p.id as prop_id,
                 LTRIM(json_extract(p.raw_sap_data, '$."BP No."'), '0') as bp_no,
                 i.billing_month,
                 c.id as cycle_id,
                 asg.id as asg_id,
                 asg.agent_id,
                 asg.is_completed,
                 latest_r.id as reading_id,
                 latest_r.reading_value,
                 latest_r.status_code
          FROM properties p
          JOIN imports i ON p.import_id = i.id
          JOIN cycles c ON c.label = i.billing_month
          LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = c.id
          LEFT JOIN (
            SELECT id, assignment_id, reading_value, status_code,
                   ROW_NUMBER() OVER(PARTITION BY assignment_id ORDER BY CASE WHEN status_code = 'reading_taken' THEN 0 ELSE 1 END, submitted_at DESC) as rn
            FROM readings
          ) latest_r ON latest_r.assignment_id = asg.id AND latest_r.rn = 1
          WHERE LTRIM(json_extract(p.raw_sap_data, '$."BP No."'), '0') IN ({p_holders})
        """
        r = query_d1(sql, batch)
        all_props.extend(r)

    print(f"Total matching properties found in D1: {len(all_props)}")
    unique_matched_bps = set(p['bp_no'] for p in all_props)
    print(f"Unique matched BPs: {len(unique_matched_bps)} / {len(bps)}")
    unmatched_bps = set(bps) - unique_matched_bps
    print(f"Unmatched BPs count: {len(unmatched_bps)}")

    print("\nBilling Month Distribution:")
    print(Counter(p['billing_month'] for p in all_props))

    print("\nCurrent Reading Status in D1:")
    print(Counter(p['status_code'] if p['reading_id'] else 'no_reading' for p in all_props))

    print("\nAssignment Status:")
    print(f"Assignments exist: {sum(1 for p in all_props if p['asg_id'])}")
    print(f"Assignments missing: {sum(1 for p in all_props if not p['asg_id'])}")

    # Check how many of these properties are currently pending/uncompleted
    pending_props = [p for p in all_props if not p['reading_id'] or p['status_code'] != 'reading_taken']
    print(f"\nProperties currently pending / not reading_taken: {len(pending_props)}")

if __name__ == '__main__':
    main()
