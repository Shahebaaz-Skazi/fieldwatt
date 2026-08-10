ALTER TABLE readings 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS submitted_by_type TEXT DEFAULT 'agent';

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);

CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID,
  phone_number TEXT NOT NULL,
  consumer_name TEXT,
  token TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  cycle_id UUID
);
