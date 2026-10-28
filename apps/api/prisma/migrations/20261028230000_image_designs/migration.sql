-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "imageDesign" TEXT NOT NULL DEFAULT 'CLASICA';

-- AlterTable
ALTER TABLE "social_posts" ADD COLUMN     "imageDesign" TEXT;
