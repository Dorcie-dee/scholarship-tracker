import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Liveness vs. readiness (Batch 1): `getLiveness()` answers "is the process
 * itself running and able to handle a request" — no external dependency
 * check, deliberately cheap, safe to poll frequently. `getReadiness()`
 * additionally answers "is this instance actually able to serve real
 * traffic right now" — a genuine `SELECT 1` against Postgres, the one
 * dependency every request in this API ultimately needs. Kept as two
 * separate checks (not one "health" endpoint conflating both) because they
 * answer different orchestration questions: a liveness failure means
 * "restart this process," a readiness failure means "stop routing traffic
 * here until it recovers" — those are different remediation actions, and
 * conflating them risks unnecessary restarts during a transient DB blip.
 */
@Injectable()
export class AppService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  getLiveness(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * A single, trivial `SELECT 1` — not a query against any real table, and
   * not wrapped in anything that could itself be slow. Any error is
   * deliberately not passed through to the response (see the exception
   * filter's own "never leak internal DB error details" guarantee) — only a
   * generic 503 with no driver-level detail.
   */
  async getReadiness(): Promise<{ status: 'ok'; timestamp: string }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
