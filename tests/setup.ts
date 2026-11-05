import "dotenv/config";
process.env.DISABLE_SCHEDULER = "true";
// Integration tests (tests/db/*) run against TEST_DATABASE_URL and are skipped without it.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
