-- Every stored email becomes lowercase, and stays that way.
--
-- Email is about to become a sign-in name, and User.email is unique. With
-- mixed case allowed, `Sp0rk@x.com` and `sp0rk@x.com` would be two different
-- accounts to Postgres but the same mailbox to everyone else, and Cognito
-- (caseSensitive: false) would treat them as one user. Code normalizes with
-- core's EmailSchema before writing; the CHECK constraints below make the
-- database refuse anything that skipped it.

-- Guard: lowercasing must not merge two accounts. If this raises, resolve the
-- listed addresses by hand — there is no automatic answer to which account
-- keeps the address.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'lowercase_emails: some users have emails that differ only in case. Find them with: SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1';
  END IF;
END $$;

UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");

UPDATE "auth_identities" SET "email" = lower("email")
WHERE "email" IS NOT NULL AND "email" <> lower("email");

-- Prisma's schema cannot express these; they live only here.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase"
    CHECK ("email" = lower("email"));

ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_email_lowercase"
    CHECK ("email" IS NULL OR "email" = lower("email"));
