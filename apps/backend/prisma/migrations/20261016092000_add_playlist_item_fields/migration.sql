-- AlterEnum
-- Add new PlaylistItemType values introduced after the initial migration.
ALTER TYPE "PlaylistItemType" ADD VALUE 'MESSAGE';
ALTER TYPE "PlaylistItemType" ADD VALUE 'RSS_FEED';
ALTER TYPE "PlaylistItemType" ADD VALUE 'FINANCIAL_QUOTES';
ALTER TYPE "PlaylistItemType" ADD VALUE 'SPORTS_SCORES';
ALTER TYPE "PlaylistItemType" ADD VALUE 'WATCHLIST';
ALTER TYPE "PlaylistItemType" ADD VALUE 'CUSTOM_CONTENT';
ALTER TYPE "PlaylistItemType" ADD VALUE 'GOOGLE_SHEETS';
ALTER TYPE "PlaylistItemType" ADD VALUE 'NEWSROOM';

-- AlterTable
ALTER TABLE "PlaylistItem" ADD COLUMN     "config" JSONB,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';
