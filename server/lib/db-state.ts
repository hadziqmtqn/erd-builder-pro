/**
 * Shared database readiness state.
 *
 * Extracted from server/run.ts to break the circular dependency:
 *   server/index.ts → routes/auth.ts → server/run.ts → server/index.ts
 *
 * When run.ts imports app from ./index.js but is itself loaded (via auth.ts)
 * before index.ts finishes executing, app is undefined — causing app.listen()
 * to crash with "Cannot read properties of undefined (reading 'listen')".
 *
 * This module has zero imports, so it can be loaded by any file without risk
 * of circular dependency.
 */

let dbReady = false;
let dbError = false;
let dbErrorMessage = "";

export function isDbReady(): boolean {
  return dbReady;
}

export function getDbError(): { error: boolean; message: string } {
  return { error: dbError, message: dbErrorMessage };
}

export function setDbReady(): void {
  dbReady = true;
}

export function setDbError(message: string): void {
  dbError = true;
  dbErrorMessage = message;
}
