-- usage_records are loaded by runId when attaching per-message token counts.
CREATE INDEX "usage_records_runId_idx" ON "usage_records"("runId");
