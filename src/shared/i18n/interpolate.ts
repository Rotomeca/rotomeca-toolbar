/** Valeurs des `{nom}` d'un texte traduit. */
export type Variables = Readonly<Record<string, string | number>>;

/**
 * Remplace les `{nom}` d'un texte par les valeurs données. Un `{nom}` sans valeur reste tel
 * quel. Seules les propriétés propres comptent : `{constructor}` n'est jamais remplacé.
 */
export function interpolate(text: string, variables: Variables = {}): string {
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = Object.hasOwn(variables, name) ? variables[name] : undefined;
    return value === undefined ? placeholder : String(value);
  });
}
