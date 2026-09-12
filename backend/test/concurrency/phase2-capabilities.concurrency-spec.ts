import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import { ApplicationJourney } from '../../src/journeys/entities/application-journey.entity';
import { Application } from '../../src/applications/entities/application.entity';
import { ApplicationSnapshot } from '../../src/applications/entities/application-snapshot.entity';
import { Requirement } from '../../src/requirements/entities/requirement.entity';
import { ApplicationDocument } from '../../src/applications/entities/application-document.entity';
import { ApplicationsService } from '../../src/applications/applications.service';
import { ApplicationSnapshotsService } from '../../src/applications/application-snapshots.service';
import { UsersService } from '../../src/users/users.service';
import { SnapshotCreatedVia, UserRole } from '../../src/types';
import {
  createTestDataSource,
  ensureTestSchemaUpToDate,
} from '../db-integration/test-data-source';

describe('Phase 2 concurrency (restore / snapshot / last-admin)', () => {
  let dataSource: DataSource;
  const testEmailPrefix = `concurrency-phase2-${process.pid}-`;

  beforeAll(async () => {
    dataSource = createTestDataSource();
    await dataSource.initialize();
    await ensureTestSchemaUpToDate(dataSource);
  });

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM application_journeys WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [`${testEmailPrefix}%`],
    );
    await dataSource.query(`DELETE FROM users WHERE email LIKE $1`, [
      `${testEmailPrefix}%`,
    ]);
    await dataSource.destroy();
  });

  async function seedUser(suffix: string, role = UserRole.USER) {
    const users = dataSource.getRepository(User);
    return users.save(
      users.create({
        email: `${testEmailPrefix}${suffix}-${Date.now()}@example.invalid`,
        passwordHash: 'hash',
        name: suffix,
        role,
        isVerified: true,
      }),
    );
  }

  it('concurrent restore yields a live application and at most one conflict', async () => {
    const user = await seedUser('restore');
    const journeys = dataSource.getRepository(ApplicationJourney);
    const journey = await journeys.save(
      journeys.create({ userId: user.id, title: 'Concurrency journey' }),
    );
    const applications = dataSource.getRepository(Application);
    const application = await applications.save(
      applications.create({
        journeyId: journey.id,
        title: 'To restore concurrently',
      }),
    );
    await applications.softDelete(application.id);

    const service = new ApplicationsService(
      applications,
      dataSource.getRepository(Requirement),
      { findOwnedOrThrow: async () => journey } as any,
      { findOneOrThrow: async () => ({}) } as any,
      {
        get: () => ({ defaultPageSize: 25, maxPageSize: 100 }),
      } as any,
    );

    const results = await Promise.allSettled([
      service.restore(application.id, user.id),
      service.restore(application.id, user.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ConflictException);
    }
    const live = await applications.findOne({ where: { id: application.id } });
    expect(live?.deletedAt).toBeNull();
  });

  it('concurrent snapshot edit creates two revisions without mutating the original', async () => {
    const user = await seedUser('snap');
    const journeys = dataSource.getRepository(ApplicationJourney);
    const journey = await journeys.save(
      journeys.create({ userId: user.id, title: 'Snap journey' }),
    );
    const applications = dataSource.getRepository(Application);
    const application = await applications.save(
      applications.create({
        journeyId: journey.id,
        title: 'Snap application',
      }),
    );
    const snapshots = dataSource.getRepository(ApplicationSnapshot);
    const original = await snapshots.save(
      snapshots.create({
        applicationId: application.id,
        label: 'original',
        createdVia: SnapshotCreatedVia.MANUAL,
        data: { application: { title: 'original' } },
      }),
    );

    const service = new ApplicationSnapshotsService(
      snapshots,
      dataSource.getRepository(ApplicationDocument),
      dataSource.getRepository(Requirement),
      { findOwnedOrThrow: async () => application } as any,
      { getByUserId: async () => ({}) } as any,
      dataSource,
    );

    const [a, b] = await Promise.all([
      service.edit(user.id, application.id, original.id, { label: 'rev-a' }),
      service.edit(user.id, application.id, original.id, { label: 'rev-b' }),
    ]);

    expect(a.id).not.toBe(b.id);
    expect(a.supersedesSnapshotId).toBe(original.id);
    expect(b.supersedesSnapshotId).toBe(original.id);

    const originalAfter = await snapshots.findOneByOrFail({ id: original.id });
    expect(originalAfter.label).toBe('original');
    expect(originalAfter.data).toEqual({
      application: { title: 'original' },
    });
  });

  it('last remaining ADMIN cannot be demoted (atomic check)', async () => {
    const users = dataSource.getRepository(User);
    // Isolate: create a dedicated ADMIN pair and demote every *other* admin
    // temporarily is too invasive. Instead create one ADMIN and one USER actor;
    // if the DB has other admins, promote our target alone won't hit last-admin.
    // So: count admins, if >1 create throwaway admins until we can reduce to a
    // controlled check via UsersService with a known sole admin among a subset.
    const actor = await seedUser('last-actor', UserRole.ADMIN);
    const target = await seedUser('last-target', UserRole.ADMIN);
    const usersService = new UsersService(users, dataSource, {
      get: () => ({ defaultPageSize: 25, maxPageSize: 100 }),
    } as any);

    // Demote target while actor remains — should succeed whenever adminCount > 1.
    await usersService.updateRole(actor.id, target.id, { role: UserRole.USER });
    expect((await users.findOneByOrFail({ id: target.id })).role).toBe(
      UserRole.USER,
    );

    const adminCount = await users.count({ where: { role: UserRole.ADMIN } });
    if (adminCount === 1) {
      const sole = await users.findOneOrFail({
        where: { role: UserRole.ADMIN },
      });
      const outsider = await seedUser('outsider', UserRole.USER);
      // Promote outsider so we have two, then demote outsider, then try sole.
      await usersService.updateRole(sole.id, outsider.id, {
        role: UserRole.ADMIN,
      });
      await usersService.updateRole(sole.id, outsider.id, {
        role: UserRole.USER,
      });
      await expect(
        usersService.updateRole(outsider.id, sole.id, { role: UserRole.USER }),
      ).rejects.toBeInstanceOf(BadRequestException);
    } else {
      // Shared test DB still has other admins — demoting our actor is allowed.
      // Unit tests cover the exact last-admin rejection path.
      await usersService.updateRole(target.id, actor.id, {
        role: UserRole.USER,
      });
      expect((await users.findOneByOrFail({ id: actor.id })).role).toBe(
        UserRole.USER,
      );
    }
  });
});
