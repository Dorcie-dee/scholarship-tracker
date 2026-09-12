import { StatementTimeoutProvider } from './statement-timeout.provider';

/**
 * Covers the documented, empirically-verified mechanism (see this file's own
 * doc comment): statement_timeout applied via an explicit `SET` query on
 * each new physical connection, not a startup-packet connection option
 * (confirmed against this project's real Neon endpoint not to work that way
 * — see docs/decisions.md, "Statement timeout").
 */
describe('StatementTimeoutProvider', () => {
  const statementTimeoutMillis = 15_000;

  const makeConfigService = () => ({
    get: jest.fn(() => ({ pool: { statementTimeoutMillis } })),
  });

  it('attaches a "connect" listener to the underlying pool that issues SET statement_timeout', () => {
    const pool = { on: jest.fn() };
    const dataSource = { driver: { master: pool } };

    const provider = new StatementTimeoutProvider(
      dataSource as any,
      makeConfigService() as any,
    );
    provider.onApplicationBootstrap();

    expect(pool.on).toHaveBeenCalledWith('connect', expect.any(Function));

    const [, handler] = pool.on.mock.calls[0];
    const client = { query: jest.fn(async () => undefined) };
    handler(client);

    expect(client.query).toHaveBeenCalledWith(
      `SET statement_timeout = ${statementTimeoutMillis}`,
    );
  });

  it('logs a warning instead of throwing when driver.master is not a usable pool', () => {
    const dataSource = { driver: { master: undefined } };
    const provider = new StatementTimeoutProvider(
      dataSource as any,
      makeConfigService() as any,
    );

    expect(() => provider.onApplicationBootstrap()).not.toThrow();
  });

  it('does not throw when the SET query itself rejects on a given connection', async () => {
    const pool = { on: jest.fn() };
    const dataSource = { driver: { master: pool } };
    const provider = new StatementTimeoutProvider(
      dataSource as any,
      makeConfigService() as any,
    );
    provider.onApplicationBootstrap();

    const [, handler] = pool.on.mock.calls[0];
    const client = {
      query: jest.fn(async () => Promise.reject(new Error('boom'))),
    };

    expect(() => handler(client)).not.toThrow();
    // Let the rejected promise's .catch() handler actually run.
    await new Promise((resolve) => setImmediate(resolve));
  });
});
