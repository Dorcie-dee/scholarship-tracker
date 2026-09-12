import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * Rewritten (Batch 1) using this codebase's established direct-construction
 * convention (see every other *.spec.ts) instead of the untouched Nest
 * scaffold default's `Test.createTestingModule` — the only place in the
 * repository that still used it. `AppService` now depends on a real
 * `DataSource` for the readiness check, so a bare `TestingModule` with no
 * database wiring can no longer construct it anyway.
 *
 * Covers the liveness/readiness split (Batch 1): liveness never touches the
 * database at all; readiness does a real connectivity check and must
 * translate a failure into a clean 503, never leaking driver-level detail.
 */
describe('AppController / AppService', () => {
  let dataSource: any;
  let service: AppService;
  let controller: AppController;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => [{ '?column?': 1 }]) };
    service = new AppService(dataSource);
    controller = new AppController(service);
  });

  describe('getHealth (liveness)', () => {
    it('reports status ok without touching the database', () => {
      const result = controller.getHealth();

      expect(result).toEqual(expect.objectContaining({ status: 'ok' }));
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('getReadiness', () => {
    it('reports status ok when the database is reachable', async () => {
      const result = await controller.getReadiness();

      expect(result).toEqual(expect.objectContaining({ status: 'ok' }));
      expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('translates a database failure into a clean 503, with no driver detail leaked', async () => {
      dataSource.query.mockRejectedValue(
        new Error(
          'connection terminated unexpectedly: password authentication failed for user "x"',
        ),
      );

      let caught: unknown;
      try {
        await controller.getReadiness();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ServiceUnavailableException);
      // The rejection reaching the caller must not carry the raw driver
      // error text (which could include connection/auth detail) — only the
      // service's own generic message.
      expect((caught as Error).message).toBe('Database is not reachable');
    });
  });
});
