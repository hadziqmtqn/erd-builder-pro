import { describe, expect, it } from "vitest";
import { normalizeHistoryEntityType, parseRevisionChanges } from "./entity-history";

describe("entity history normalization", () => {
  it("accepts legacy singular and current plural entity types", () => {
    expect(normalizeHistoryEntityType("note")).toBe("notes");
    expect(normalizeHistoryEntityType("diagrams")).toBe("diagrams");
    expect(normalizeHistoryEntityType("projects")).toBeNull();
  });

  it("reads legacy and string-wrapped snapshots without exposing unrelated fields", () => {
    const note = parseRevisionChanges("notes", JSON.stringify({
      title: "Before",
      content: "<p>Safe</p>",
      share_token: "secret",
      user_id: "private",
    }));

    expect(note.snapshot).toEqual({ title: "Before", content: "<p>Safe</p>", project_id: null });
  });

  it("strips production database credentials from historical diagram data", () => {
    const revision = parseRevisionChanges("diagrams", {
      source_type: "production_db",
      data: JSON.stringify({
        _type: "production_db_positions",
        nodes: { users: { x: 10, y: 20 } },
        viewport: { x: 1, y: 2, zoom: 0.8 },
        source: { password: "must-not-leak" },
      }),
    });

    expect(revision.snapshot.data).toEqual({
      _type: "production_db_positions",
      nodes: { users: { x: 10, y: 20 } },
      viewport: { x: 1, y: 2, zoom: 0.8 },
      dbml_source: "",
      schema_fingerprint: null,
    });
  });
});
