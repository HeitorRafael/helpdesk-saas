// Slug legível a partir de um nome de empresa — usado só como identificador
// interno (URLs amigáveis futuras); não aparece mais no login.
export function slugify(input: string): string {
  // NFD separa acento da letra-base (ex: "ã" -> "a" + combining tilde);
  // filtra os combining marks (U+0300–U+036F) em vez de usar regex unicode
  // pra não depender de flag 'u'.
  const withoutAccents = input
    .normalize('NFD')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(code >= 0x0300 && code <= 0x036f);
    })
    .join('');

  const slug = withoutAccents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug || 'empresa';
}
