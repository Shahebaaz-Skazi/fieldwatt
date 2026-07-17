-- Add sub_society and wing_code to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sub_society VARCHAR(255);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS wing_code VARCHAR(100);

-- Create index on sub_society for fast filtering and grouping
CREATE INDEX IF NOT EXISTS idx_properties_sub_society ON properties(sub_society);
CREATE INDEX IF NOT EXISTS idx_properties_wing_code ON properties(wing_code);
