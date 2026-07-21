import { describe, expect, it } from "vitest";
import { isUuid, replaceColumnIdInHandle } from "./erd-column-id-migration";

describe("startup migration helpers", () => {
  it("detects legacy column ids and rewrites relationship handles", () => {
    const uuid = "018f3f7e-1c33-73f2-a4e4-19b55e61d3fa";

    expect(isUuid(uuid)).toBe(true);
    expect(isUuid("col_1720000000_0")).toBe(false);
    expect(replaceColumnIdInHandle("col-col_1720000000_0-source", "col_1720000000_0", uuid))
      .toBe(`col-${uuid}-source`);
    expect(replaceColumnIdInHandle("col-col_1720000000_01-source", "col_1720000000_0", uuid))
      .toBe("col-col_1720000000_01-source");
  });
});
