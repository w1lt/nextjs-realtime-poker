-- Enable RLS on the tables
ALTER TABLE "public"."Game" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Player" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GameState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Action" ENABLE ROW LEVEL SECURITY;

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."Game";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."Player";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."GameState";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."Action";

-- Set security definer functions to check if a user is in a game
CREATE OR REPLACE FUNCTION public.is_game_visible()
RETURNS BOOLEAN AS $$
  -- Public access for all games (anyone can view games)
  SELECT TRUE;
$$ LANGUAGE SQL SECURITY DEFINER;

-- RLS Policies for Game table
DROP POLICY IF EXISTS "Game are publicly viewable" ON "public"."Game";
CREATE POLICY "Game are publicly viewable" 
ON "public"."Game"
FOR SELECT
TO public
USING (
  public.is_game_visible()
);

DROP POLICY IF EXISTS "Game inserts are allowed" ON "public"."Game";
CREATE POLICY "Game inserts are allowed" 
ON "public"."Game"
FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Game updates are allowed" ON "public"."Game";
CREATE POLICY "Game updates are allowed" 
ON "public"."Game"
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- RLS Policies for Player table
DROP POLICY IF EXISTS "Players are viewable" ON "public"."Player";
CREATE POLICY "Players are viewable" 
ON "public"."Player"
FOR SELECT
TO public
USING (
  public.is_game_visible()
);

DROP POLICY IF EXISTS "Player inserts are allowed" ON "public"."Player";
CREATE POLICY "Player inserts are allowed" 
ON "public"."Player"
FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Player updates are allowed" ON "public"."Player";
CREATE POLICY "Player updates are allowed" 
ON "public"."Player"
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Player deletes are allowed" ON "public"."Player";
CREATE POLICY "Player deletes are allowed" 
ON "public"."Player"
FOR DELETE
TO public
USING (true);

-- RLS Policies for GameState table
DROP POLICY IF EXISTS "GameState is viewable" ON "public"."GameState";
CREATE POLICY "GameState is viewable" 
ON "public"."GameState"
FOR SELECT
TO public
USING (
  public.is_game_visible()
);

DROP POLICY IF EXISTS "GameState inserts are allowed" ON "public"."GameState";
CREATE POLICY "GameState inserts are allowed" 
ON "public"."GameState"
FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "GameState updates are allowed" ON "public"."GameState";
CREATE POLICY "GameState updates are allowed" 
ON "public"."GameState"
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- RLS Policies for Action table
DROP POLICY IF EXISTS "Actions are viewable" ON "public"."Action";
CREATE POLICY "Actions are viewable" 
ON "public"."Action"
FOR SELECT
TO public
USING (
  public.is_game_visible()
);

DROP POLICY IF EXISTS "Action inserts are allowed" ON "public"."Action";
CREATE POLICY "Action inserts are allowed" 
ON "public"."Action"
FOR INSERT
TO public
WITH CHECK (true);

-- Enable realtime replication for all changes
COMMENT ON TABLE "public"."Game" IS E'@realtime for=*';
COMMENT ON TABLE "public"."Player" IS E'@realtime for=*';
COMMENT ON TABLE "public"."GameState" IS E'@realtime for=*';
COMMENT ON TABLE "public"."Action" IS E'@realtime for=*'; 