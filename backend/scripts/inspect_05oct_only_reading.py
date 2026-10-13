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
    wb = openpyxl.load_workbook(r'f:\fieldwatt\pallavi_files\WhatsApp Unknown 2026-10-13 at 4.38.55 PM\Pallavi Upload 05.10.2026.xlsx', read_only=True)
    ws = wb['Only reading']
    rows = list(ws.iter_rows(values_only=True))[1:]
    wb.close()

    bps = [str(r[0]).strip().lstrip('0') for r in rows if r[0]]
    unique_bps = list(set(bps))
    print(f"Total rows in Only reading (05.10): {len(rows)}, Unique BPs: {len(unique_bps)}")

    res = []
    for i in range(0, len(unique_bps), 80):
        batch = unique_bps[i:i+80]
        p_holders = ','.join(['?']*len(batch))
        sql = f"""
          SELECT p.id as prop_id,
                 LTRIM(json_extract(p.raw_sap_data, '$."BP No."'), '0') as bp_no,
                 i.billing_month,
                 a.name as area_name,
                 latest_r.id as reading_id,
                 latest_r.status_code,
                 latest_r.reading_value
          FROM properties p
          JOIN imports i ON p.import_id = i.id
          JOIN areas a ON p.area_id = a.id
          LEFT JOIN assignments asg ON asg.property_id = p.id
          LEFT JOIN (
            SELECT id, assignment_id, status_code, reading_value,
                   ROW_NUMBER() OVER(PARTITION BY assignment_id ORDER BY CASE WHEN status_code = 'reading_taken' THEN 0 ELSE 1 END, submitted_at DESC) as rn
            FROM readings
          ) latest_r ON latest_r.assignment_id = asg.id AND latest_r.rn = 1
          WHERE LTRIM(json_extract(p.raw_sap_data, '$."BP No."'), '0') IN ({p_holders})
        """
        r = query_d1(sql, batch)
        res.extend(r)

    print(f"Total matching properties in D1: {len(res)}")
    cycle_counts = Counter(r['billing_month'] for r in res)
    area_counts = Counter(r['area_name'] for r in res)
    read_status = Counter(r['status_code'] if r['reading_id'] else 'no_reading' for r in res)
    print("Cycle distribution:", cycle_counts)
    print("Area distribution (top 5):", area_counts.most_common(5))
    print("Reading status in D1:", read_status)

if __name__ == '__main__':
    main()
