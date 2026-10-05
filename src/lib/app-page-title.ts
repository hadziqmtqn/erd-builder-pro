const APP_NAME = "ERD Builder Pro";

type AppPageTitleOptions = {
  pathname: string;
  activeFileName: string | null;
  breadcrumbLabel: string | null;
  featureLabel: string;
  searchFeature: string | null;
};

export function getAppPageTitle({
  pathname,
  activeFileName,
  breadcrumbLabel,
  featureLabel,
  searchFeature,
}: AppPageTitleOptions): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const isFileRoute = /^\/(?:notes|diagrams|db-client|flowcharts|drawings)\/[^/]+$/.test(path);

  if (isFileRoute && activeFileName) return `${activeFileName} | ${APP_NAME}`;
  if (path === "/") return `Dashboard | ${APP_NAME}`;
  if (path === "/trash") return `Trash | ${APP_NAME}`;
  if (path === "/team-workspaces") return `Team Workspaces | ${APP_NAME}`;
  if (path === "/users") return `User Management | ${APP_NAME}`;
  if (path.startsWith("/teams/")) return `${breadcrumbLabel || "Team management"} | ${APP_NAME}`;
  if (path === "/table/db-client") return `DB Client | ${APP_NAME}`;
  if (path.startsWith("/table/")) return `${breadcrumbLabel || featureLabel || "Tables"} | ${APP_NAME}`;
  if (path.startsWith("/notes/")) return `Notes | ${APP_NAME}`;
  if (path.startsWith("/diagrams/")) return `${searchFeature === "db-client" ? "DB Client" : "Diagram"} | ${APP_NAME}`;
  if (path.startsWith("/db-client/")) return `${breadcrumbLabel || "DB Client"} | ${APP_NAME}`;
  if (path.startsWith("/flowcharts/")) return `Flowchart | ${APP_NAME}`;
  if (path.startsWith("/drawings/")) return `Drawing | ${APP_NAME}`;
  return APP_NAME;
}
