import { BadRequestException, HttpException } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';
import { hashToken } from '../common/utils/hash-token';

describe('EmailVerificationService', () => {
  const authConfig = {
    otpExpiryMinutes: 10,
    otpMaxAttempts: 5,
    otpResendCooldownSeconds: 60,
  };
  const configService = { get: jest.fn(() => authConfig) } as any;

  let otps: any;
  let usersService: any;
  let service: EmailVerificationService;
  let rows: Map<string, any>;

  const matchesCriteria = (row: any, criteria: any): boolean =>
    Object.entries(criteria).every(([k, v]) =>
      typeof v === 'object' && v !== null ? row[k] === null : row[k] === v,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    rows = new Map();
    let nextId = 1;

    otps = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        // Mimics TypeORM's @CreateDateColumn — real rows always get a real
        // createdAt on insert; without this, findOne's ORDER BY createdAt
        // DESC (below) would be comparing undefined values.
        const withId = {
          id: row.id ?? `otp-${nextId++}`,
          createdAt: new Date(),
          ...row,
        };
        rows.set(withId.id, withId);
        return withId;
      }),
      findOne: jest.fn(async ({ where }: any) => {
        // Returns a COPY, not the live stored reference — matching real
        // TypeORM, where each findOne() hydrates a fresh entity instance
        // independent of anything a later increment()/update() call does to
        // the underlying row. Returning the live reference here made
        // `active.attempts` inside verify() silently reflect increment()'s
        // mutation before the code's own "+1" check ran, double-counting the
        // very attempt it had just recorded — a mock-fidelity bug, not a bug
        // in EmailVerificationService itself (which correctly assumes, per
        // real TypeORM semantics, that its own in-memory `active` snapshot
        // never changes underneath it).
        const candidates = [...rows.values()]
          .filter((r) => matchesCriteria(r, where))
          .sort((a, b) => b.createdAt - a.createdAt);
        return candidates[0] ? { ...candidates[0] } : null;
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
      increment: jest.fn(async ({ id }: any, column: string, value: number) => {
        const row = rows.get(id);
        if (row) row[column] += value;
        return { affected: row ? 1 : 0 };
      }),
    };

    usersService = {
      getByIdOrThrow: jest.fn(async () => ({
        id: 'user-1',
        isVerified: false,
      })),
      markVerified: jest.fn(),
    };

    service = new EmailVerificationService(otps, usersService, configService);
  });

  // Helper: issue an OTP the normal way and return its raw code, stamping a
  // real createdAt so ordering/expiry logic behaves.
  const issueWithCreatedAt = async (createdAt = new Date()) => {
    const { otp } = await service.issueOtp('user-1');
    const [row] = [...rows.values()];
    row.createdAt = createdAt;
    return otp;
  };

  describe('issueOtp', () => {
    it('generates a 6-digit code and stores only its hash, never the raw value', async () => {
      const { otp } = await service.issueOtp('user-1');

      expect(otp).toMatch(/^\d{6}$/);
      const [row] = [...rows.values()];
      expect(row.otpHash).toBe(hashToken(otp));
      expect(row.otpHash).not.toBe(otp);
      expect(JSON.stringify(row)).not.toContain(otp);
    });

    it('invalidates any still-active prior OTP for the same user before issuing a new one', async () => {
      const first = await service.issueOtp('user-1');
      const second = await service.issueOtp('user-1');

      expect(first.otp).not.toBe(second.otp);
      const [firstRow, secondRow] = [...rows.values()];
      expect(firstRow.invalidatedAt).not.toBeNull();
      expect(secondRow.invalidatedAt).toBeNull();
    });
  });

  describe('verify', () => {
    it('verifies the account on a correct, unexpired code', async () => {
      const otp = await issueWithCreatedAt();

      await service.verify('user-1', otp);

      expect(usersService.markVerified).toHaveBeenCalledWith('user-1');
      const [row] = [...rows.values()];
      expect(row.consumedAt).not.toBeNull();
    });

    it('rejects an incorrect code without revealing why', async () => {
      await issueWithCreatedAt();

      await expect(service.verify('user-1', '000000')).rejects.toThrow(
        BadRequestException,
      );
      expect(usersService.markVerified).not.toHaveBeenCalled();
    });

    it('rejects when there is no active code at all', async () => {
      await expect(service.verify('user-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired code, and invalidates it so it cannot be retried', async () => {
      const otp = await issueWithCreatedAt(
        new Date(Date.now() - 11 * 60 * 1000),
      );
      const [row] = [...rows.values()];
      row.expiresAt = new Date(Date.now() - 60 * 1000);

      await expect(service.verify('user-1', otp)).rejects.toThrow(
        BadRequestException,
      );
      expect(row.invalidatedAt).not.toBeNull();
    });

    it('rejects a code that has already been used (consumed)', async () => {
      const otp = await issueWithCreatedAt();
      await service.verify('user-1', otp); // first, successful use

      await expect(service.verify('user-1', otp)).rejects.toThrow(
        BadRequestException,
      );
      // markVerified should not have been called a second time.
      expect(usersService.markVerified).toHaveBeenCalledTimes(1);
    });

    it('enforces the maximum attempt count, invalidating the code once exceeded', async () => {
      const otp = await issueWithCreatedAt();
      for (let i = 0; i < authConfig.otpMaxAttempts - 1; i++) {
        await expect(service.verify('user-1', '000000')).rejects.toThrow(
          BadRequestException,
        );
      }
      // This attempt crosses the limit.
      await expect(service.verify('user-1', '000000')).rejects.toThrow(
        /too many/i,
      );

      const [row] = [...rows.values()];
      expect(row.invalidatedAt).not.toBeNull();

      // Even the CORRECT code no longer works once the limit is hit.
      await expect(service.verify('user-1', otp)).rejects.toThrow(
        BadRequestException,
      );
      expect(usersService.markVerified).not.toHaveBeenCalled();
    });

    it('is a safe no-op if the account is already verified', async () => {
      usersService.getByIdOrThrow.mockResolvedValue({
        id: 'user-1',
        isVerified: true,
      });

      await expect(
        service.verify('user-1', 'anything'),
      ).resolves.toBeUndefined();
      expect(usersService.markVerified).not.toHaveBeenCalled();
    });

    it('scopes strictly by the given userId — a code issued for one user cannot be verified by supplying a different userId', async () => {
      const otp = await issueWithCreatedAt();

      usersService.getByIdOrThrow.mockResolvedValueOnce({
        id: 'user-2',
        isVerified: false,
      });
      await expect(service.verify('user-2', otp)).rejects.toThrow(
        BadRequestException,
      );
      expect(usersService.markVerified).not.toHaveBeenCalled();
    });
  });

  describe('resend', () => {
    it('issues a new OTP when no cooldown applies', async () => {
      const { otp } = await service.resend('user-1');
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('throws 429 when called again within the cooldown window', async () => {
      await service.resend('user-1');
      await expect(service.resend('user-1')).rejects.toThrow(HttpException);
    });

    it('allows a resend once the cooldown has passed', async () => {
      await issueWithCreatedAt(
        new Date(Date.now() - (authConfig.otpResendCooldownSeconds + 5) * 1000),
      );

      await expect(service.resend('user-1')).resolves.toEqual(
        expect.objectContaining({ otp: expect.any(String) }),
      );
    });

    it('rejects resend for an already-verified account', async () => {
      usersService.getByIdOrThrow.mockResolvedValue({
        id: 'user-1',
        isVerified: true,
      });

      await expect(service.resend('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
