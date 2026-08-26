-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CALLER', 'DEVELOPER');

-- CreateEnum
CREATE TYPE "RallyEventStatus" AS ENUM ('DRAFT', 'READY', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('WAITING', 'LAUNCHED', 'MISSED');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('RALLY_STARTED', 'WARNING_60', 'WARNING_30', 'WARNING_15', 'WARNING_10', 'WARNING_5', 'WARNING_3', 'LAUNCH');

-- CreateEnum
CREATE TYPE "NotificationEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CALLER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "warningLeadsSeconds" JSONB NOT NULL DEFAULT '[10, 5]',
    "warn10Enabled" BOOLEAN NOT NULL DEFAULT true,
    "warn5Enabled" BOOLEAN NOT NULL DEFAULT true,
    "launchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryLeadMs" INTEGER,
    "deliverySampleCount" INTEGER NOT NULL DEFAULT 0,
    "lastCalibratedAt" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RallyEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetArrivalTime" TIMESTAMPTZ(3),
    "gatherDurationSeconds" INTEGER NOT NULL DEFAULT 300,
    "firstCallerLeadSeconds" INTEGER NOT NULL DEFAULT 3,
    "pushLeadMs" INTEGER NOT NULL DEFAULT 1000,
    "status" "RallyEventStatus" NOT NULL DEFAULT 'DRAFT',
    "isTestMode" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RallyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RallyAssignment" (
    "id" TEXT NOT NULL,
    "rallyEventId" TEXT NOT NULL,
    "callerName" TEXT NOT NULL,
    "userId" TEXT,
    "marchDurationSeconds" INTEGER NOT NULL,
    "arrivalOffsetSeconds" INTEGER NOT NULL DEFAULT 0,
    "launchTime" TIMESTAMPTZ(3),
    "expectedArrivalTime" TIMESTAMPTZ(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'WAITING',
    "launchedConfirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RallyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "platform" TEXT,
    "userAgent" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deliveryLeadMs" INTEGER NOT NULL DEFAULT 1000,
    "deliverySampleCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryP50Ms" INTEGER,
    "deliveryP90Ms" INTEGER,
    "deliveryWindowCount" INTEGER NOT NULL DEFAULT 0,
    "lastCalibratedAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3),
    "deviceId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "rallyAssignmentId" TEXT NOT NULL,
    "type" "NotificationEventType" NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "status" "NotificationEventStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VapidConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT 'mailto:admin@example.com',
    "source" TEXT NOT NULL DEFAULT 'generated',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VapidConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "deviceId" TEXT,
    "subscriptionId" TEXT,
    "platform" TEXT,
    "message" TEXT,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "subscriptionId" TEXT,
    "deviceId" TEXT,
    "platform" TEXT,
    "endpointHost" TEXT,
    "endpointFingerprint" TEXT,
    "vapidFingerprint" TEXT,
    "notificationType" TEXT,
    "rallyId" TEXT,
    "assignmentId" TEXT,
    "declarativePayload" BOOLEAN NOT NULL DEFAULT false,
    "targetAt" TIMESTAMPTZ(3),
    "providerStatus" INTEGER,
    "providerMessageId" TEXT,
    "providerDurationMs" INTEGER,
    "providerAcceptedAt" TIMESTAMPTZ(3),
    "providerError" TEXT,
    "receivedAt" TIMESTAMPTZ(3),
    "clientReceivedAt" TIMESTAMPTZ(3),
    "calibrationAppliedAt" TIMESTAMPTZ(3),
    "calibrationRoundTripMs" INTEGER,
    "calibrationDelayMs" INTEGER,
    "calibrationP50Ms" INTEGER,
    "calibrationP90Ms" INTEGER,
    "calibrationWindowCount" INTEGER,
    "calibrationMethod" TEXT,
    "displayedAt" TIMESTAMPTZ(3),
    "displayFailedAt" TIMESTAMPTZ(3),
    "displayError" TEXT,
    "clickedAt" TIMESTAMPTZ(3),
    "serviceWorkerVersion" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PushDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

-- CreateIndex
CREATE INDEX "RallyEvent_status_idx" ON "RallyEvent"("status");

-- CreateIndex
CREATE INDEX "RallyEvent_targetArrivalTime_idx" ON "RallyEvent"("targetArrivalTime");

-- CreateIndex
CREATE INDEX "RallyEvent_pinned_sortOrder_idx" ON "RallyEvent"("pinned", "sortOrder");

-- CreateIndex
CREATE INDEX "RallyAssignment_rallyEventId_idx" ON "RallyAssignment"("rallyEventId");

-- CreateIndex
CREATE INDEX "RallyAssignment_userId_idx" ON "RallyAssignment"("userId");

-- CreateIndex
CREATE INDEX "RallyAssignment_launchTime_idx" ON "RallyAssignment"("launchTime");

-- CreateIndex
CREATE INDEX "RallyAssignment_status_idx" ON "RallyAssignment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RallyAssignment_rallyEventId_callerName_key" ON "RallyAssignment"("rallyEventId", "callerName");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_active_idx" ON "PushSubscription"("userId", "active");

-- CreateIndex
CREATE INDEX "PushSubscription_lastSeenAt_idx" ON "PushSubscription"("lastSeenAt");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_deviceId_idx" ON "PushSubscription"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "NotificationEvent_scheduledAt_status_idx" ON "NotificationEvent"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "NotificationEvent_rallyAssignmentId_idx" ON "NotificationEvent"("rallyAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEvent_rallyAssignmentId_type_key" ON "NotificationEvent"("rallyAssignmentId", "type");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_kind_createdAt_idx" ON "ActivityLog"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushDeliveryAttempt_dispatchId_key" ON "PushDeliveryAttempt"("dispatchId");

-- CreateIndex
CREATE INDEX "PushDeliveryAttempt_createdAt_idx" ON "PushDeliveryAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "PushDeliveryAttempt_userId_createdAt_idx" ON "PushDeliveryAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PushDeliveryAttempt_subscriptionId_createdAt_idx" ON "PushDeliveryAttempt"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "PushDeliveryAttempt_deviceId_createdAt_idx" ON "PushDeliveryAttempt"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "PushDeliveryAttempt_providerStatus_createdAt_idx" ON "PushDeliveryAttempt"("providerStatus", "createdAt");

-- CreateIndex
CREATE INDEX "PushDeliveryAttempt_notificationType_createdAt_idx" ON "PushDeliveryAttempt"("notificationType", "createdAt");

-- AddForeignKey
ALTER TABLE "RallyAssignment" ADD CONSTRAINT "RallyAssignment_rallyEventId_fkey" FOREIGN KEY ("rallyEventId") REFERENCES "RallyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RallyAssignment" ADD CONSTRAINT "RallyAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_rallyAssignmentId_fkey" FOREIGN KEY ("rallyAssignmentId") REFERENCES "RallyAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

