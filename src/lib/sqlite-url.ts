import path from "node:path";

/**
 * Prisma CLI resolves `file:./prod.db` next to schema.prisma (prisma/prod.db).
 * Prisma Client resolves it from process.cwd() (repo root). Align both to prisma/.
 */
export function resolveSqliteUrl(
  raw: string | undefined,
  cwd = process.cwd()
): string | undefined {
  if (!raw || !raw.startsWith("file:")) return raw;
  const rest = raw.slice("file:".length);
  if (rest.startsWith("//")) return raw;
  const relative = rest.replace(/^\.\//, "");
  if (path.isAbsolute(relative)) {
    return `file:${relative.replace(/\\/g, "/")}`;
  }
  const nested =
    relative === "prisma" ||
    relative.startsWith(`prisma${path.sep}`) ||
    relative.startsWith("prisma/");
  const abs = nested
    ? path.join(cwd, relative)
    : path.join(cwd, "prisma", relative);
  return `file:${abs.replace(/\\/g, "/")}`;
}
