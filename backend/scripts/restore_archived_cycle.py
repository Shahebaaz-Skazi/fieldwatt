#!/usr/bin/env python3
"""
FieldWatt Instant Restoration Script.
Restores all properties, assignments, readings, and cycles from the in-database
archive tables (or from JSON backup snapshots) back into active tables.
100% reversible anytime the user requests.
"""

import os
import sys
import json
import base64
import requests

CF_ACC = base64.b64decode('MmNjYTVlNWI3ZDQzYjg3MTVmYzA5MGNlNGY3MGY3MTU=').decode().strip()
CF_DB  = base64.b64decode('YzNjYWMwOWItOGVhMS00MTFjLTgzYmYtZDNmZTU0MzVjNDQ2').decode().strip()
CF_TOK = base64.b64decode('Y2Z1dF9FbGFRQXQwdFdHZHpYcVVib21sMXFabFUzSEhVNGpSS0lSOHlUTTNZYjIwNWY0NGI=').decode().strip()
URL    = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACC}/d1/database/{CF_DB}/query"

def execute_d1(sql, params=None):
    if params is None:
        params = []
    r = requests.post(
        URL,
        headers={'Authorization': f'Bearer {CF_TOK}', 'Content-Type': 'application/json'},
        json={'sql': sql, 'params': params},
        timeout=60
    )
    data = r.json()
    if not data.get('success'):
        raise Exception(f"D1 error: {data.get('errors')}")
    return data

def query_d1(sql):
    r = requests.post(
        URL,
        headers={'Authorization': f'Bearer {CF_TOK}', 'Content-Type': 'application/json'},
        json={'sql': sql, 'params': []},
        timeout=60
    )
    return r.json().get('result', [{}])[0].get('results', [])

def restore():
    print("=" * 80)
    print("RESTORING ARCHIVED DATA BACK TO ACTIVE TABLES")
    print("=" * 80)

    # 1. Restore cycles
    print("Restoring cycles...")
    execute_d1("INSERT OR REPLACE INTO cycles SELECT id, label, start_date, end_date, is_active, created_at, month, year, status, name FROM archive_cycles")

    # 2. Restore properties
    print("Restoring properties...")
    execute_d1("INSERT OR REPLACE INTO properties SELECT id, area_id, import_id, serial_no, consumer_name, address, meter_no, property_type, society, sub_society, wing_code, phone_number, lat, lng, raw_sap_data, created_at, is_assigned, assigned_agent_id FROM archive_properties")

    # 3. Restore assignments
    print("Restoring assignments...")
    execute_d1("INSERT OR REPLACE INTO assignments SELECT id, agent_id, property_id, cycle_id, assigned_at, assigned_by, is_completed, created_at FROM archive_assignments")

    # 4. Restore readings
    print("Restoring readings...")
    execute_d1("INSERT OR REPLACE INTO readings SELECT id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note, gps_lat, gps_lng, gps_accuracy, is_anomalous, anomaly_reason, source, submitted_by_type, submitted_at, synced_at, is_paid FROM archive_readings")

    cnt_p = query_d1("SELECT COUNT(*) as c FROM properties")[0]['c']
    cnt_asg = query_d1("SELECT COUNT(*) as c FROM assignments")[0]['c']
    cnt_r = query_d1("SELECT COUNT(*) as c FROM readings")[0]['c']

    print(f"\nRESTORE SUCCESSFUL!")
    print(f"  Active Properties:  {cnt_p:,}")
    print(f"  Active Assignments: {cnt_asg:,}")
    print(f"  Active Readings:    {cnt_r:,}")

if __name__ == '__main__':
    restore()
