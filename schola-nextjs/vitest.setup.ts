import { afterAll, afterEach, beforeAll } from 'vitest';
import { startTestDatabase, stopTestDatabase, clearTestDatabase } from './server/lib/test-db';
import './server/models/index';
// Safe to import for backend tests too — it only adds `expect` matchers,
// never touches the DOM unless a test actually renders something.
import '@testing-library/jest-dom/vitest';

process.env.JWT_ACCESS_SECRET = 'test_only_access_secret_1234567890';
process.env.EMAIL_SMTP_HOST = ''; // emails log instead of sending in tests

beforeAll(async () => {
  await startTestDatabase();
}, 60_000);

afterEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});
