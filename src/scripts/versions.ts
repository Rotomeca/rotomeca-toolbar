interface PreReleaseTag {
  /** Étiquette en minuscules (`rc`). */
  readonly label: string;
  /** Numéro de l'étiquette (`1` pour `rc1`, 0 s'il n'y en a pas). */
  readonly number: number;
}

interface ParsedVersion {
  /** Composantes numériques (`[3, 4, 0]`). */
  readonly core: readonly number[];
  /** Pré-version (`rc1`), ou null pour une release. */
  readonly pre: PreReleaseTag | null;
}

/** Découpe un numéro de version (`1.2.3`, `v1.2`, `1.2.3-rc1`). */
function parse(value: unknown): ParsedVersion {
  const text = String(value).replace(/^v/i, '');
  const dash = text.indexOf('-');
  const core = (dash < 0 ? text : text.slice(0, dash))
    .split('.')
    .map((part) => parseInt(part, 10) || 0);

  if (dash < 0) return { core, pre: null };

  // « rc1 » : une étiquette puis un numéro. Tout le reste compte comme étiquette seule.
  const suffix = text.slice(dash + 1);
  const match = /^([a-z]*)(\d*)$/i.exec(suffix);

  return {
    core,
    pre: {
      label: (match?.[1] ?? suffix).toLowerCase(),
      number: parseInt(match?.[2] ?? '', 10) || 0,
    },
  };
}

/**
 * Compare deux numéros de version. Une pré-version (`3.3.0-rc1`) est plus ancienne
 * que sa version finale (`3.3.0`), et plus récente que la précédente (`3.2.0`).
 * @returns Un nombre > 0 si `a` est plus récente, < 0 si plus ancienne, 0 si égales
 */
export function compareVersions(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);

  for (let i = 0; i < Math.max(left.core.length, right.core.length); ++i) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) return diff;
  }

  if (!left.pre && !right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;

  return (
    left.pre.label.localeCompare(right.pre.label) ||
    left.pre.number - right.pre.number
  );
}

/** @returns true pour une pré-version (`3.4.0-rc1`), false pour une release (`3.4.0`) */
export function isPrerelease(version: string): boolean {
  return parse(version).pre !== null;
}
