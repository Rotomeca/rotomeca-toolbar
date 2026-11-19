import type { Session } from 'electron';
import { createPermissionPolicy } from '../../scripts/permissionPolicy.js';
import type { PermissionPolicyDependencies } from '../../scripts/permissionPolicy.js';

type PermissionSession = Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>;

/**
 * Installe la politique de permissions des sites tiers sur une session : les permissions
 * sûres sont accordées, celles qui sont sensibles (caméra/micro, localisation) demandent une
 * confirmation mémorisée, tout le reste est refusé.
 */
export function installPermissionHandlers(session: PermissionSession, dependencies: PermissionPolicyDependencies): void {
  const policy = createPermissionPolicy(dependencies);

  session.setPermissionCheckHandler(policy.check);
  session.setPermissionRequestHandler(policy.request);
}
