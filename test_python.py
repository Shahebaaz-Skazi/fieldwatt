import openpyxl, time
from backend.scripts.fast_import_03oct import process_single_row, query_d1, CYCLE_ID
prop_cache = {}
props_raw = query_d1('SELECT p.id, p.meter_no, p.consumer_name, a.name as area_name, LTRIM(json_extract(p.raw_sap_data, \'$.\"BP No.\"\'), \'0\') as bp_no FROM properties p LEFT JOIN areas a ON p.area_id = a.id')
for p in props_raw:
    if p.get('bp_no'): prop_cache[p['bp_no']] = p
asgs_raw = query_d1('SELECT id, property_id, agent_id, is_completed FROM assignments WHERE cycle_id = ?', [CYCLE_ID])
asg_cache = {a['property_id']: a for a in asgs_raw}
read_raw = query_d1('SELECT id, assignment_id, status_code FROM readings WHERE assignment_id IN (SELECT id FROM assignments WHERE cycle_id = ?)', [CYCLE_ID])
read_cache = {r['assignment_id']: r for r in read_raw}

wb = openpyxl.load_workbook('meter_images/Upload reading 03.10.2026.xlsx', data_only=True, read_only=True)
ws = wb['Sheet1']
headers = None
rows = []
for r in ws.iter_rows(values_only=True):
    if headers is None:
        headers = [str(h).strip().lower() for h in r]
    else:
        row_dict = dict(zip(headers, r))
        bp = row_dict.get('bp_number') or row_dict.get('bp no.')
        mr = row_dict.get('meter_reading') or row_dict.get('current mr')
        img = row_dict.get('meter_image') or row_dict.get('meter photo url')
        if bp and img:
            rows.append({'bp_number': str(bp).lstrip('0'), 'meter_reading': mr, 'meter_image': img, 'created_on': row_dict.get('current meter reading date')})
            if len(rows) >= 5: break
wb.close()

for i, row in enumerate(rows):
    res = process_single_row((i, row, prop_cache, asg_cache, read_cache))
    print(res)
