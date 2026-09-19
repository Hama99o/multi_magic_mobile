// EXPECTED TO FAIL LINT — see README.md.
// Metro resolves requires statically; Node and Jest accept this happily.
export function load(name: string): unknown {
  try {
    return require(name);
  } catch {
    return null;
  }
}
