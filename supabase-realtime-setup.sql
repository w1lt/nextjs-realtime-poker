-- Run this in your Supabase SQL Editor

begin;
  -- remove the supabase_realtime publication if it exists
  drop publication if exists supabase_realtime;
  
  -- re-create the supabase_realtime publication with no tables
  create publication supabase_realtime;
commit;

-- add your tables to the publication
alter publication supabase_realtime add table "Player";
alter publication supabase_realtime add table "Game";
alter publication supabase_realtime add table "GameState";

-- Check if the tables are properly added to the publication
select * from pg_publication_tables where pubname = 'supabase_realtime';

-- Make sure replica identity is set to full for your tables to get old values during updates/deletes
alter table "Player" replica identity full;
alter table "Game" replica identity full;
alter table "GameState" replica identity full; 