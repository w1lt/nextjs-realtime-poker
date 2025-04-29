/*
  Warnings:

  - The values [HANDOVER] on the enum `GamePhase` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "GamePhase_new" AS ENUM ('SETUP', 'PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN', 'GAMEOVER', 'HAND_OVER');
ALTER TABLE "GameState" ALTER COLUMN "phase" TYPE "GamePhase_new" USING ("phase"::text::"GamePhase_new");
ALTER TABLE "Action" ALTER COLUMN "phase" TYPE "GamePhase_new" USING ("phase"::text::"GamePhase_new");
ALTER TYPE "GamePhase" RENAME TO "GamePhase_old";
ALTER TYPE "GamePhase_new" RENAME TO "GamePhase";
DROP TYPE "GamePhase_old";
COMMIT;
