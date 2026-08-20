import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { testConnection, getConnector } from "../../lib/db-connectors/registry.js";
import { encrypt } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";
import { buildAccountConnectionInfo, buildConnectionInfo, maskPassword } from "./middleware.js";
import * as accountsService from "./accounts.service.js";
import { quoteIdentifier } from "./record-helpers.js";
import { assertWritable } from "../../lib/db-connectors/security.js";

const DATABASE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/;
const ENVIRONMENTS = new Set(["local", "development", "staging", "production"]);
const SAFE_MODES = new Set(["normal", "protected", "read-only"]);
const SSL_MODES = new Set(["disable", "require", "verify-ca", "verify-full"]);

function securityFields(body: any) {
  const environment = String(body.environment || "development");
  const safeMode = String(body.safeMode || "protected");
  const sslMode = String(body.sslMode || "disable");
  if (!ENVIRONMENTS.has(environment) || !SAFE_MODES.has(safeMode) || !SSL_MODES.has(sslMode)) {
    throw new Error("Invalid connection security settings");
  }
  return {
    environment,
    safeMode,
    sslMode,
    sslCa: String(body.sslCa || "").trim() || null,
    sslCert: String(body.sslCert || "").trim() || null,
    sslKey: String(body.sslKey || "").trim() || null,
    queryTimeoutMs: Math.min(Math.max(Number(body.queryTimeoutMs) || 30_000, 1_000), 600_000),
  };
}

export async function listAccounts(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  try {
    const accounts = await accountsService.findAllAccounts(userId);
    res.json((accounts || []).map(maskPassword));
  } catch (err) {
    console.error("Error listing accounts:", err);
    res.status(500).json({ error: "Failed to list accounts" });
  }
}

export async function createAccount(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { name, type, host, port, user, password } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: "name and type are required" });
  }

  try {
    const encryptedPw = password ? encrypt(password) : null;
    const account = await accountsService.createAccount({
      userId,
      name,
      type,
      host,
      port: port ? Number(port) : null,
      user,
      password: encryptedPw,
      ...securityFields(req.body),
    });
    res.status(201).json(maskPassword(account as any));
  } catch (err) {
    console.error("Error creating account:", err);
    res.status(500).json({ error: "Failed to create account" });
  }
}

export async function updateAccount(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, type, host, port, user, password } = req.body;

  try {
    const existing = await accountsService.findAccountById(id, userId);
    if (!existing) return res.status(404).json({ error: "Account not found" });

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (host !== undefined) data.host = host;
    if (port !== undefined) data.port = Number(port);
    if (user !== undefined) data.user = user;
    if (password !== undefined) {
      data.password = password ? encrypt(password) : null;
    }
    Object.assign(data, securityFields({ ...existing, ...req.body }));

    const updated = await accountsService.updateAccount(id, data);
    res.json(maskPassword(updated as any));
  } catch (err) {
    console.error("Error updating account:", err);
    res.status(500).json({ error: "Failed to update account" });
  }
}

export async function deleteAccount(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const existing = await accountsService.findAccountById(id, userId);
    if (!existing) return res.status(404).json({ error: "Account not found" });

    // A DB Client cannot function without its catalog, so remove both the new
    // record and its hidden legacy source before the account cascades catalogs.
    const catalogIds = (existing as any).catalogs?.map((c: any) => c.id) ?? [];
    let deletedClients = 0;
    if (catalogIds.length > 0) {
      const catalogs = await import("./catalogs.service.js");
      for (const catalogId of catalogIds) {
        deletedClients += await catalogs.deleteDbClientsForCatalog(catalogId);
        await catalogs.deleteDiagramsForCatalog(catalogId);
      }
    }

    await accountsService.deleteAccount(id);
    res.json({ success: true, deletedClients });
  } catch (err) {
    console.error("Error deleting account:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
}

export async function testAccountConnection(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const account = await accountsService.findAccountById(id, userId);
    if (!account) return res.status(404).json({ error: "Account not found" });

    const firstCatalog = await accountsService.findFirstCatalog(id);
    const probeDb = (account as any).type === "sqlite"
      ? firstCatalog?.databaseName || (account as any).host
      : firstCatalog?.databaseName || "postgres";

    const result = await testConnection(buildAccountConnectionInfo(account, probeDb));

    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: "Connection successful" });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
}

export async function testRawCredentials(req: ExpressRequest, res: ExpressResponse) {
  const { type, host, port, user, password } = req.body;
  if (!type) return res.status(400).json({ error: "type is required" });

  try {
    const probeDb = type === "postgresql" ? "postgres" : type === "mysql" ? "mysql" : host;
    const result = await testConnection(buildConnectionInfo({ type, host, port, user, password, database: probeDb, ...securityFields(req.body) }));
    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: "Connection successful" });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
}

export async function testAccountProbe(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { database } = req.body;

  if (!database) return res.status(400).json({ error: "database name required" });

  try {
    const account = await accountsService.findAccountById(id, userId);
    if (!account) return res.status(404).json({ error: "Account not found" });

    const result = await testConnection(buildAccountConnectionInfo(account, database));

    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: `Connected to database "${database}"` });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
}

export async function listDatabases(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const account = await accountsService.findAccountById(id, userId);
    if (!account) return res.status(404).json({ error: "Account not found" });

    const type = (account as any).type;
    let databases: string[] = [];

    if (type === "postgresql") {
      const pgConn = getConnector("postgresql");
      const { client, release } = await pgConn.connect(buildAccountConnectionInfo(account, "postgres"));

      try {
        const pgClient = client as any;
        const result = await pgClient.query(
          "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
        );
        databases = result.rows.map((r: any) => r.datname);
      } finally {
        release();
      }
    } else if (type === "mysql") {
      const mysqlConn = getConnector("mysql");
      const { client, release } = await mysqlConn.connect(buildAccountConnectionInfo(account, "information_schema"));

      try {
        const mysqlClient = client as any;
        const [rows] = await mysqlClient.execute("SHOW DATABASES");
        databases = (rows as any[]).map((r: any) => r.Database).filter(Boolean);
      } finally {
        release();
      }
    } else {
      return res.status(400).json({ error: "Listing databases not supported for this type" });
    }

    const existingNames = new Set(
      (await accountsService.findAllCatalogsByAccountId(id))?.map((c) => c.databaseName) ?? []
    );

    res.json({
      databases: databases.map((name) => ({
        name,
        isConnected: existingNames.has(name),
      })),
    });
  } catch (err: any) {
    console.error("Error listing databases:", err);
    res.status(500).json({ error: `Failed to list databases: ${err.message}` });
  }
}

export async function createDatabase(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const name = String(req.body?.name || "").trim();

  if (!DATABASE_NAME_RE.test(name)) {
    return res.status(400).json({ error: "Invalid database name" });
  }

  try {
    const account = await accountsService.findAccountById(id, userId);
    if (!account) return res.status(404).json({ error: "Account not found" });

    const type = (account as any).type;
    if (type !== "postgresql" && type !== "mysql") {
      return res.status(400).json({ error: "Creating databases is not supported for this type" });
    }
    assertWritable(buildAccountConnectionInfo(account, type === "postgresql" ? "postgres" : "information_schema"));

    const connector = getConnector(type);
    const { client, release } = await connector.connect(buildAccountConnectionInfo(account, type === "postgresql" ? "postgres" : "information_schema"));

    try {
      if (type === "postgresql") {
        const exists = await (client as any).query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
        if (exists.rowCount > 0) return res.status(409).json({ error: "Database already exists" });
        await (client as any).query(`CREATE DATABASE ${quoteIdentifier(type, name)}`);
      } else {
        const [rows] = await (client as any).execute("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [name]);
        if ((rows as any[]).length > 0) return res.status(409).json({ error: "Database already exists" });
        await (client as any).execute(`CREATE DATABASE ${quoteIdentifier(type, name)}`);
      }
      res.status(201).json({ name, isConnected: false });
    } finally {
      release();
    }
  } catch (err: any) {
    console.error("Error creating database:", err);
    res.status(/Safe Mode/.test(err.message) ? 403 : 500).json({ error: `Failed to create database: ${err.message}` });
  }
}
