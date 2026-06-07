import { describe, it, expect, beforeEach } from "vitest";
import { parseWrongNums, normTopic, startOfWeek } from "../src/utils.js";
import {
  normalizeTrial,
  normalizeSession,
  normalizeReview,
  normalizeImport
} from "../src/data.js";
import { DB } from "../src/state.js";
import {
  getTrialTopicTags,
  listTrialWrongEntries,
  tagsToWrongTopicTags,
  computeStreak,
  computeMastery,
  netFromCounts,
  totalNet,
  trialQuestions,
  questionsOnDate,
  minutesOnDate,
  computeAchievements,
  konuAccuracyByWeek,
  predictExamNet
} from "../src/domain.js";

function ymdAgo(n) {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - n);
  return dt.toISOString().slice(0, 10);
}
function ymdAhead(n) {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}

function resetDB() {
  DB.books = [];
  DB.sessions = [];
  DB.trials = [];
  DB.reviews = [];
  DB.settings = { examDate: "", targetNet: null, theme: "dark" };
}

describe("parseWrongNums", () => {
  it("parses mixed separators, dedupes and sorts", () => {
    expect(parseWrongNums("3, 7; 12 7\n1")).toEqual([1, 3, 7, 12]);
  });
  it("ignores zero, negatives and non-numbers", () => {
    expect(parseWrongNums("0, -2, abc, 5")).toEqual([5]);
  });
  it("returns [] for empty / nullish input", () => {
    expect(parseWrongNums("")).toEqual([]);
    expect(parseWrongNums(null)).toEqual([]);
    expect(parseWrongNums("   ")).toEqual([]);
  });
  it("rejects absurdly large numbers", () => {
    expect(parseWrongNums("100000")).toEqual([]);
  });
});

describe("normTopic", () => {
  it("normalizes case, separators and 'dönemi' suffix", () => {
    expect(normTopic("Osmanlı  Kuruluş")).toBe("osmanlı kuruluş");
    expect(normTopic("Cumhuriyet Dönemi")).toBe("cumhuriyet");
  });
});

describe("netFromCounts / totalNet", () => {
  it("applies the 0.25 wrong penalty", () => {
    expect(netFromCounts(20, 4)).toBe(19);
  });
  it("totals section nets", () => {
    const t = normalizeTrial({
      id: "t1",
      date: "2026-01-01",
      counts: { turkce: { d: 10, y: 0 }, matematik: { d: 8, y: 4 } }
    });
    expect(totalNet(t)).toBeCloseTo(10 + 7, 5);
  });
});

describe("normalizeTrial", () => {
  it("derives net from counts (data integrity)", () => {
    const t = normalizeTrial({ id: "t1", date: "2026-01-01", counts: { turkce: { d: 10, y: 8 } } });
    expect(t.nets.turkce).toBeCloseTo(8, 5);
  });
  it("drops records without id or date", () => {
    expect(normalizeTrial({ date: "2026-01-01" })).toBeNull();
    expect(normalizeTrial({ id: "x" })).toBeNull();
  });
  it("clamps negative counts to 0", () => {
    const t = normalizeTrial({ id: "t", date: "2026-01-01", counts: { turkce: { d: -5, y: -2 } } });
    expect(t.counts.turkce).toEqual({ d: 0, y: 0 });
  });
});

describe("getTrialTopicTags legacy migration", () => {
  it("converts the legacy wrongTopics array shape", () => {
    const tags = getTrialTopicTags({ wrongTopics: { tarih: ["Selçuklular", "Osmanlı Kuruluş"] } });
    expect(tags).toEqual({ tarih: { Selçuklular: "", "Osmanlı Kuruluş": "" } });
  });
  it("prefers explicit wrongTopicTags when present", () => {
    const tags = getTrialTopicTags({
      wrongTopicTags: { tarih: { Selçuklular: "Dikkatsizlik" } },
      wrongTopics: { tarih: ["Osmanlı Kuruluş"] }
    });
    expect(tags).toEqual({ tarih: { Selçuklular: "Dikkatsizlik" } });
  });
});

describe("tagsToWrongTopicTags", () => {
  it("splits 'section|topic' ids into a nested map", () => {
    const out = tagsToWrongTopicTags({ "tarih|Osmanlı Kuruluş": "Bilgi eksiği", "turkce|Paragraf": "" });
    expect(out).toEqual({
      tarih: { "Osmanlı Kuruluş": "Bilgi eksiği" },
      turkce: { Paragraf: "" }
    });
  });
  it("handles topics that themselves contain a pipe", () => {
    const out = tagsToWrongTopicTags({ "tarih|A|B": "x" });
    expect(out).toEqual({ tarih: { "A|B": "x" } });
  });
});

describe("listTrialWrongEntries", () => {
  it("flattens nested tags into entries", () => {
    const entries = listTrialWrongEntries({
      wrongTopicTags: { tarih: { Selçuklular: "Dikkatsizlik", "Osmanlı Kuruluş": "" } }
    });
    expect(entries).toEqual([
      { section: "tarih", topic: "Selçuklular", reason: "Dikkatsizlik" },
      { section: "tarih", topic: "Osmanlı Kuruluş", reason: "" }
    ]);
  });
});

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    const d = (n) => {
      const dt = new Date();
      dt.setHours(0, 0, 0, 0);
      dt.setDate(dt.getDate() - n);
      return dt.toISOString().slice(0, 10);
    };
    const counts = { [d(0)]: 1, [d(1)]: 2, [d(2)]: 1, [d(4)]: 1 };
    expect(computeStreak(counts).current).toBe(3);
    expect(computeStreak(counts).longest).toBe(3);
  });
  it("is 0 with no activity", () => {
    expect(computeStreak({})).toEqual({ current: 0, longest: 0 });
  });
});

describe("computeMastery", () => {
  beforeEach(resetDB);
  it("scores topics from session accuracy and trial flags", () => {
    DB.sessions = [normalizeSession({ id: "s1", date: "2026-01-01", lesson: "tarih", topic: "Selçuklular", total: 10, wrong: [1, 2] })];
    const m = computeMastery();
    const sel = m.find((x) => x.topic === "Selçuklular");
    expect(sel.score).toBe(80); // (10-2)/10*100
  });
  it("penalizes trial-only topics", () => {
    DB.trials = [normalizeTrial({ id: "t1", date: "2026-01-01", wrongTopicTags: { turkce: { Paragraf: "" } } })];
    const m = computeMastery();
    const p = m.find((x) => x.topic === "Paragraf");
    expect(p.hasKonu).toBe(false);
    expect(p.score).toBe(60); // 70 - 10
  });
});

describe("startOfWeek", () => {
  it("returns the Monday of the week", () => {
    // 2026-05-29 is a Friday → Monday is 2026-05-25
    expect(startOfWeek("2026-05-29")).toBe("2026-05-25");
    // 2026-05-25 is already Monday
    expect(startOfWeek("2026-05-25")).toBe("2026-05-25");
    // 2026-05-31 is Sunday → still 2026-05-25
    expect(startOfWeek("2026-05-31")).toBe("2026-05-25");
  });
});

describe("trialQuestions / questionsOnDate / minutesOnDate", () => {
  beforeEach(resetDB);
  it("counts correct + wrong across sections", () => {
    const t = normalizeTrial({
      id: "t1",
      date: "2026-01-01",
      counts: { turkce: { d: 20, y: 5 }, matematik: { d: 10, y: 2 } }
    });
    expect(trialQuestions(t)).toBe(37);
  });
  it("sums session totals and trial questions on a date", () => {
    DB.sessions = [normalizeSession({ id: "s1", date: "2026-01-01", lesson: "tarih", topic: "X", total: 20, wrong: [1] })];
    DB.trials = [normalizeTrial({ id: "t1", date: "2026-01-01", counts: { turkce: { d: 10, y: 0 } } })];
    expect(questionsOnDate("2026-01-01")).toBe(30);
    expect(questionsOnDate("2026-01-02")).toBe(0);
  });
  it("sums durations on a date", () => {
    DB.sessions = [normalizeSession({ id: "s1", date: "2026-01-01", lesson: "tarih", topic: "X", total: 10, duration: 15 })];
    DB.trials = [normalizeTrial({ id: "t1", date: "2026-01-01", duration: 100, counts: { turkce: { d: 1, y: 0 } } })];
    expect(minutesOnDate("2026-01-01")).toBe(115);
  });
});

describe("computeAchievements", () => {
  beforeEach(resetDB);
  it("marks perfect-score achievement once a full session exists", () => {
    DB.sessions = [normalizeSession({ id: "s1", date: ymdAgo(0), lesson: "tarih", topic: "X", total: 10, wrong: [] })];
    const a = computeAchievements();
    const perfect = a.find((x) => x.id === "perfect");
    expect(perfect.unlocked).toBe(true);
  });
  it("keeps high-bar achievements locked with little data", () => {
    DB.trials = [normalizeTrial({ id: "t1", date: ymdAgo(0), counts: { turkce: { d: 5, y: 0 } } })];
    const a = computeAchievements();
    expect(a.find((x) => x.id === "q1000").unlocked).toBe(false);
  });
});

describe("konuAccuracyByWeek", () => {
  beforeEach(resetDB);
  it("groups sessions by week and computes accuracy", () => {
    DB.sessions = [
      normalizeSession({ id: "s1", date: "2026-05-25", lesson: "tarih", topic: "X", total: 10, wrong: [1, 2] }),
      normalizeSession({ id: "s2", date: "2026-05-27", lesson: "tarih", topic: "Y", total: 10, wrong: [] })
    ];
    const series = konuAccuracyByWeek();
    expect(series).toHaveLength(1);
    expect(series[0].week).toBe("2026-05-25");
    expect(series[0].accuracy).toBe(90); // (20-2)/20
  });
});

describe("predictExamNet", () => {
  beforeEach(resetDB);
  it("returns null without enough data or exam date", () => {
    expect(predictExamNet()).toBeNull();
  });
  it("projects an upward trend toward the exam date", () => {
    DB.settings = { ...DB.settings, examDate: ymdAhead(30) };
    DB.trials = [
      normalizeTrial({ id: "t1", date: ymdAgo(20), counts: { turkce: { d: 10, y: 0 } } }),
      normalizeTrial({ id: "t2", date: ymdAgo(10), counts: { turkce: { d: 20, y: 0 } } })
    ];
    const p = predictExamNet();
    expect(p).not.toBeNull();
    expect(p.predicted).toBeGreaterThan(20);
    expect(p.perWeek).toBeGreaterThan(0);
  });
});

describe("normalizeImport", () => {
  it("rejects non-objects", () => {
    expect(() => normalizeImport(null)).toThrow("Geçersiz dosya");
  });
  it("filters out invalid records but keeps valid ones", () => {
    const out = normalizeImport({
      books: [{ id: "b1", name: "Kitap", lesson: "tarih" }, { id: "bad" }],
      reviews: [normalizeReview({ id: "r1", lesson: "turkce", topic: "Paragraf" })],
      settings: { theme: "light" }
    });
    expect(out.books).toHaveLength(1);
    expect(out.reviews).toHaveLength(1);
    expect(out.settings.theme).toBe("light");
  });
});
