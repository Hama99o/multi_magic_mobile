/**
 * The files before and after this one in its folder (parity audit #43): the
 * web's Lightbox steps across every file, not only pictures. Pure.
 */
export function neighbours<T extends { id: number }>(files: T[], currentId: number): { prev: T | null; next: T | null; index: number; total: number } {
  const index = files.findIndex((f) => f.id === currentId);
  if (index < 0) return { prev: null, next: null, index: -1, total: files.length };
  return { prev: files[index - 1] ?? null, next: files[index + 1] ?? null, index, total: files.length };
}
