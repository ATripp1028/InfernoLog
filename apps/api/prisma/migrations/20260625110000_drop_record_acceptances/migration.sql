-- Drop the record_acceptances table (and its schema model). We are cutting the
-- self-reported "GDDL record accepted" indicator/flag. GDDL record *submission*
-- (submitToGddl on POST /v1/me/completions) is unaffected and remains.
-- Cascade via the FK so nothing is left dangling.

-- DropTable
DROP TABLE IF EXISTS "record_acceptances";
