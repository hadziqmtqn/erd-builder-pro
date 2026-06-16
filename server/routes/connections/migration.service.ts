export async function runUserMigration(userId: string) {
  // DbAccount/DbCatalog are desktop-only (SQLite).
  // This migration converted old local_db_connections → DbAccount + DbCatalog
  // in legacy PostgreSQL schemas. No longer applicable.
  return { migrated: 0, message: "Not applicable — desktop-only feature" };
}
