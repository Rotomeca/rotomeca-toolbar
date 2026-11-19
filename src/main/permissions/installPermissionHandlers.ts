/**
 * Branche la politique de permissions des sites tiers sur une session Electron.
 *
 * Appelé par `bootstrap.ts` pour la session par défaut, celle où tournent les sites lancés. La politique
 * elle-même vit dans `scripts/permissionPolicy.ts` (pure, testable) ; ce fichier ne fait que l'installer.
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import type { Session } from 'electron';
// [permissionPolicy.ts] Politique de permissions des sites tiers : accorder, demander ou refuser
import { createPermissionPolicy } from '../../scripts/permissionPolicy.js';
import type { PermissionPolicyDependencies } from '../../scripts/permissionPolicy.js';

/** Les deux points d'entrée de la session par lesquels Electron demande ou vérifie une permission. */
type PermissionSession = Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>;

/**
 * Installe la politique de permissions des sites tiers sur une session : les permissions
 * sûres sont accordées, celles qui sont sensibles (caméra/micro, localisation) demandent une
 * confirmation mémorisée, tout le reste est refusé.
 *
 * @param session Session à protéger.
 * @param dependencies Magasin des décisions, validation d'adresse et question posée à l'utilisateur.
 */
export function installPermissionHandlers(session: PermissionSession, dependencies: PermissionPolicyDependencies): void {
  const policy = createPermissionPolicy(dependencies);

  session.setPermissionCheckHandler(policy.check);
  session.setPermissionRequestHandler(policy.request);
}
