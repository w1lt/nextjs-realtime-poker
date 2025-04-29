/*
  Warnings:

  - You are about to drop the column `currentTurn` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `dealerSeat` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `phase` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `potSize` on the `Game` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "phase" "GamePhase";

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "currentTurn",
DROP COLUMN "dealerSeat",
DROP COLUMN "phase",
DROP COLUMN "potSize";
