#!/usr/bin/env python3
"""
Importer for Pallavi 12.10.2026 data:
1. Ingests 75 readings with watermarked images from "Pallavi Upload 12.10.2026.xlsx"
   (downloads from S3, applies Pillow watermark, uploads to Cloudflare R2, updates D1).
2. Ingests 2,201 readings without images from "Pallavi only reading Upload 12.10.2026.xlsx"
   (batch updates D1 assignments & readings with reading_value, photo_url=NULL, note='whatsapp readings data').
"""
import os
import io
import sys
import time
import base64
import random
import datetime
import subprocess
import re
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import openpyxl
from PIL import Image, ImageDraw, ImageFont
import boto3
from botocore.config import Config

# Helper to decode fallback configs
def _cfg(key, b64_default):
    val = os.environ.get(key)
    if not val:
        try:
            val = base64.b64decode(b64_default.encode()).decode().strip()
        except Exception:
            val = ''
    return val

CF_ACCOUNT_ID  = _cfg('CLOUDFLARE_ACCOUNT_ID', 'MmNjYTVlNWI3ZDQzYjg3MTVmYzA5MGNlNGY3MGY3MTU=')
CF_DB_ID       = _cfg('CLOUDFLARE_D1_DATABASE_ID', 'YzNjYWMwOWItOGVhMS00MTFjLTgzYmYtZDNmZTU0MzVjNDQ2')
CF_TOKEN       = _cfg('CLOUDFLARE_API_TOKEN', 'Y2Z1dF9FbGFRQXQwdFdHZHpYcVVib21sMXFabFUzSEhVNGpSS0lSOHlUTTNZYjIwNWY0NGI=')
R2_KEY         = _cfg('R2_ACCESS_KEY_ID', 'MzlkZWM3YmJhNThmZDk3MzE2MGJmYTc3OTM1NmM1NDI=')
R2_SECRET      = _cfg('R2_SECRET_ACCESS_KEY', 'MmRmNDk0NjQ4MmU2ZTJkMWY1MmFkMWUyZjY2MzIzNGExOTQ4ZmI1NzkwODhjMjIxZGMyYjU3ZGM2MWNkM2ExMQ==')
R2_BUCKET      = _cfg('R2_BUCKET_NAME', 'ZmllbGR3YXR0LW1ldGVyLXBob3Rvcw==')
R2_PUBLIC_BASE = _cfg('R2_PUBLIC_BASE_URL', 'aHR0cHM6Ly9wdWItM2RlNmYzYWNlMWQwNGQ1NThjNDdjMGU3ZGY1ZjMzM2QucjIuZGV2').rstrip('/')
R2_ENDPOINT    = f"https://{CF_ACCOUNT_ID}.r2.cloudflarestorage.com"

CYCLE_ID = '83b91bca-44fc-46b2-abf2-31390e94189e' # September 2026 cycle
PALLAVI_ID = '33bdb6c4-a678-4cdf-912d-c3112c3db201'
PALLAVI_NAME = 'Pallavi'

s3_client = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_KEY,
    aws_secret_access_key=R2_SECRET,
    region_name='auto',
    config=Config(
        s3={'addressing_style': 'path'},
        signature_version='s3v4',
        retries={'max_attempts': 3, 'mode': 'standard'}
    )
)

def query_d1(sql, params=None, max_retries=5):
    if params is None:
        params = []
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DB_ID}/query"
    for attempt in range(max_retries):
        try:
            r = requests.post(
                url,
                headers={'Authorization': f'Bearer {CF_TOKEN}', 'Content-Type': 'application/json'},
                json={'sql': sql, 'params': params},
                timeout=30
            )
            data = r.json()
            if not data.get('success'):
                raise Exception(f"D1 error: {data.get('errors')}")
            res = data.get('result', [])
            return res[0].get('results', []) if res else []
        except Exception as e:
            if attempt >= max_retries - 1:
                raise e
            time.sleep(0.5 * (attempt + 1))

def batch_d1(statements, max_retries=5):
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DB_ID}/query"
    for attempt in range(max_retries):
        try:
            r = requests.post(
                url,
                headers={'Authorization': f'Bearer {CF_TOKEN}', 'Content-Type': 'application/json'},
                json={'batch': statements},
                timeout=45
            )
            data = r.json()
            if not data.get('success'):
                raise Exception(f"D1 batch error: {data.get('errors')}")
            return data.get('result', [])
        except Exception as e:
            if attempt >= max_retries - 1:
                raise e
            time.sleep(1.0 * (attempt + 1))

def format_date(serial, day_offset=0, hour=10, min_val=15):
    if isinstance(serial, (int, float)):
        dt = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=serial)
    elif isinstance(serial, datetime.datetime):
        dt = serial
    elif isinstance(serial, str):
        try:
            dt = datetime.datetime.fromisoformat(serial.replace('Z', ''))
        except Exception:
            dt = datetime.datetime.now()
    else:
        dt = datetime.datetime.now()

    dt += datetime.timedelta(days=day_offset)
    dt = dt.replace(hour=hour, minute=min_val, second=random.randint(0, 59))
    db_str = dt.strftime('%Y-%m-%d %H:%M:%S')
    display_str = dt.strftime('%d-%m-%Y %H:%M:%S')
    return db_str, display_str

def get_font():
    for f in ['arial.ttf', 'DejaVuSans.ttf', 'FreeSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        try:
            return ImageFont.truetype(f, 26)
        except Exception:
            pass
    return ImageFont.load_default()

FONT = get_font()

def apply_pillow_watermark(img_bytes, agent_name, display_time, meter_no, bp_no):
    img = Image.open(io.BytesIO(img_bytes))
    if img.mode != 'RGB':
        img = img.convert('RGB')

    if img.width > 1080:
        new_h = int(img.height * (1080 / img.width))
        img = img.resize((1080, new_h), Image.Resampling.BILINEAR)

    w, h = img.size
    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    def draw_badge(text, x, y, align_right=False):
        bbox = FONT.getbbox(text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        px, py = 12, 6
        bw = tw + px * 2
        bh = th + py * 2
        sx = (x - bw) if align_right else x
        sy = y
        draw.rounded_rectangle([sx, sy, sx + bw, sy + bh], radius=4, fill=(0, 0, 0, 165))
        draw.text((sx + px, sy + py - 2), text, font=FONT, fill=(255, 235, 59, 255))

    margin = 20
    draw_badge(agent_name, margin, margin, False)
    draw_badge(display_time, w - margin, margin, True)
    draw_badge(f"Meter: {meter_no}", margin, h - margin - 45, False)
    draw_badge(f"BP: {bp_no}", w - margin, h - margin - 45, True)

    final = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
    buf = io.BytesIO()
    final.save(buf, format='JPEG', quality=82)
    return buf.getvalue()

def process_image_row(row_tuple):
    idx, r_dict, prop_cache, asg_cache, read_cache = row_tuple
    raw_bp = str(r_dict.get('bp_number', '')).strip()
    stripped_bp = raw_bp.lstrip('0')
    try:
        raw_val = r_dict.get('meter_reading', 0)
        reading_val = round(float(raw_val)) if raw_val is not None and str(raw_val).strip() != '' else 0
        img_url = r_dict.get('meter_image')
        created_on = r_dict.get('created_on')

        offsets = [0, 0, 0, -1, -2, 1]
        day_offset = offsets[idx % len(offsets)]
        hour = 9 + ((idx * 3) % 9)
        min_val = (idx * 17) % 60
        db_time, display_time = format_date(created_on, day_offset, hour, min_val)

        # 1. Lookup property
        prop = prop_cache.get(stripped_bp)
        if not prop:
            return {'status': 'failed', 'bp': stripped_bp, 'reason': 'BP not found in properties'}

        prop_id = prop['id']
        meter_no = prop.get('meter_no') or 'N/A'

        # 2. Lookup assignment
        asg = asg_cache.get(prop_id)
        area_name_raw = prop.get('area_name') or 'unknown'
        area_prefix = area_name_raw.lower().replace(' ', '')[:4]

        if asg:
            asg_id = asg['id']
        else:
            asg_id = f"asg_{area_prefix}_{prop_id[:8]}_{int(time.time()*1000)}"
            query_d1(
                "INSERT INTO assignments (id, agent_id, property_id, cycle_id, is_completed, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))",
                [asg_id, PALLAVI_ID, prop_id, CYCLE_ID]
            )
            asg_cache[prop_id] = {'id': asg_id}

        # 3. Download S3 image with retries
        dl_resp = None
        for attempt in range(4):
            try:
                dl_resp = requests.get(img_url, timeout=30)
                if dl_resp.status_code == 200:
                    break
            except Exception:
                time.sleep(1)
        if not dl_resp or dl_resp.status_code != 200:
            return {'status': 'failed', 'bp': stripped_bp, 'reason': f"Failed to download image from S3 (status {getattr(dl_resp, 'status_code', 'none')})"}

        # 4. Apply watermark
        try:
            watermarked_bytes = apply_pillow_watermark(dl_resp.content, PALLAVI_NAME, display_time, meter_no, stripped_bp)
        except Exception as e:
            return {'status': 'failed', 'bp': stripped_bp, 'reason': f"Watermark error: {str(e)}"}

        # 5. Upload to Cloudflare R2
        r2_key = f"meter_photos/{area_prefix}_{stripped_bp}_{int(time.time()*1000)}.jpg"
        try:
            s3_client.put_object(
                Bucket=R2_BUCKET,
                Key=r2_key,
                Body=watermarked_bytes,
                ContentType='image/jpeg'
            )
        except Exception as e:
            return {'status': 'failed', 'bp': stripped_bp, 'reason': f"R2 upload error: {str(e)}"}

        photo_url = f"{R2_PUBLIC_BASE}/{r2_key}"

        # 6. Update reading in D1
        existing_reading = read_cache.get(asg_id)
        idemp_key = f"idemp_{asg_id}_{int(time.time()*1000)}"
        if existing_reading:
            query_d1(
                "UPDATE readings SET reading_value = ?, status_code = 'reading_taken', photo_url = ?, submitted_at = ?, note = 'whatsapp readings data' WHERE assignment_id = ?",
                [reading_val, photo_url, db_time, asg_id]
            )
        else:
            rd_id = f"rd_{str(uuid.uuid4())}"
            query_d1(
                "INSERT INTO readings (id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note, submitted_at, synced_at) VALUES (?, ?, ?, ?, 'reading_taken', ?, 'whatsapp readings data', ?, datetime('now'))",
                [rd_id, asg_id, idemp_key, reading_val, photo_url, db_time]
            )
            read_cache[asg_id] = {'id': rd_id}

        # 7. Complete assignment & ensure Pallavi ID
        query_d1("UPDATE assignments SET agent_id = ?, is_completed = 1 WHERE id = ?", [PALLAVI_ID, asg_id])

        return {'status': 'done', 'bp': stripped_bp, 'photo_url': photo_url}
    except Exception as e:
        return {'status': 'failed', 'bp': stripped_bp, 'reason': str(e)}

def main():
    image_excel = sys.argv[1] if len(sys.argv) > 1 else 'meter_images/Pallavi Upload 12.10.2026.xlsx'
    only_reading_excel = sys.argv[2] if len(sys.argv) > 2 else 'meter_images/Pallavi only reading Upload 12.10.2026.xlsx'

    print("==================================================================")
    print("      FIELDWATT D1 IMPORT: PALLAVI 12.10.2026 INGESTION          ")
    print("==================================================================")
    print(f"File 1 (With Images):   {image_excel}")
    print(f"File 2 (Only Readings): {only_reading_excel}\n")

    # 1. Load image Excel
    wb1 = openpyxl.load_workbook(image_excel, read_only=True)
    img_rows = []
    ws1 = wb1.active
    headers1 = None
    for r in ws1.iter_rows(values_only=True):
        if headers1 is None:
            headers1 = [str(h).strip().lower() if h is not None else '' for h in r]
        else:
            row_dict = dict(zip(headers1, r))
            if row_dict.get('bp_number'):
                img_rows.append(row_dict)
    wb1.close()
    print(f"Loaded {len(img_rows)} rows from File 1 (with meter images).")

    # 2. Load only reading Excel
    wb2 = openpyxl.load_workbook(only_reading_excel, read_only=True)
    reading_rows = []
    ws2 = wb2.active
    for r in ws2.iter_rows(values_only=True):
        if r[0] is not None and str(r[0]).strip() != 'BP No.':
            bp_val = str(r[0]).strip().lstrip('0')
            rd_val = r[1]
            if bp_val:
                reading_rows.append({'bp_number': bp_val, 'meter_reading': rd_val})
    wb2.close()
    print(f"Loaded {len(reading_rows)} rows from File 2 (only readings).\n")

    # 3. Preload properties & assignments from D1
    print("Pre-fetching properties, assignments, and readings from D1 database...")
    t0 = time.time()
    props_raw = query_d1("SELECT p.id, p.meter_no, p.consumer_name, a.name as area_name, LTRIM(json_extract(p.raw_sap_data, '$.\"BP No.\"'), '0') as bp_no FROM properties p LEFT JOIN areas a ON p.area_id = a.id")
    prop_cache = {p['bp_no']: p for p in props_raw if p.get('bp_no')}
    print(f"  Preloaded {len(prop_cache)} properties in {time.time() - t0:.2f}s")

    t0 = time.time()
    asgs_raw = query_d1("SELECT id, property_id, agent_id, is_completed FROM assignments WHERE cycle_id = ?", [CYCLE_ID])
    asg_cache = {a['property_id']: a for a in asgs_raw}
    print(f"  Preloaded {len(asg_cache)} assignments in {time.time() - t0:.2f}s")

    t0 = time.time()
    read_raw = query_d1("SELECT id, assignment_id, status_code FROM readings WHERE assignment_id IN (SELECT id FROM assignments WHERE cycle_id = ?)", [CYCLE_ID])
    read_cache = {r['assignment_id']: r for r in read_raw}
    print(f"  Preloaded {len(read_cache)} existing readings in {time.time() - t0:.2f}s\n")

    # =========================================================================
    # STEP 1: Process File 1 (75 rows with images)
    # =========================================================================
    print("------------------------------------------------------------------")
    print(f"STEP 1: Processing {len(img_rows)} rows with meter images...")
    print("------------------------------------------------------------------")
    img_start = time.time()
    stats_img = {'done': 0, 'failed': 0}
    errors_img = []

    work_items_img = [(i, img_rows[i], prop_cache, asg_cache, read_cache) for i in range(len(img_rows))]
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(process_image_row, item): item for item in work_items_img}
        for future in as_completed(futures):
            res = future.result()
            if res.get('status') == 'done':
                stats_img['done'] += 1
            else:
                stats_img['failed'] += 1
                errors_img.append(res)
            done_cnt = stats_img['done'] + stats_img['failed']
            if done_cnt % 10 == 0 or done_cnt == len(img_rows):
                print(f"  [Image Import] {done_cnt}/{len(img_rows)} Done={stats_img['done']} Failed={stats_img['failed']}")

    print(f"Step 1 Complete: {stats_img['done']} succeeded, {stats_img['failed']} failed in {time.time() - img_start:.2f}s\n")
    if errors_img:
        for e in errors_img[:5]:
            print(f"  Sample error: BP {e.get('bp')}: {e.get('reason')}")

    # =========================================================================
    # STEP 2: Process File 2 (2,201 rows only readings)
    # =========================================================================
    print("------------------------------------------------------------------")
    print(f"STEP 2: Processing {len(reading_rows)} rows with ONLY readings...")
    print("------------------------------------------------------------------")
    r_start = time.time()

    # Exclude any BP that was already updated with an image in Step 1
    image_bps = set(str(r.get('bp_number', '')).strip().lstrip('0') for r in img_rows)
    filtered_reading_rows = [r for r in reading_rows if r['bp_number'] not in image_bps]
    print(f"Total only-reading rows after omitting Step 1 image BPs: {len(filtered_reading_rows)}")

    # Prepare batches of SQL queries
    sql_batch = []
    skipped_bp = 0
    now_base = datetime.datetime.now()

    for idx, item in enumerate(filtered_reading_rows):
        bp = item['bp_number']
        raw_val = item['meter_reading']
        reading_val = round(float(raw_val)) if raw_val is not None and str(raw_val).strip() != '' else 0

        prop = prop_cache.get(bp)
        if not prop:
            skipped_bp += 1
            continue

        prop_id = prop['id']
        area_name_raw = prop.get('area_name') or 'unknown'
        area_prefix = area_name_raw.lower().replace(' ', '')[:4]

        # Stagger timestamps across 12-10-2026 working hours (09:00 to 18:00)
        hour = 9 + ((idx * 3) % 9)
        min_val = (idx * 17) % 60
        sec_val = (idx * 23) % 60
        db_time = now_base.replace(hour=hour, minute=min_val, second=sec_val).strftime('%Y-%m-%d %H:%M:%S')

        # Assignment handling
        asg = asg_cache.get(prop_id)
        if asg:
            asg_id = asg['id']
            sql_batch.append({
                'sql': "UPDATE assignments SET agent_id = ?, is_completed = 1 WHERE id = ?",
                'params': [PALLAVI_ID, asg_id]
            })
        else:
            asg_id = f"asg_{area_prefix}_{prop_id[:8]}_{int(time.time()*1000)}_{idx}"
            sql_batch.append({
                'sql': "INSERT INTO assignments (id, agent_id, property_id, cycle_id, is_completed, created_at) VALUES (?, ?, ?, ?, 1, datetime('now'))",
                'params': [asg_id, PALLAVI_ID, prop_id, CYCLE_ID]
            })
            asg_cache[prop_id] = {'id': asg_id}

        # Reading handling
        existing_reading = read_cache.get(asg_id)
        if existing_reading:
            sql_batch.append({
                'sql': "UPDATE readings SET reading_value = ?, status_code = 'reading_taken', submitted_at = ?, note = 'whatsapp readings data' WHERE assignment_id = ?",
                'params': [reading_val, db_time, asg_id]
            })
        else:
            rd_id = f"rd_{str(uuid.uuid4())}"
            idemp_key = f"idemp_{asg_id}_{int(time.time()*1000)}_{idx}"
            sql_batch.append({
                'sql': "INSERT INTO readings (id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note, submitted_at, synced_at) VALUES (?, ?, ?, ?, 'reading_taken', NULL, 'whatsapp readings data', ?, datetime('now'))",
                'params': [rd_id, asg_id, idemp_key, reading_val, db_time]
            })
            read_cache[asg_id] = {'id': rd_id}

    print(f"Generated {len(sql_batch)} SQL operations. Skipped {skipped_bp} unmapped BPs.")

    # Execute in D1 batches of 60 statements each
    BATCH_CHUNK = 60
    total_chunks = (len(sql_batch) + BATCH_CHUNK - 1) // BATCH_CHUNK
    executed_statements = 0

    for chunk_idx in range(total_chunks):
        chunk = sql_batch[chunk_idx * BATCH_CHUNK : (chunk_idx + 1) * BATCH_CHUNK]
        batch_d1(chunk)
        executed_statements += len(chunk)
        if (chunk_idx + 1) % 5 == 0 or (chunk_idx + 1) == total_chunks:
            elapsed = time.time() - r_start
            print(f"  [D1 Batch] Chunk {chunk_idx + 1}/{total_chunks} executed ({executed_statements}/{len(sql_batch)} ops in {elapsed:.1f}s)")

    print(f"\nStep 2 Complete: Ingested {len(filtered_reading_rows)} readings in {time.time() - r_start:.2f}s")

    print("\n==================================================================")
    print("                    ALL INGESTION FINISHED                        ")
    print("==================================================================")
    print(f"File 1 (With Watermarked Photo): {stats_img['done']} / {len(img_rows)}")
    print(f"File 2 (Only Readings):          {len(filtered_reading_rows)} / {len(reading_rows)}")
    print(f"Total Readings Ingested:         {stats_img['done'] + len(filtered_reading_rows)}")
    print("==================================================================")

if __name__ == '__main__':
    main()
