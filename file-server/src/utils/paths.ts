import path from "path";
import config from "../config";

export class InvalidPathError extends Error {
  constructor(relativePath: string) {
    super(`Invalid or unsafe path: ${relativePath}`);
    this.name = "InvalidPathError";
  }
}

/**
 * Resolves a caller-supplied relative path against the storage root and
 * verifies the result can't escape it (rejects "../" traversal, absolute
 * paths, symlink-adjacent tricks via a boundary check on the resolved
 * string). This is the only thing standing between this service and
 * arbitrary filesystem read/write, since it has no user-level auth of
 * its own — callers are trusted backends, but a bug in a caller's path
 * construction shouldn't become a filesystem escape here too.
 */
export function resolveStoragePath(relativePath: string): string {
  if (
    !relativePath ||
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath)
  ) {
    throw new InvalidPathError(relativePath);
  }

  const resolved = path.resolve(config.storageRoot, relativePath);
  const rootWithSep = config.storageRoot.endsWith(path.sep)
    ? config.storageRoot
    : config.storageRoot + path.sep;

  if (resolved !== config.storageRoot && !resolved.startsWith(rootWithSep)) {
    throw new InvalidPathError(relativePath);
  }

  return resolved;
}
