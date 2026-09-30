/** Appends .ts so extensionless imports resolve under Node's type stripper. */

import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return nextResolve(specifier, context);
  if (path.extname(specifier)) return nextResolve(specifier, context);
  return nextResolve(`${specifier}.ts`, context);
}
