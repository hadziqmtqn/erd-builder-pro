import { expect, it, vi } from "vitest";

const { project } = vi.hoisted(() => ({ project: { findFirst: vi.fn(), create: vi.fn() } }));
vi.mock("../../lib/prisma.js", () => ({ prisma: { project } }));

import { importProjects } from "./importers.js";
import { resolveProjectId } from "./helpers.js";

it("links files to a project whether they point at its exported numeric id or its uid (BUG-066)", async () => {
  project.findFirst.mockResolvedValue(null);
  project.create.mockResolvedValue({ id: 7 });
  const stats = { projects: 0, skipped_existing: 0 } as any;
  const res = { write: vi.fn() } as any;

  const { nameToDbId, guestIdToName } = await importProjects(
    [{ id: 1, uid: "43a11435-1ee0-46f3-8ea2-47f50535553f", name: "QA Project" }],
    "user-1", stats, res, 0, 1,
  );

  expect(resolveProjectId(1, undefined, nameToDbId, guestIdToName)).toBe(7);
  expect(resolveProjectId("43a11435-1ee0-46f3-8ea2-47f50535553f", undefined, nameToDbId, guestIdToName)).toBe(7);
  expect(resolveProjectId(2, undefined, nameToDbId, guestIdToName)).toBeNull();
  expect(stats.projects).toBe(1);
});
