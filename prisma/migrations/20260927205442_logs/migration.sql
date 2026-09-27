-- CreateTable
CREATE TABLE "LogEntry" (
    "id" BIGSERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "context" TEXT,
    "message" TEXT NOT NULL,
    "stack" TEXT,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogEntry_timestamp_idx" ON "LogEntry"("timestamp");

-- CreateIndex
CREATE INDEX "LogEntry_service_level_timestamp_idx" ON "LogEntry"("service", "level", "timestamp");
