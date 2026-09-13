-- AlterEnum
--
-- On its own because the next migration writes DISCORD rows. Prisma runs each
-- migration file in one transaction, and Postgres refuses to use an enum value
-- in the same transaction that added it ("unsafe use of new value").
ALTER TYPE "AuthProvider" ADD VALUE 'DISCORD';
