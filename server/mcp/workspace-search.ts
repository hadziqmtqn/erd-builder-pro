import { isAbsolute, relative, resolve, sep } from "node:path";

export const WORKSPACE_SEARCH_TYPES = [
  "projects",
  "notes",
  "flowcharts",
  "drawings",
  "diagrams",
  "db_clients",
] as const;

export type WorkspaceSearchType = (typeof WORKSPACE_SEARCH_TYPES)[number];

export function repositoryContainsPath(repositoryPath: string, candidatePath: string) {
  const child = relative(resolve(repositoryPath), resolve(candidatePath));
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

type WorkspaceRecord = Record<string, unknown>;
type WorkspaceIndex = Record<string, WorkspaceRecord[] | undefined>;

const COLLECTIONS: Array<{ key: string; type: WorkspaceSearchType; label: string; nameKey: "name" | "title" }> = [
  { key: "projects", type: "projects", label: "Projects", nameKey: "name" },
  { key: "notes", type: "notes", label: "Notes", nameKey: "title" },
  { key: "flowcharts", type: "flowcharts", label: "Flowcharts", nameKey: "title" },
  { key: "drawings", type: "drawings", label: "Drawings", nameKey: "title" },
  { key: "diagrams", type: "diagrams", label: "ERD Builder", nameKey: "name" },
  { key: "dbClients", type: "db_clients", label: "DB Client", nameKey: "name" },
];

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchWorkspaceFiles(index: WorkspaceIndex, query: string, type?: WorkspaceSearchType, limit = 20) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) throw new Error("Search query is required");
  const terms = normalizedQuery.split(" ");
  const projects = new Map(
    (index.projects ?? []).map(project => [String(project.id), project]),
  );

  return COLLECTIONS
    .filter(collection => !type || collection.type === type)
    .flatMap(collection => (index[collection.key] ?? []).map(item => {
      const name = String(item[collection.nameKey] ?? "Untitled");
      const project = collection.type === "projects" ? item : projects.get(String(item.projectId));
      const projectName = String(project?.name ?? "Workspace");
      const path = collection.type === "projects" ? `Projects > ${name}` : `${collection.label} > ${projectName} > ${name}`;
      const normalizedName = normalize(name);
      const normalizedPath = normalize(path);
      const matches = terms.every(term => normalizedPath.includes(term));
      const score = normalizedName === normalizedQuery ? 0
        : normalizedPath === normalizedQuery ? 1
          : normalizedName.startsWith(normalizedQuery) ? 2
            : normalizedName.includes(normalizedQuery) ? 3
              : matches ? 4 : Number.POSITIVE_INFINITY;
      return {
        score,
        type: collection.type,
        uid: String(item.uid ?? item.id ?? ""),
        name,
        path,
        project_uid: collection.type === "projects" ? String(item.uid ?? item.id ?? "") : project ? String(project.uid ?? project.id ?? "") : null,
        updated_at: item.updatedAt ?? null,
      };
    }))
    .filter(result => Number.isFinite(result.score) && result.uid)
    .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map(({ score: _score, ...result }) => result);
}
