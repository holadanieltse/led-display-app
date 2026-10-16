-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ORG_OWNER', 'ORG_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "DisplayType" AS ENUM ('TICKER', 'DIGITAL', 'HTML_FEED');

-- CreateEnum
CREATE TYPE "DisplayStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ERROR');

-- CreateEnum
CREATE TYPE "PlaylistItemType" AS ENUM ('RSS', 'CUSTOM_TEXT', 'HTML', 'IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('ALWAYS', 'TIME_RANGE', 'DATE_RANGE', 'CUSTOM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Display" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "signId" TEXT,
    "firmwareVersion" TEXT,
    "tickerHeight" INTEGER,
    "type" "DisplayType" NOT NULL DEFAULT 'TICKER',
    "status" "DisplayStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "timezoneRegion" TEXT,
    "scrollSpeed" INTEGER NOT NULL DEFAULT 50,
    "brightness" INTEGER NOT NULL DEFAULT 50,
    "powerSaveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tickerOnTime" TEXT NOT NULL DEFAULT '07:30',
    "tickerOffTime" TEXT NOT NULL DEFAULT '22:00',
    "scheduledClearRepublish" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "isPendingInstall" BOOLEAN NOT NULL DEFAULT false,
    "clearCacheNext" BOOLEAN NOT NULL DEFAULT false,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Display_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" DECIMAL(10,2),
    "priceYearly" DECIMAL(10,2),

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "DisplaySubscription" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isPerpetual" BOOLEAN NOT NULL DEFAULT false,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DisplaySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Playlist',
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedBy" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistItem" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "itemType" "PlaylistItemType" NOT NULL,
    "content" TEXT,
    "mediaUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "scheduleType" "ScheduleType" NOT NULL DEFAULT 'ALWAYS',
    "startTime" TEXT,
    "endTime" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "weekdays" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Display_macAddress_key" ON "Display"("macAddress");

-- CreateIndex
CREATE INDEX "Display_orgId_idx" ON "Display"("orgId");

-- CreateIndex
CREATE INDEX "Display_status_idx" ON "Display"("status");

-- CreateIndex
CREATE INDEX "Display_macAddress_idx" ON "Display"("macAddress");

-- CreateIndex
CREATE INDEX "DisplaySubscription_displayId_idx" ON "DisplaySubscription"("displayId");

-- CreateIndex
CREATE INDEX "DisplaySubscription_planCode_idx" ON "DisplaySubscription"("planCode");

-- CreateIndex
CREATE UNIQUE INDEX "DisplaySubscription_displayId_planCode_key" ON "DisplaySubscription"("displayId", "planCode");

-- CreateIndex
CREATE INDEX "Playlist_displayId_idx" ON "Playlist"("displayId");

-- CreateIndex
CREATE INDEX "PlaylistItem_playlistId_idx" ON "PlaylistItem"("playlistId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Display" ADD CONSTRAINT "Display_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplaySubscription" ADD CONSTRAINT "DisplaySubscription_displayId_fkey" FOREIGN KEY ("displayId") REFERENCES "Display"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplaySubscription" ADD CONSTRAINT "DisplaySubscription_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "SubscriptionPlan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_displayId_fkey" FOREIGN KEY ("displayId") REFERENCES "Display"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
