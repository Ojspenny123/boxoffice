/** Single source of truth for the Box Office release. */
export const VERSION = "1.0.0";

/** Footer label, e.g. "v1.0". */
export function versionLabel(version = VERSION) {
  const [major, minor] = String(version).split(".");
  return `v${major}.${minor}`;
}
