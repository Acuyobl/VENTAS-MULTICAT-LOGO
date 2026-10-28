-- AlterTable
ALTER TABLE "chat_conversations" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'WEB',
ADD COLUMN     "externalId" TEXT;
