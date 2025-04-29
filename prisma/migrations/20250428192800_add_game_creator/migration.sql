/*
  Warnings:

  - Added the required column `creatorId` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- First, delete any games that don't have players
DELETE FROM "Game" g
WHERE NOT EXISTS (
  SELECT 1 FROM "Player" p WHERE p."gameId" = g.id
);

-- Add the column as nullable
ALTER TABLE "Game" ADD COLUMN "creatorId" TEXT;

-- Update existing games to set the creator to the first player
UPDATE "Game" g
SET "creatorId" = (
  SELECT p.id
  FROM "Player" p
  WHERE p."gameId" = g.id
  ORDER BY p."seat"
  LIMIT 1
);

-- Now make the column required
ALTER TABLE "Game" ALTER COLUMN "creatorId" SET NOT NULL;

-- Add the foreign key constraint
ALTER TABLE "Game" ADD CONSTRAINT "Game_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
