/*
  Warnings:

  - You are about to drop the column `deviceName` on the `sessions` table. All the data in the column will be lost.
  - You are about to drop the column `ipAddress` on the `sessions` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `sessions` table. All the data in the column will be lost.
  - You are about to drop the column `refreshedAt` on the `sessions` table. All the data in the column will be lost.
  - You are about to drop the column `userAgent` on the `sessions` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `lastLoginAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `auth_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `two_factor_backup_codes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `verification_tokens` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `ip` to the `sessions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "ServiceIdentifier" ADD VALUE 'DB';

-- DropForeignKey
ALTER TABLE "auth_events" DROP CONSTRAINT "auth_events_userId_fkey";

-- DropForeignKey
ALTER TABLE "two_factor_backup_codes" DROP CONSTRAINT "two_factor_backup_codes_userId_fkey";

-- DropForeignKey
ALTER TABLE "verification_tokens" DROP CONSTRAINT "verification_tokens_userId_fkey";

-- DropIndex
DROP INDEX "sessions_refreshToken_key";

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "deviceName",
DROP COLUMN "ipAddress",
DROP COLUMN "refreshToken",
DROP COLUMN "refreshedAt",
DROP COLUMN "userAgent",
ADD COLUMN     "ip" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "user_service_entitlements" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "polarCustomerId" TEXT,
ADD COLUMN     "polarSubscriptionId" TEXT,
ADD COLUMN     "polarSubscriptionStatus" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "emailVerified",
DROP COLUMN "lastLoginAt",
ADD COLUMN     "migraited" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "auth_events";

-- DropTable
DROP TABLE "two_factor_backup_codes";

-- DropTable
DROP TABLE "verification_tokens";

-- DropEnum
DROP TYPE "VerificationTokenType";
