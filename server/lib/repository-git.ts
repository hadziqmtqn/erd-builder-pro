import { execFile } from "node:child_process";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WORKTREE_REF = "WORKTREE";
const MAX_SOURCE_FILES = 500;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export type RepositorySourceKind = "dbml" | "sql" | "laravel";

export interface RepositorySource {
  id: string;
  kind: RepositorySourceKind;
  label: string;
  path: string;
  fileCount: number;
}

export interface RepositoryFile {
  path: string;
  content: string;
}

export class RepositoryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function git(repositoryPath: string, args: string[]) {
  try {
    const result = await execFileAsync("git", ["-C", repositoryPath, ...args], {
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 12 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
    });
    return result.stdout.trim();
  } catch (error: any) {
    if (error?.code === "ENOENT") throw new RepositoryError("Git is not installed or is unavailable");
    throw new RepositoryError(String(error?.stderr || error?.message || "Git command failed").trim());
  }
}

export async function resolveRepositoryRoot(inputPath: string) {
  const candidate = path.resolve(inputPath);
  const info = await stat(candidate).catch(() => null);
  if (!info?.isDirectory()) throw new RepositoryError("Repository directory was not found");
  const root = await git(candidate, ["rev-parse", "--show-toplevel"]);
  return realpath(root);
}

async function resolveCommit(root: string, ref: string) {
  const requested = ref === WORKTREE_REF ? "HEAD" : ref;
  try {
    return await git(root, ["rev-parse", "--verify", `${requested}^{commit}`]);
  } catch {
    throw new RepositoryError(`Git ref not found: ${ref}`);
  }
}

async function listPaths(root: string, ref: string) {
  const output = ref === WORKTREE_REF
    ? await git(root, ["ls-files", "--cached", "--others", "--exclude-standard"])
    : await git(root, ["ls-tree", "-r", "--name-only", await resolveCommit(root, ref)]);
  return output.split("\n").map(value => value.trim()).filter(Boolean);
}

function migrationRoot(filePath: string) {
  const parts = filePath.split("/");
  const index = parts.lastIndexOf("migrations");
  return index >= 0 ? parts.slice(0, index + 1).join("/") : null;
}

export function discoverRepositorySources(paths: string[]): RepositorySource[] {
  const files = [...new Set(paths.map(value => value.replaceAll("\\", "/")))].sort();
  const sources: RepositorySource[] = [];
  const laravel = files.filter(file => /^database\/migrations\/[^/]+\.php$/i.test(file));
  if (laravel.length) {
    sources.push({
      id: "laravel:database/migrations",
      kind: "laravel",
      label: "Laravel migrations",
      path: "database/migrations",
      fileCount: laravel.length,
    });
  }

  for (const file of files.filter(file => file.toLowerCase().endsWith(".dbml"))) {
    sources.push({ id: `dbml:${file}`, kind: "dbml", label: file, path: file, fileCount: 1 });
  }

  const sqlGroups = new Map<string, string[]>();
  for (const file of files.filter(file => file.toLowerCase().endsWith(".sql"))) {
    const root = migrationRoot(file);
    if (root) sqlGroups.set(root, [...(sqlGroups.get(root) || []), file]);
    else if (/(^|\/)schema\.sql$/i.test(file)) {
      sources.push({ id: `sql:${file}`, kind: "sql", label: file, path: file, fileCount: 1 });
    }
  }
  for (const [root, group] of sqlGroups) {
    sources.push({ id: `sql:${root}`, kind: "sql", label: `${root} (${group.length} files)`, path: root, fileCount: group.length });
  }

  return sources;
}

async function listRefs(root: string) {
  const currentRef = await git(root, ["symbolic-ref", "--quiet", "HEAD"]).catch(() => "");
  const output = await git(root, [
    "for-each-ref",
    "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)",
    "refs/heads",
    "refs/remotes",
  ]);
  const refs = output.split("\n").filter(Boolean).map(line => {
    const [value, name, commit, committedAt] = line.split("\t");
    return { value, name, commit, committedAt, current: value === currentRef };
  }).filter(item => !item.name.endsWith("/HEAD"));

  const log = await git(root, ["log", "--all", "-n", "50", "--date=iso-strict", "--pretty=format:%H%x09%h%x09%ad%x09%s"]);
  const commits = log.split("\n").filter(Boolean).map(line => {
    const [value, short, committedAt, ...subject] = line.split("\t");
    return { value, short, committedAt, subject: subject.join("\t") };
  });
  return { currentRef: currentRef || "HEAD", refs, commits };
}

export async function inspectRepository(inputPath: string, ref = WORKTREE_REF) {
  const root = await resolveRepositoryRoot(inputPath);
  const [gitRefs, paths, commit] = await Promise.all([
    listRefs(root),
    listPaths(root, ref),
    resolveCommit(root, ref),
  ]);
  return {
    root,
    selectedRef: ref,
    commit,
    ...gitRefs,
    sources: discoverRepositorySources(paths),
  };
}

function sourcePaths(source: RepositorySource, paths: string[]) {
  if (source.fileCount === 1) return [source.path];
  const prefix = `${source.path.replace(/\/$/, "")}/`;
  const extension = source.kind === "laravel" ? ".php" : ".sql";
  return paths.filter(file => file.startsWith(prefix) && file.toLowerCase().endsWith(extension)).sort();
}

async function readWorktreeFile(root: string, relativePath: string) {
  const absolute = path.resolve(root, relativePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!absolute.startsWith(rootPrefix)) throw new RepositoryError("Schema source is outside the repository");
  const info = await lstat(absolute).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) throw new RepositoryError(`Schema file not found: ${relativePath}`);
  const canonical = await realpath(absolute);
  if (!canonical.startsWith(rootPrefix)) throw new RepositoryError("Schema source is outside the repository");
  return readFile(canonical, "utf8");
}

export async function readRepositorySource(inputPath: string, ref: string, sourceId: string) {
  const root = await resolveRepositoryRoot(inputPath);
  const paths = await listPaths(root, ref);
  const source = discoverRepositorySources(paths).find(item => item.id === sourceId);
  if (!source) throw new RepositoryError("Schema source was not found at the selected Git ref", 404);
  const selectedPaths = sourcePaths(source, paths);
  if (selectedPaths.length === 0 || selectedPaths.length > MAX_SOURCE_FILES) {
    throw new RepositoryError(`Schema source must contain between 1 and ${MAX_SOURCE_FILES} files`);
  }

  const commit = await resolveCommit(root, ref);
  const files: RepositoryFile[] = [];
  let totalBytes = 0;
  for (const relativePath of selectedPaths) {
    const content = ref === WORKTREE_REF
      ? await readWorktreeFile(root, relativePath)
      : await git(root, ["show", `${commit}:${relativePath}`]);
    totalBytes += Buffer.byteLength(content);
    if (totalBytes > MAX_SOURCE_BYTES) throw new RepositoryError("Schema source exceeds the 5 MB limit");
    files.push({ path: relativePath, content });
  }
  return { root, ref, commit, source, files };
}

export { WORKTREE_REF };
