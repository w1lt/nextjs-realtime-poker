-- Enable RLS on the tables (if not already enabled)
ALTER TABLE "public"."Game" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Player" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Action" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for all tables
-- Game table policies
CREATE POLICY "Anyone can view games" ON "public"."Game" FOR SELECT USING (true);
CREATE POLICY "Anyone can insert games" ON "public"."Game" FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update games" ON "public"."Game" FOR UPDATE USING (true) WITH CHECK (true);

-- Player table policies
CREATE POLICY "Anyone can view players" ON "public"."Player" FOR SELECT USING (true);
CREATE POLICY "Anyone can insert players" ON "public"."Player" FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update players" ON "public"."Player" FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete players" ON "public"."Player" FOR DELETE USING (true);

-- GameState table policies
CREATE POLICY "Anyone can view game states" ON "public"."GameState" FOR SELECT USING (true);
CREATE POLICY "Anyone can insert game states" ON "public"."GameState" FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update game states" ON "public"."GameState" FOR UPDATE USING (true) WITH CHECK (true);

-- Action table policies
CREATE POLICY "Anyone can view actions" ON "public"."Action" FOR SELECT USING (true);
CREATE POLICY "Anyone can insert actions" ON "public"."Action" FOR INSERT WITH CHECK (true);

-- Enable realtime for all tables
-- First reset the realtime publication
BEGIN;
  -- Drop the existing publication if it exists
  DROP PUBLICATION IF EXISTS supabase_realtime;
  
  -- Create a new empty publication
  CREATE PUBLICATION supabase_realtime;
COMMIT;

-- Create a function to add all tables in the public schema to the realtime publication
CREATE OR REPLACE FUNCTION public.execute_schema_tables(_schema text, _query text)
RETURNS text AS $$
DECLARE
  row record;
BEGIN
  FOR row IN SELECT tablename FROM pg_tables AS t WHERE t.schemaname = _schema
  LOOP
    -- run query
    EXECUTE format(_query, row.tablename);
  END LOOP;
  
  RETURN 'success';
END;
$$ LANGUAGE plpgsql;

-- Add all tables in the public schema to the realtime publication
SELECT public.execute_schema_tables('public', 'ALTER PUBLICATION supabase_realtime ADD TABLE %I;');

-- Enable realtime replication for all changes on these tables
COMMENT ON TABLE "public"."Game" IS E'@realtime for=*';
COMMENT ON TABLE "public"."Player" IS E'@realtime for=*';
COMMENT ON TABLE "public"."GameState" IS E'@realtime for=*';
COMMENT ON TABLE "public"."Action" IS E'@realtime for=*';

-- Create policy to allow authenticated users to receive broadcasts (required for realtime)
CREATE POLICY "Allow authenticated users to receive broadcasts" 
ON "realtime"."messages"
FOR SELECT
TO authenticated
USING (true); 