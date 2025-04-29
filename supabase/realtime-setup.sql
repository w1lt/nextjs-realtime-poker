-- 1. Enable RLS on the tables (if not already enabled)
ALTER TABLE "public"."Game" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Player" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Action" ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS policies for all tables
-- Game table policies
DROP POLICY IF EXISTS "Anyone can view games" ON "public"."Game";
CREATE POLICY "Anyone can view games" ON "public"."Game" FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert games" ON "public"."Game";
CREATE POLICY "Anyone can insert games" ON "public"."Game" FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update games" ON "public"."Game";
CREATE POLICY "Anyone can update games" ON "public"."Game" FOR UPDATE USING (true) WITH CHECK (true);

-- Player table policies
DROP POLICY IF EXISTS "Anyone can view players" ON "public"."Player";
CREATE POLICY "Anyone can view players" ON "public"."Player" FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert players" ON "public"."Player";
CREATE POLICY "Anyone can insert players" ON "public"."Player" FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update players" ON "public"."Player";
CREATE POLICY "Anyone can update players" ON "public"."Player" FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete players" ON "public"."Player";
CREATE POLICY "Anyone can delete players" ON "public"."Player" FOR DELETE USING (true);

-- GameState table policies
DROP POLICY IF EXISTS "Anyone can view game states" ON "public"."GameState";
CREATE POLICY "Anyone can view game states" ON "public"."GameState" FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert game states" ON "public"."GameState";
CREATE POLICY "Anyone can insert game states" ON "public"."GameState" FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update game states" ON "public"."GameState";
CREATE POLICY "Anyone can update game states" ON "public"."GameState" FOR UPDATE USING (true) WITH CHECK (true);

-- Action table policies
DROP POLICY IF EXISTS "Anyone can view actions" ON "public"."Action";
CREATE POLICY "Anyone can view actions" ON "public"."Action" FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert actions" ON "public"."Action";
CREATE POLICY "Anyone can insert actions" ON "public"."Action" FOR INSERT WITH CHECK (true);

-- 3. ESSENTIAL: Set replica identity to FULL for all tables to get old values during updates/deletes
ALTER TABLE "public"."Game" REPLICA IDENTITY FULL;
ALTER TABLE "public"."Player" REPLICA IDENTITY FULL;
ALTER TABLE "public"."GameState" REPLICA IDENTITY FULL;
ALTER TABLE "public"."Action" REPLICA IDENTITY FULL;

-- 4. Reset the realtime publication
BEGIN;
  -- Drop the existing publication if it exists
  DROP PUBLICATION IF EXISTS supabase_realtime;
  
  -- Create a new empty publication
  CREATE PUBLICATION supabase_realtime;
COMMIT;

-- 5. Add tables to the publication
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."Game";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."Player";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."GameState";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."Action";

-- 6. Enable realtime replication for all changes on these tables
COMMENT ON TABLE "public"."Game" IS E'@realtime for=*';
COMMENT ON TABLE "public"."Player" IS E'@realtime for=*';
COMMENT ON TABLE "public"."GameState" IS E'@realtime for=*';
COMMENT ON TABLE "public"."Action" IS E'@realtime for=*';

-- 7. Create policy to allow authenticated users to receive broadcasts (required for realtime)
DROP POLICY IF EXISTS "Allow authenticated users to receive broadcasts" ON "realtime"."messages";
CREATE POLICY "Allow authenticated users to receive broadcasts" 
ON "realtime"."messages"
FOR SELECT
TO authenticated
USING (true);

-- 8. Function for adding tables to publication (not needed as we add tables directly)
-- CREATE OR REPLACE FUNCTION public.execute_schema_tables(_schema text, _query text)
-- RETURNS text AS $$
-- DECLARE
--   row record;
-- BEGIN
--   FOR row IN SELECT tablename FROM pg_tables AS t WHERE t.schemaname = _schema
--   LOOP
--     -- run query
--     EXECUTE format(_query, row.tablename);
--   END LOOP;
--   
--   RETURN 'success';
-- END;
-- $$ LANGUAGE plpgsql;
-- SELECT public.execute_schema_tables('public', 'ALTER PUBLICATION supabase_realtime ADD TABLE %I;');

-- 9. Verify tables in publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'; 