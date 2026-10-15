-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'EDITOR';

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "actorRole" TEXT;

