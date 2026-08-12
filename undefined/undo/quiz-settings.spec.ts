import { describe, expect, it } from "vitest";
import {
  DEFAULT_REVIEW_OPTIONS,
  QUIZ_PAPERS,
  REVIEW_FLAGS,
  REVIEW_WINDOWS,
  QuizPaperSchema,
  QuizSettingsSchema,
  ReviewOptionsSchema,
  attemptAllowance,
} from "./quiz-settings";

describe("review options matrix", () => {
  it("is exactly four windows by seven flags", () => {
    expect(REVIEW_WINDOWS).toHaveLength(4);
    expect(REVIEW_FLAGS).toHaveLength(7);
    for (const window of REVIEW_WINDOWS) {
      expect(Object.keys(DEFAULT_REVIEW_OPTIONS[window]).sort()).toEqual(
        [...REVIEW_FLAGS].sort(),
      );
    }
  });

  it("rejects a matrix missing a window", () => {
    const { afterClose, ...incomplete } = DEFAULT_REVIEW_OPTIONS;
    expect(ReviewOptionsSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects a matrix missing a flag", () => {
    const broken = structuredClone(DEFAULT_REVIEW_OPTIONS) as Record<
      string,
      unknown
    >;
    delete (broken.during as Record<string, unknown>).rightAnswer;
    expect(ReviewOptionsSchema.safeParse(broken).success).toBe(false);
  });

  it("shows nothing during an attempt", () => {
    expect(
      Object.values(DEFAULT_REVIEW_OPTIONS.during).every((v) => v === false),
    ).toBe(true);
  });
});

describe("quiz settings defaults", () => {
  it("defaults to a single sitting with no improvement", () => {
    const parsed = QuizSettingsSchema.parse({
      reviewOptions: DEFAULT_REVIEW_OPTIONS,
    });
    expect(parsed.allowsImprovement).toBe(false);
    expect(parsed.graceSeconds).toBe(60);
    expect(parsed.overdueHandling).toBe("autosubmit");
  });

  /*
   * The default is the whole point of this one. Its predecessor defaulted to
   * `maxAttempts: 0`, which meant UNLIMITED — so a quiz built by clicking
   * straight through the form was one a student could sit forever.
   */
  it("cannot be configured back into more than one sitting", () => {
    const parsed = QuizSettingsSchema.parse({
      reviewOptions: DEFAULT_REVIEW_OPTIONS,
      maxAttempts: 99,
      retryCooldownHours: 0,
      gradeMethod: "last",
      mode: "practice",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("maxAttempts");
    expect(parsed).not.toHaveProperty("retryCooldownHours");
    expect(parsed).not.toHaveProperty("gradeMethod");
    expect(parsed).not.toHaveProperty("mode");
    expect(attemptAllowance(parsed.allowsImprovement)).toBe(1);
  });
});

describe("attemptAllowance", () => {
  it("is one sitting for an ordinary quiz", () => {
    expect(attemptAllowance(false)).toBe(1);
  });

  it("is two for an exam offering improvement — never three", () => {
    expect(attemptAllowance(true)).toBe(2);
  });
});

describe("QuizPaperSchema", () => {
  it("has exactly the two papers", () => {
    expect(QUIZ_PAPERS).toEqual(["original", "improvement"]);
    expect(QuizPaperSchema.safeParse("original").success).toBe(true);
    expect(QuizPaperSchema.safeParse("improvement").success).toBe(true);
    expect(QuizPaperSchema.safeParse("third").success).toBe(false);
  });
});
