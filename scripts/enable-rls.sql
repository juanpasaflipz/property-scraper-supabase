-- Script to enable RLS for production
-- Run this in Supabase SQL Editor

-- 1. Enable RLS on the properties table
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies (clean slate)
DROP POLICY IF EXISTS "Public read access" ON properties;
DROP POLICY IF EXISTS "Service role write access" ON properties;
DROP POLICY IF EXISTS "Authenticated read access" ON properties;

-- 3. Create read policy - anyone can read properties
CREATE POLICY "Public read access" 
ON properties 
FOR SELECT 
USING (true);  -- No restrictions on reading

-- 4. Create insert policy - only service role can insert
CREATE POLICY "Service role insert access" 
ON properties 
FOR INSERT 
WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
);

-- 5. Create update policy - only service role can update
CREATE POLICY "Service role update access" 
ON properties 
FOR UPDATE 
USING (
  auth.jwt() ->> 'role' = 'service_role'
);

-- 6. Create delete policy - only service role can delete
CREATE POLICY "Service role delete access" 
ON properties 
FOR DELETE 
USING (
  auth.jwt() ->> 'role' = 'service_role'
);

-- 7. Verify RLS is enabled
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE tablename = 'properties';

-- 8. Test the policies (optional)
-- This should work (reading):
SELECT COUNT(*) FROM properties;

-- This should fail unless using service role key:
-- INSERT INTO properties (title, price) VALUES ('Test', '1000');