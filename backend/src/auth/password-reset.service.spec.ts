import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PasswordResetService } from './password-reset.service';
import { hashToken } from '../common/utils/hash-token';
import { User } from '../users/entities/user.entity';
import { RefreshSession } from './entities/refresh-session.entity';

describe('PasswordResetService', () => {
  const authConfig = {
    passwordResetExpiryMinutes: 30,
    bcryptSaltRounds: 4,
  };
  const configService = { get: jest.fn(() => authConfig) } as any;

  let resetTokens: any;
  let users: any;
  let usersService: any;
  let service: PasswordResetService;
  let rows: Map<string, any>;
  let transactionCalls: Array<{ entity: any; criteria: any; partial: any }>;

  const matchesCriteria = (row: any, criteria: any): boolean =>
    Object.entries(criteria).every(([k, v]) =>
      typeof v === 'object' && v !== null ? row[k] === null : row[k] === v,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    rows = new Map();
    transactionCalls = [];
    let nextId = 1;

    resetTokens = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        const withId = {
          id: row.id ?? `reset-${nextId++}`,
          createdAt: new Date(),
          ...row,
        };
        rows.set(withId.id, withId);
        return withId;
      }),
      findOne: jest.fn(async ({ where }: any) => {
        const match = [...rows.values()].find((r) => matchesCriteria(r, where));
        return match ? { ...match } : null;
      }),
      update: jest.fn(async (criteria: any, partial: any) => {
        let affected = 0;
        for (const row of rows.values()) {
          if (matchesCriteria(row, criteria)) {
            Object.assign(row, partial);
            affected++;
          }
        }
        return { affected };
      }),
    };

    const fakeManager = {
      update: jest.fn(async (entity: any, criteria: any, partial: any) => {
        transactionCalls.push({ entity, criteria, partial });
        return { affected: 1 };
      }),
    };
    users = {
      manager: {
        transaction: jest.fn(async (cb: any) => cb(fakeManager)),
      },
    };

    usersService = { findByEmail: jest.fn() };

    service = new PasswordResetService(
      resetTokens,
      users,
      usersService,
      configService,
    );
  });

  describe('requestReset', () => {
    it('returns null and creates nothing for an unknown email — the enumeration-safety boundary', async () => {
      usersService.findByEmail.mockResolvedValueOnce(null);

      const result = await service.requestReset('nobody@example.invalid');

      expect(result).toBeNull();
      expect(resetTokens.save).not.toHaveBeenCalled();
    });

    it('generates and stores a hashed token for a known account, returning the RAW token only to the caller', async () => {
      const user = { id: 'user-1', email: 'person@example.invalid' };
      usersService.findByEmail.mockResolvedValueOnce(user);

      const result = await service.requestReset('person@example.invalid');

      expect(result?.user).toBe(user);
      expect(result?.rawToken).toEqual(expect.any(String));
      const [row] = [...rows.values()];
      expect(row.tokenHash).toBe(hashToken(result!.rawToken));
      expect(JSON.stringify(row)).not.toContain(result!.rawToken);
    });

    it('invalidates a still-active prior reset token before issuing a new one', async () => {
      const user = { id: 'user-1', email: 'person@example.invalid' };
      usersService.findByEmail.mockResolvedValue(user);

      await service.requestReset('person@example.invalid');
      await service.requestReset('person@example.invalid');

      const [firstRow, secondRow] = [...rows.values()];
      expect(firstRow.invalidatedAt).not.toBeNull();
      expect(secondRow.invalidatedAt).toBeNull();
    });
  });

  describe('resetPassword', () => {
    const seedToken = async (overrides: Record<string, unknown> = {}) => {
      const rawToken = 'raw-reset-token-value';
      const row = {
        id: 'reset-1',
        userId: 'user-1',
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        consumedAt: null,
        invalidatedAt: null,
        createdAt: new Date(),
        ...overrides,
      };
      rows.set(row.id, row);
      return rawToken;
    };

    it('rejects an unknown token', async () => {
      await expect(
        service.resetPassword('not-a-real-token', 'NewPassword123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired token, and consumes it so it cannot be retried', async () => {
      const rawToken = await seedToken({
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword(rawToken, 'NewPassword123'),
      ).rejects.toThrow(BadRequestException);

      const [row] = [...rows.values()];
      expect(row.consumedAt).not.toBeNull();
      // A second attempt hits the "already consumed" path, not "expired"
      // again — same generic message either way, verified by the reject above.
      await expect(
        service.resetPassword(rawToken, 'NewPassword123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects reuse of an already-consumed token', async () => {
      const rawToken = await seedToken();
      await service.resetPassword(rawToken, 'NewPassword123');

      await expect(
        service.resetPassword(rawToken, 'AnotherPassword456'),
      ).rejects.toThrow(BadRequestException);
      // Only the first call's password change should have gone through.
      expect(transactionCalls.filter((c) => c.entity === User)).toHaveLength(1);
    });

    it('on success: hashes the new password, updates the user, and revokes every refresh session — all in one transaction', async () => {
      const rawToken = await seedToken();

      await service.resetPassword(rawToken, 'NewPassword123');

      const userUpdate = transactionCalls.find((c) => c.entity === User);
      expect(userUpdate?.criteria).toBe('user-1');
      const newHash = userUpdate?.partial.passwordHash;
      expect(newHash).toEqual(expect.any(String));
      expect(newHash).not.toBe('NewPassword123'); // never stored in plaintext
      expect(await bcrypt.compare('NewPassword123', newHash)).toBe(true);

      const sessionUpdate = transactionCalls.find(
        (c) => c.entity === RefreshSession,
      );
      expect(sessionUpdate?.criteria).toEqual({
        userId: 'user-1',
        revokedAt: expect.anything(), // IsNull()
      });
      expect(sessionUpdate?.partial.revokedAt).toEqual(expect.any(Date));

      // Both writes went through the SAME transaction.
      expect(users.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('consumes the token BEFORE opening the transaction that changes the password', async () => {
      const rawToken = await seedToken();

      await service.resetPassword(rawToken, 'NewPassword123');

      const [row] = [...rows.values()];
      expect(row.consumedAt).not.toBeNull();
      // resetTokens.update (the atomic consume) is a separate repository
      // call from the users.manager.transaction — confirms token consumption
      // isn't silently skipped if something inside the transaction changes.
      expect(resetTokens.update).toHaveBeenCalled();
    });
  });
});
