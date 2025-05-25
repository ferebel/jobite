-- Add columns to store CV-related information
ALTER TABLE customers
ADD COLUMN cv_original_filename TEXT,
ADD COLUMN cv_storage_path TEXT,
ADD COLUMN cv_mime_type TEXT,
ADD COLUMN cv_last_uploaded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN cv_parsed_text TEXT;

-- RLS policies from schema.sql are assumed to still apply.
-- Specifically, the existing UPDATE policy:
-- CREATE POLICY "Allow work coach to update their own customers"
-- ON customers
-- FOR UPDATE
-- USING (auth.uid() = work_coach_id)
-- WITH CHECK (auth.uid() = work_coach_id);
-- This policy should cover the new columns as it's a row-level policy
-- and doesn't specify columns. If column-level permissions were desired,
-- the policy would need to be more specific. For now, this is fine.

COMMENT ON COLUMN customers.cv_original_filename IS 'The original filename of the uploaded CV.';
COMMENT ON COLUMN customers.cv_storage_path IS 'The path to the CV file in Supabase Storage.';
COMMENT ON COLUMN customers.cv_mime_type IS 'The MIME type of the uploaded CV file.';
COMMENT ON COLUMN customers.cv_last_uploaded_at IS 'Timestamp of when the CV was last uploaded.';
COMMENT ON COLUMN customers.cv_parsed_text IS 'The text content extracted from the CV after parsing.';
