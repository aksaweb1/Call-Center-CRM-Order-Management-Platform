-- CreateEnum
CREATE TYPE "CallDevice" AS ENUM ('MOBILE', 'WEB_DIALER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "callDevice" "CallDevice" NOT NULL DEFAULT 'MOBILE';
