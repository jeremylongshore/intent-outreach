/**
 * tests/targeting.test.ts — deterministic buyer-title ranking (pipeline_core/targeting.ts).
 *
 * The ranking decides who gets drafted (and, in Apollo, who gets a paid reveal),
 * so it must be exact: abbreviations both ways, non-buyer penalties only when
 * targeting is on, stable ties, and the identity with no buyer titles.
 */

import { describe, expect, it } from "vitest";
import {
  cleanBuyerTitles,
  hasInitialOnlyLastName,
  normalizeTitle,
  rankContactsByTitle,
  titleScore,
} from "../pipeline_core/targeting.js";

const people = (...titles: (string | undefined)[]) => titles.map((title, i) => ({ id: `c${i}`, title }));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const titlesOf = (xs: { title?: string | undefined }[]) => xs.map((x) => x.title);

describe("normalizeTitle", () => {
  it("lowercases, strips punctuation, and expands abbreviations", () => {
    expect(normalizeTitle("Sr. VP, Ops & IT")).toBe("senior vice president operations and it");
    expect(normalizeTitle("CTO")).toBe("chief technology officer");
    expect(normalizeTitle("Chief Technical Officer")).toBe("chief technology officer");
    expect(normalizeTitle("  Head   of  Engineering ")).toBe("head of engineering");
  });
});

describe("rankContactsByTitle", () => {
  it("no buyer titles → the exact input order, as a new array (byte-identical behavior)", () => {
    const input = people("HR Manager", "CTO", "Sales Director");
    for (const titles of [undefined, [], ["", "   "]]) {
      const out = rankContactsByTitle(input, titles);
      expect(out).toEqual(input);
      expect(out).not.toBe(input);
    }
  });

  it("never mutates the input or drops a contact", () => {
    const input = people("HR Manager", "CTO", undefined, "COO");
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = rankContactsByTitle(input, ["COO"]);
    expect(input).toEqual(snapshot);
    expect([...ids(out)].sort()).toEqual([...ids(input)].sort());
  });

  it("is case-insensitive", () => {
    expect(titlesOf(rankContactsByTitle(people("Engineer", "coo"), ["COO"]))).toEqual(["coo", "Engineer"]);
    expect(titlesOf(rankContactsByTitle(people("Engineer", "COO"), ["coo"]))).toEqual(["COO", "Engineer"]);
  });

  it("matches abbreviations in both directions", () => {
    // buyer abbreviated, contact spelled out
    expect(titlesOf(rankContactsByTitle(people("Office Manager", "Chief Technology Officer"), ["CTO"]))).toEqual([
      "Chief Technology Officer",
      "Office Manager",
    ]);
    // buyer spelled out, contact abbreviated
    expect(titlesOf(rankContactsByTitle(people("Office Manager", "CTO"), ["Chief Technology Officer"]))).toEqual([
      "CTO",
      "Office Manager",
    ]);
    expect(titleScore("Chief Operating Officer", ["COO"])).toBe(100);
    expect(titleScore("CIO", ["Chief Information Officer"])).toBe(100);
    expect(titleScore("Vice President, Operations", ["VP Operations"])).toBe(100);
    expect(titleScore("VP Operations", ["Vice President of Operations"])).toBe(50); // "of" is a stopword
  });

  it("scores exact > contains > inside > all-words > none", () => {
    const buyers = ["VP Operations"];
    expect(titleScore("VP Operations", buyers)).toBe(100);
    expect(titleScore("Senior VP Operations", buyers)).toBe(80); // contains the buyer phrase
    expect(titleScore("VP", buyers)).toBe(60); // contact title inside the buyer phrase
    expect(titleScore("Operations VP", buyers)).toBe(50); // every buyer word present
    expect(titleScore("Office Manager", buyers)).toBe(0);
    expect(titleScore(undefined, buyers)).toBe(0);
    expect(titleScore("", buyers)).toBe(0);
  });

  it("handles 'Head of' titles in either word order", () => {
    expect(titleScore("Head of Operations", ["Head of Operations"])).toBe(100);
    expect(titleScore("Operations Head", ["Head of Operations"])).toBe(50);
    expect(titlesOf(rankContactsByTitle(people("Paralegal", "Head of IT"), ["Head of IT", "CTO"]))).toEqual([
      "Head of IT",
      "Paralegal",
    ]);
  });

  it("takes the best match across several buyer titles", () => {
    expect(titleScore("COO", ["CTO", "COO", "VP Operations"])).toBe(100);
  });

  it("penalizes clearly non-buyer functions below unmatched contacts", () => {
    const input = people("HR Director", "Sales Manager", "Office Manager", "Marketing Lead", "Legal Counsel", "Recruiter");
    const out = rankContactsByTitle(input, ["CTO"]);
    expect(out[0]!.title).toBe("Office Manager");
    expect(titleScore("Human Resources Manager", ["CTO"])).toBe(-50);
    expect(titleScore("Partner Attorney", ["CTO"])).toBe(-50);
    expect(titleScore("Talent Acquisition Lead", ["CTO"])).toBe(-50);
  });

  it("a matched title in a non-buyer function ranks below a matched buyer-function title", () => {
    // Buyer "VP": both contacts contain it; the Sales VP is penalized.
    expect(titlesOf(rankContactsByTitle(people("VP Sales", "VP Operations"), ["VP"]))).toEqual([
      "VP Operations",
      "VP Sales",
    ]);
  });

  it("does not penalize a function the operator asked for", () => {
    expect(titleScore("VP Sales", ["VP Sales"])).toBe(100);
    expect(titlesOf(rankContactsByTitle(people("CTO", "VP Sales"), ["VP Sales"]))).toEqual(["VP Sales", "CTO"]);
  });

  it("does not penalize anything when buyer titles are absent", () => {
    expect(titleScore("HR Director", [])).toBe(0);
    expect(ids(rankContactsByTitle(people("HR Director", "CTO"), undefined))).toEqual(["c0", "c1"]);
  });

  it("keeps input order among ties (stable)", () => {
    const input = people("Engineer", "COO", "Designer", "Chief Operating Officer", "Analyst");
    expect(ids(rankContactsByTitle(input, ["COO"]))).toEqual(["c1", "c3", "c0", "c2", "c4"]);
    const penalized = people("Sales Rep", "HR Lead", "Engineer", "Sales Lead");
    expect(ids(rankContactsByTitle(penalized, ["CTO"]))).toEqual(["c2", "c0", "c1", "c3"]);
  });

  it("ranks the live-campaign shape: the buyer beats HR, sales and a media buyer", () => {
    const input = people("HR Generalist", "Account Executive, Sales", "Media Buyer", "Partner Attorney", "COO");
    expect(rankContactsByTitle(input, ["CTO", "COO", "VP Operations"])[0]!.title).toBe("COO");
  });

  it("accepts nullish titles (Apollo people)", () => {
    const input = [{ title: null }, { title: "CTO" }];
    expect(rankContactsByTitle(input, ["CTO"])[0]!.title).toBe("CTO");
  });
});

describe("cleanBuyerTitles", () => {
  it("trims and drops blanks", () => {
    expect(cleanBuyerTitles([" CTO ", "", "  ", "COO"])).toEqual(["CTO", "COO"]);
    expect(cleanBuyerTitles(undefined)).toEqual([]);
  });
});

describe("hasInitialOnlyLastName", () => {
  it.each([
    ["Kristina L", true],
    ["Kristina L.", true],
    ["Mary Ann K", true],
    ["José Ñ.", true],
    ["Kristina Lowe", false],
    ["Kristina", false],
    ["J Smith", false],
    ["Kristina LL", false],
    ["", false],
  ] as const)("%j → %s", (name, expected) => {
    expect(hasInitialOnlyLastName(name)).toBe(expected);
  });
});
