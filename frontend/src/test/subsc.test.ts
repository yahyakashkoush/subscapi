import { describe, expect, it } from "vitest";
import { packages, price } from "../lib/subsc";
describe("Package rules", () => {
  it("offers the three requested quotas", () => {
    expect(packages.map((p) => p.amount)).toEqual([100, 200, 500]);
  });
  it("converts USD to EGP at 54", () => {
    expect(price(100, "EGP")).toBe("5,400");
    expect(price(200, "EGP")).toBe("10,800");
    expect(price(500, "EGP")).toBe("27,000");
  });
});
