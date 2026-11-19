import type { UpdateStage, UpdateState } from '../shared/dto.js';

export type Translate = (key: string, variables?: Readonly<Record<string, string | number>>) => string;

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** Icône de la carte, selon l'étape de la mise à jour. */
const STAGE_ICONS: Readonly<Record<UpdateStage, string>> = {
  uptodate: 'circle-check',
  available: 'download',
  downloading: 'loader-circle',
  ready: 'refresh-cw',
};

/** Ce que la carte « Mises à jour » affiche pour un état donné. */
export interface UpdateCardView {
  readonly stage: UpdateStage;
  readonly icon: string;
  readonly title: string;
  /** La version installée est une pré-version. */
  readonly showPrereleaseBadge: boolean;
  readonly downloading: boolean;
  /** Pourcentage de progression, `null` : barre indéterminée. */
  readonly progress: number | null;
  readonly progressLabel: string;
  readonly status: string;
  readonly statusIsError: boolean;
  readonly showCheckButton: boolean;
  readonly checking: boolean;
  readonly showInstallButton: boolean;
  readonly installLabel: string;
  readonly installIcon: string;
}

/** @returns « il y a N min/h » pour la dernière vérification, `null` si elle n'a jamais eu lieu */
export function describeLastCheck(lastCheck: number | null, now: number, t: Translate): string | null {
  if (!lastCheck) return null;

  const minutes = Math.max(0, Math.floor((now - lastCheck) / MS_PER_MINUTE));
  if (minutes < 1) return t('update.card.lastNow');
  if (minutes < MINUTES_PER_HOUR) return t('update.card.lastMinutes', { n: minutes });
  return t('update.card.lastHours', { n: Math.floor(minutes / MINUTES_PER_HOUR) });
}

function titleOf(state: UpdateState, t: Translate): string {
  const next = state.versionDisponible;

  switch (state.etat) {
    // Une pré-version est plus récente que la dernière release : « à jour » serait trompeur
    case 'uptodate':
      return t(state.prerelease ? 'update.card.titlePrerelease' : 'update.card.titleUpToDate', { version: state.versionActuelle });
    case 'available':
      return t('update.card.titleAvailable', { version: next ?? '' });
    case 'downloading':
      return t('update.card.titleDownloading');
    case 'ready':
      return t('update.card.titleReady', { version: next ?? '' });
  }
}

function statusOf(state: UpdateState, now: number, t: Translate): { text: string; isError: boolean } {
  if (state.erreur) return { text: t(state.erreur), isError: true };

  switch (state.etat) {
    case 'uptodate': {
      if (state.prerelease) return { text: t('update.card.statusPrerelease'), isError: false };

      const last = describeLastCheck(state.derniereVerification, now, t);
      return { text: last ? t('update.card.statusUpToDate', { last }) : t('update.card.statusNeverChecked'), isError: false };
    }
    case 'available':
      return { text: t('update.card.statusCurrent', { version: state.versionActuelle }), isError: false };
    case 'ready':
      return { text: t('update.card.statusReady'), isError: false };
    case 'downloading':
      return { text: '', isError: false };
  }
}

/**
 * @param state État envoyé par le processus principal
 * @param now Heure actuelle (ms)
 * @returns Ce que la carte affiche : titre, statut, progression et boutons (une seule action primaire à la fois)
 */
export function describeUpdateCard(state: UpdateState, now: number, t: Translate): UpdateCardView {
  const stage = state.etat;
  const downloading = stage === 'downloading';
  const next = state.versionDisponible;
  const status = statusOf(state, now, t);

  return {
    stage,
    icon: STAGE_ICONS[stage],
    title: titleOf(state, t),
    showPrereleaseBadge: state.prerelease,
    downloading,
    // Sans pourcentage (Squirrel), la barre reste indéterminée
    progress: typeof state.pourcentage === 'number' ? state.pourcentage : null,
    progressLabel: next ? t('update.card.progressLabel', { version: next }) : t('update.card.progressLabelUnknown'),
    // Pendant le téléchargement, une erreur n'est pas affichée : la barre prend la place du statut
    status: downloading ? '' : status.text,
    statusIsError: !downloading && status.isError,
    showCheckButton: stage === 'uptodate',
    checking: state.verification,
    showInstallButton: stage === 'available' || stage === 'ready',
    installLabel: stage === 'available' ? t('update.card.download') : t('update.card.install'),
    installIcon: stage === 'available' ? 'download' : 'refresh-cw',
  };
}

/** Ce que le bloc « Version de test » affiche. */
export interface TestChannelView {
  readonly checking: boolean;
  readonly showOpenButton: boolean;
  readonly openLabel: string;
  readonly status: string;
  readonly statusIsError: boolean;
}

/** @returns Ce que le bloc « Version de test » affiche (la carte de mises à jour prend le relais pendant un téléchargement) */
export function describeTestChannel(state: UpdateState, t: Translate): TestChannelView {
  const found = state.versionTest;
  const busy = state.etat === 'downloading' || state.etat === 'ready';

  let status = '';
  let isError = false;
  if (state.erreurTest) {
    status = t(state.erreurTest);
    isError = true;
  } else if (found) {
    status = t('update.test.found', { version: found });
  } else if (state.derniereVerificationTest) {
    status = t('update.test.none');
  }

  return {
    checking: state.verificationTest,
    showOpenButton: !!found && !busy,
    openLabel: found ? t(state.testAuto ? 'update.test.install' : 'update.test.open', { version: found }) : '',
    status,
    statusIsError: isError,
  };
}
