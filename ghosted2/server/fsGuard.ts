// Workspace confinement. Mirrors the Electron app's `assertAllowed` philosophy:
// every path the agent hands us is resolved and proven to live inside the root
// before any fs call touches it.

import path from 'node:path';

export interface Guard {
  /** absolute, resolved workspace root */
  root: string;
  /** returns the resolved absolute path, or throws if it escapes the root */
  assertAllowed(p: string): string;
}

export function createGuard(root: string): Guard {
  const resolvedRoot = path.resolve(root);

  return {
    root: resolvedRoot,
    assertAllowed(p: string): string {
      // path.resolve handles both absolute inputs and root-relative ones.
      const target = path.resolve(resolvedRoot, p);
      // The `+ path.sep` guard stops `/rootfoo` from passing as inside `/root`.
      if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
        throw new Error('path outside workspace');
      }
      return target;
    },
  };
}
