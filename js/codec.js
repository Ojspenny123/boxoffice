/**
 * Light obfuscation for answers and locked clues.
 * Base64 deters casual "view source" spoiling. It is not encryption.
 */

export function decodeText(value) {
  if (value == null || value === "") return "";
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export function decodeActor(raw) {
  return {
    id: raw.id,
    tier: raw.tier,
    name: decodeText(raw.name),
    alts: (raw.alts || []).map(decodeText).filter(Boolean),
    photo: decodeText(raw.photo),
    nationality: decodeText(raw.nationality),
    flag: decodeText(raw.flag),
    birthYear: raw.birthYear,
    awards: {
      wins: raw.awards?.wins ?? 0,
      nominations: raw.awards?.nominations ?? 0,
    },
    costar: decodeText(raw.costar),
    films: (raw.films || []).map((film) => ({
      year: film.year,
      title: film.title,
      character: film.character,
      poster: film.poster || "",
      budget: film.budget ?? null,
      gross: film.gross ?? null,
    })),
  };
}
