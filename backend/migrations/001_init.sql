-- Enable pgcrypto extension for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Cycles (billing periods e.g. "June 2025")
CREATE TABLE IF NOT EXISTS cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(50) NOT NULL,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Areas (geographic zones)
CREATE TABLE IF NOT EXISTS areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  city VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Properties (individual meter locations)
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  serial_no VARCHAR(50) UNIQUE NOT NULL,
  consumer_name VARCHAR(200) NOT NULL,
  address TEXT NOT NULL,
  meter_no VARCHAR(100),
  property_type VARCHAR(20) CHECK (property_type IN ('flat','bungalow','raw_house')),
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admins
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents (field workers)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(200) UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  expo_push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assignments (which agent gets which properties in which cycle)
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES cycles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  UNIQUE(property_id, cycle_id)
);

-- Readings (the actual data collected)
CREATE TABLE IF NOT EXISTS readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  idempotency_key UUID UNIQUE NOT NULL,
  reading_value DECIMAL(12,2),
  status_code VARCHAR(30) NOT NULL CHECK (status_code IN (
    'reading_taken','door_locked','not_reachable',
    'access_denied','meter_not_found','meter_damaged',
    'revisit_needed','vacant_property'
  )),
  photo_url TEXT,
  note TEXT,
  gps_lat DECIMAL(10,8),
  gps_lng DECIMAL(11,8),
  gps_accuracy DECIMAL(8,2),
  is_anomalous BOOLEAN DEFAULT FALSE,
  anomaly_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance log
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  login_time TIMESTAMPTZ,
  last_active TIMESTAMPTZ,
  is_on_leave BOOLEAN DEFAULT FALSE,
  UNIQUE(agent_id, date)
);

-- Revisit scheduling
CREATE TABLE IF NOT EXISTS revisits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES cycles(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure duplicate area names (regardless of spaces or capitalization) are rejected
CREATE UNIQUE INDEX IF NOT EXISTS areas_name_nospace_key ON areas (UPPER(REPLACE(name, ' ', '')));
