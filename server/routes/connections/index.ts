import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { desktopOnly } from "./middleware.js";

// ── Accounts ──
import * as accountsController from "./accounts.controller.js";

const accountsRouter = Router();
accountsRouter.get("/", authenticate, desktopOnly, accountsController.listAccounts);
accountsRouter.post("/", authenticate, desktopOnly, accountsController.createAccount);
accountsRouter.put("/:id", authenticate, desktopOnly, accountsController.updateAccount);
accountsRouter.delete("/:id", authenticate, desktopOnly, accountsController.deleteAccount);
accountsRouter.post("/:id/test", authenticate, desktopOnly, accountsController.testAccountConnection);
accountsRouter.post("/test-cred", authenticate, desktopOnly, accountsController.testRawCredentials);
accountsRouter.post("/:id/test-probe", authenticate, desktopOnly, accountsController.testAccountProbe);
accountsRouter.post("/:id/databases", authenticate, desktopOnly, accountsController.listDatabases);

// ── Catalogs ──
import * as catalogsController from "./catalogs.controller.js";

const catalogsRouter = Router();
catalogsRouter.get("/", authenticate, desktopOnly, catalogsController.listCatalogs);
catalogsRouter.post("/", authenticate, desktopOnly, catalogsController.createCatalog);
catalogsRouter.delete("/:id", authenticate, desktopOnly, catalogsController.deleteCatalog);
catalogsRouter.post("/:id/schema", authenticate, desktopOnly, catalogsController.fetchCatalogSchema);
catalogsRouter.post("/:id/import", authenticate, desktopOnly, catalogsController.importSchema);
catalogsRouter.post("/:id/records", authenticate, desktopOnly, catalogsController.queryRecords);
catalogsRouter.post("/:id/records/create", authenticate, desktopOnly, catalogsController.createRecord);
catalogsRouter.patch("/:id/records", authenticate, desktopOnly, catalogsController.updateRecord);
catalogsRouter.delete("/:id/records", authenticate, desktopOnly, catalogsController.deleteRecord);
catalogsRouter.patch("/:id/structure", authenticate, desktopOnly, catalogsController.updateStructure);
catalogsRouter.post("/:id/structure/sql", authenticate, desktopOnly, catalogsController.getStructureSql);

// ── Legacy backward-compat ──
import * as legacyController from "./legacy.controller.js";

const legacyRouter = Router();
legacyRouter.get("/", authenticate, desktopOnly, legacyController.listLegacyConnections);
legacyRouter.post("/test", authenticate, desktopOnly, legacyController.testLegacyConnection);
legacyRouter.post("/:id/test", authenticate, desktopOnly, legacyController.testLegacyCatalogConnection);
legacyRouter.post("/:id/schema", authenticate, desktopOnly, legacyController.fetchLegacySchema);
legacyRouter.post("/:id/import", authenticate, desktopOnly, legacyController.importLegacySchema);
legacyRouter.post("/:id/records", authenticate, desktopOnly, legacyController.queryLegacyRecords);

// ── Migration ──
import * as migrationController from "./migration.controller.js";

const router = Router();
router.use("/accounts", accountsRouter);
router.use("/catalogs", catalogsRouter);
router.use("/connections", legacyRouter);
router.post("/migrate-connections", authenticate, desktopOnly, migrationController.migrateConnections);

export default router;
