-- DropForeignKey
ALTER TABLE "Game" DROP CONSTRAINT "Game_creatorId_fkey";

-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "creatorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
