-- Migration: Add raw_sap_data column to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS raw_sap_data JSONB;
