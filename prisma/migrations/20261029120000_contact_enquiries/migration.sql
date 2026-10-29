-- CreateEnum
CREATE TYPE "EnquiryType" AS ENUM ('GENERAL', 'ENROLLMENT', 'TASK_SUBMISSION', 'PAYMENT', 'CERTIFICATE', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "contact_enquiries" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "type" "EnquiryType" NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" VARCHAR(1000),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(300),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_enquiries_status_createdAt_idx" ON "contact_enquiries"("status", "createdAt");

-- CreateIndex
CREATE INDEX "contact_enquiries_email_idx" ON "contact_enquiries"("email");
