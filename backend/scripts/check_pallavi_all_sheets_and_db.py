#!/usr/bin/env python3
import os
import openpyxl
import requests
import base64

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
    folder = r"f:\fieldwatt\pallavi_files"
    print("="*80)
    print("ANALYZING ALL FILES & SHEETS IN pallavi_files FOLDER")
    print("="*80)

    all_sheets_info = []

    for root, dirs, files in os.walk(folder):
        for f in sorted(files):
            if not f.endswith('.xlsx'): continue
            path = os.path.join(root, f)
            wb = openpyxl.load_workbook(path, data_only=True)
            for sname in wb.sheetnames:
                ws = wb[sname]
                rows = list(ws.iter_rows(values_only=True))
                if not rows:
                    all_sheets_info.append({'file': f, 'sheet': sname, 'rows': 0, 'headers': []})
                    continue
                headers = [str(c).strip() if c is not None else '' for c in rows[0]]
                data_rows = rows[1:]
                non_empty = [r for r in data_rows if any(c is not None and str(c).strip() != '' for c in r)]
                all_sheets_info.append({
                    'file': f,
                    'sheet': sname,
                    'total_rows': len(rows),
                    'data_rows': len(non_empty),
                    'headers': headers,
                    'sample': non_empty[0] if non_empty else None,
                    'rows_data': non_empty
                })
            wb.close()

    total_file_rows = 0
    print("\nSUMMARY OF ALL SHEETS FOUND:")
    for info in all_sheets_info:
        print(f"File: {info['file']:40s} | Sheet: {info['sheet']:15s} | Data Rows: {info['data_rows']:5d}")
        total_file_rows += info['data_rows']
    print(f"\nSum of ALL rows across ALL sheets (including PMCKOD30): {total_file_rows}")

    # Check PMCKOD30.xlsx details
    pmckod = [i for i in all_sheets_info if 'PMCKOD30' in i['file']]
    if pmckod:
        info = pmckod[0]
        h = info['headers']
        agent_idx = h.index('Agent Name') if 'Agent Name' in h else None
        mr_idx = h.index('Current MR') if 'Current MR' in h else None
        note_idx = h.index('MR Note') if 'MR Note' in h else None
        
        pallavi_pmc_rows = []
        for r in info['rows_data']:
            agent = str(r[agent_idx]).strip() if agent_idx is not None and r[agent_idx] is not None else ''
            if 'pallavi' in agent.lower():
                pallavi_pmc_rows.append(r)
        
        print("\nPMCKOD30.xlsx (Master/Export of Kothrud June 2026):")
        print(f"  Total Data Rows: {info['data_rows']}")
        print(f"  Rows Assigned to Pallavi: {len(pallavi_pmc_rows)}")
        with_mr = sum(1 for r in pallavi_pmc_rows if r[mr_idx] is not None and str(r[mr_idx]).strip() not in ('', 'None'))
        print(f"  Pallavi Rows with Reading in PMCKOD30: {with_mr}")
        print(f"  Pallavi Rows without Reading in PMCKOD30: {len(pallavi_pmc_rows) - with_mr}")

    # Check all upload sheets (excluding PMCKOD30)
    upload_sheets = [i for i in all_sheets_info if 'PMCKOD30' not in i['file']]
    print("\n" + "="*80)
    print("AUDITING UPLOAD SHEETS (Pallavi Readings Uploads):")
    print("="*80)

    # Check each upload sheet's BPs against D1
    for info in upload_sheets:
        h = info['headers']
        bp_idx = None
        mr_idx = None
        img_idx = None
        for idx, col in enumerate(h):
            cl = col.lower()
            if 'bp' in cl: bp_idx = idx
            if 'reading' in cl or '12.10.2026' in cl: mr_idx = idx
            if 'image' in cl or 'photo' in cl: img_idx = idx

        bps = []
        with_mr = 0
        with_img = 0
        for r in info['rows_data']:
            bp = str(r[bp_idx]).strip().lstrip('0') if bp_idx is not None and bp_idx < len(r) and r[bp_idx] is not None else ''
            if bp and bp != 'None':
                bps.append(bp)
            if mr_idx is not None and mr_idx < len(r) and r[mr_idx] is not None and str(r[mr_idx]).strip() not in ('', 'None'):
                with_mr += 1
            if img_idx is not None and img_idx < len(r) and r[img_idx] is not None and str(r[img_idx]).strip() not in ('', 'None'):
                with_img += 1

        unique_bps = set(bps)
        print(f"\nSheet [{info['file']} -> {info['sheet']}]:")
        print(f"  Rows: {info['data_rows']} | Unique BPs: {len(unique_bps)} | Rows with MR: {with_mr} | Rows with Image: {with_img}")

        # Check how many exist in D1 properties and have readings in D1
        sample_bps = list(unique_bps)[:100]
        if sample_bps:
            placeholders = ','.join(['?']*len(sample_bps))
            res = query_d1(f"""
              SELECT p.id,
                     LTRIM(json_extract(p.raw_sap_data, '$."BP No."'), '0') as bp_no,
                     latest_r.reading_value,
                     latest_r.status_code
              FROM properties p
              LEFT JOIN assignments asg ON asg.property_id = p.id
              LEFT JOIN (
                SELECT assignment_id, reading_value, status_code,
                       ROW_NUMBER() OVER(PARTITION BY assignment_id ORDER BY CASE WHEN status_code = 'reading_taken' THEN 0 ELSE 1 END, submitted_at DESC) as rn
                FROM readings
              ) latest_r ON latest_r.assignment_id = asg.id AND latest_r.rn = 1
              WHERE LTRIM(json_extract(p.raw_sap_data, '$."BP No."'), '0') IN ({placeholders})
            """, sample_bps)
            
            props_found = set(r['bp_no'] for r in res)
            reads_found = sum(1 for r in res if r['status_code'] in ('reading_taken', 'door_locked'))
            print(f"  D1 Sample (100 BPs): {len(props_found)} exist in properties | {reads_found} have readings in D1")

if __name__ == '__main__':
    main()
