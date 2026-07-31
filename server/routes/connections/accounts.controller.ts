import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { testConnection, getConnector } from "../../lib/db-connectors/registry.js";
import { encrypt } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";
import { buildConnectionInfo, maskPassword } from "./middleware.js";
import * as accountsService from "./accounts.service.js";
import { quoteIdentifier } from "./record-helpers.js";

const DATABASE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/;

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
    });
    res.status(201).json(account);
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

    const updated = await accountsService.updateAccount(id, data);
    res.json(updated);
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

    // Detach diagrams referencing any catalog of this account
    const catalogIds = (existing as any).catalogs?.map((c: any) => c.id) ?? [];
    if (catalogIds.length > 0) {
      const { detachDiagramsFromCatalogs } = await import("./catalogs.service.js");
      await detachDiagramsFromCatalogs(catalogIds);
    }

    await accountsService.deleteAccount(id);
    res.json({ success: true, detachedDiagrams: catalogIds.length });
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

    const result = await testConnection(buildConnectionInfo({
      type: (account as any).type,
      host: (account as any).host,
      port: (account as any).port,
      user: (account as any).user,
      password: (account as any).password,
      database: probeDb,
    }));

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
    const result = await testConnection({ type, host, port, user, password, database: probeDb } as any);
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

    const result = await testConnection(buildConnectionInfo({
      type: (account as any).type,
      host: (account as any).host,
      port: (account as any).port,
      user: (account as any).user,
      password: (account as any).password,
      database,
    }));

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
      const { client, release } = await pgConn.connect(buildConnectionInfo({
        type, host: (account as any).host, port: (account as any).port,
        user: (account as any).user, password: (account as any).password,
        database: "postgres",
      }));

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
      const { client, release } = await mysqlConn.connect(buildConnectionInfo({
        type, host: (account as any).host, port: (account as any).port,
        user: (account as any).user, password: (account as any).password,
        database: "information_schema",
      }));

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

    const connector = getConnector(type);
    const { client, release } = await connector.connect(buildConnectionInfo({
      type,
      host: (account as any).host,
      port: (account as any).port,
      user: (account as any).user,
      password: (account as any).password,
      database: type === "postgresql" ? "postgres" : "information_schema",
    }));

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
    res.status(500).json({ error: `Failed to create database: ${err.message}` });
  }
}
