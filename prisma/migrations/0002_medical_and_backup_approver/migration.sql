-- Backup approver for an employee's leave
ALTER TABLE "User" ADD COLUMN "backupManagerId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_backupManagerId_fkey" FOREIGN KEY ("backupManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Medical certificate on leave requests
ALTER TABLE "LeaveRequest" ADD COLUMN "certPath" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "certName" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "certMime" TEXT;

-- Medical claim categories are filed with medical leave
ALTER TABLE "ClaimCategory" ADD COLUMN "medical" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ClaimCategory" SET "medical" = true WHERE "name" = 'Medical / Clinic';

-- Claim submitted together with a leave request
ALTER TABLE "Claim" ADD COLUMN "leaveRequestId" TEXT;
CREATE UNIQUE INDEX "Claim_leaveRequestId_key" ON "Claim"("leaveRequestId");
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
