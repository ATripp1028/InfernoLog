-- The spreadsheet import's one-shot pass for the MANUAL rating order.
--
-- Separate columns from rankingPayload/rankingResult, which carry the demon
-- list: a workbook can carry both orderings, and they replace different tables.
ALTER TABLE "import_jobs" ADD COLUMN "ratingRankingPayload" JSONB;
ALTER TABLE "import_jobs" ADD COLUMN "ratingRankingResult" JSONB;
