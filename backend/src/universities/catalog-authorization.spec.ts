import { UserRole } from '../types';
import { UniversitiesController } from './universities.controller';
import { ProgrammesController } from '../programmes/programmes.controller';
import { OpportunitiesController } from '../opportunities/opportunities.controller';

const ROLES_KEY = 'roles';

/**
 * Track 1 Group B RBAC — reads the exact metadata RolesGuard itself
 * consumes via its injected Reflector (SetMetadata(ROLES_KEY, roles) on the
 * handler function — see roles.decorator.ts), off each catalog controller's
 * real route handlers. Proves route coverage directly, the same
 * metadata-reading approach already established for rate-limit wiring (see
 * auth.controller.throttle.spec.ts) — not a re-implementation or a guess.
 *
 * Central location for all three catalog controllers (rather than one file
 * each) since the assertion — "mutation is ADMIN-only, reads are open" — is
 * one policy applied identically across all three; a single table makes
 * that policy visible in one place rather than split three ways.
 */
describe('Shared catalog controllers — mutation is ADMIN-only, reads are open', () => {
  const rolesOn = (
    proto: object,
    handlerName: string,
  ): UserRole[] | undefined => {
    const handler = Object.getOwnPropertyDescriptor(proto, handlerName)
      ?.value as ((...args: unknown[]) => unknown) | undefined;
    return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
  };

  it.each([
    ['UniversitiesController', UniversitiesController.prototype, 'create'],
    ['UniversitiesController', UniversitiesController.prototype, 'update'],
    ['UniversitiesController', UniversitiesController.prototype, 'remove'],
    ['ProgrammesController', ProgrammesController.prototype, 'create'],
    ['ProgrammesController', ProgrammesController.prototype, 'update'],
    ['ProgrammesController', ProgrammesController.prototype, 'remove'],
    ['OpportunitiesController', OpportunitiesController.prototype, 'create'],
    ['OpportunitiesController', OpportunitiesController.prototype, 'update'],
    ['OpportunitiesController', OpportunitiesController.prototype, 'remove'],
  ] as const)('%s.%s requires ADMIN', (_name, proto, handlerName) => {
    expect(rolesOn(proto, handlerName)).toEqual([UserRole.ADMIN]);
  });

  it.each([
    ['UniversitiesController', UniversitiesController.prototype, 'findAll'],
    ['UniversitiesController', UniversitiesController.prototype, 'findOne'],
    ['ProgrammesController', ProgrammesController.prototype, 'findAll'],
    ['ProgrammesController', ProgrammesController.prototype, 'findOne'],
    ['OpportunitiesController', OpportunitiesController.prototype, 'findAll'],
    ['OpportunitiesController', OpportunitiesController.prototype, 'findOne'],
  ] as const)(
    '%s.%s has no role restriction — catalog consumption stays open',
    (_name, proto, handlerName) => {
      expect(rolesOn(proto, handlerName)).toBeUndefined();
    },
  );
});
