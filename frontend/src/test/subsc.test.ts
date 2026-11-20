import { describe, expect, it } from "vitest";
import { packages, price } from "../lib/subsc";
describe("Package rules", () => {
  it("offers the three requested quotas", () => {
    expect(packages.map((p) => p.amount)).toEqual([50, 100, 250]);
  });
  it("converts USD to EGP at 54", () => {
    expect(price(50, "EGP")).toBe("2,700");
    expect(price(100, "EGP")).toBe("5,400");
    expect(price(250, "EGP")).toBe("13,500");
  });
});
