-- CreateTable
CREATE TABLE "Check" (
    "id" BIGSERIAL NOT NULL,
    "target" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" SERIAL NOT NULL,
    "target" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "cause" TEXT,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Check_target_checkedAt_idx" ON "Check"("target", "checkedAt");

-- CreateIndex
CREATE INDEX "Check_checkedAt_idx" ON "Check"("checkedAt");

-- CreateIndex
CREATE INDEX "Incident_target_closedAt_idx" ON "Incident"("target", "closedAt");

-- CreateIndex
CREATE INDEX "Incident_openedAt_idx" ON "Incident"("openedAt");
