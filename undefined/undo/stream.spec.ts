import { describe, expect, it } from "vitest";
import {
  CourseCreateSchema,
  CourseUpdateSchema,
  LessonCreateSchema,
  StreamChoiceSchema,
  streamChoiceOf,
  streamFlagsOf,
} from "./content";

/**
 * The converters are three lines each and both are written with `!==`, which
 * is exactly the shape that survives being inverted: `forGeneral: choice !==
 * 'general'` still typechecks, still returns booleans, and quietly swaps every
 * course on the platform to the other stream. Only asserting the actual pairs
 * catches that.
 */
describe("stream choice ⇄ flags", () => {
  it("maps each choice to the pair it names", () => {
    expect(streamFlagsOf("general")).toEqual({
      forGeneral: true,
      forLanguages: false,
    });
    expect(streamFlagsOf("languages")).toEqual({
      forGeneral: false,
      forLanguages: true,
    });
    expect(streamFlagsOf("both")).toEqual({
      forGeneral: true,
      forLanguages: true,
    });
  });

  it("round-trips every choice", () => {
    for (const choice of StreamChoiceSchema.options) {
      expect(streamChoiceOf(streamFlagsOf(choice))).toBe(choice);
    }
  });

  it("never produces the pair the CHECK forbids", () => {
    for (const choice of StreamChoiceSchema.options) {
      const flags = streamFlagsOf(choice);
      expect(flags.forGeneral || flags.forLanguages).toBe(true);
    }
  });

  /**
   * `false,false` is unreachable through the form and unrepresentable in the
   * database, but `streamChoiceOf` is also handed rows read back from it. It
   * has to be total rather than throwing on a shape it should never see.
   */
  it("reads an impossible pair as both rather than crashing", () => {
    expect(streamChoiceOf({ forGeneral: false, forLanguages: false })).toBe(
      "both",
    );
  });
});

describe("the schemas refuse a course or lesson that serves nobody", () => {
  const course = {
    slug: "x-course",
    title: "كورس",
    systemId: "019fc7d2-65d3-77bc-9352-8abe447f584c",
    year: 2,
    trackId: "019fc7d2-65d3-77bc-9352-8abe447f584d",
    subjectId: "019fc7d2-65d3-77bc-9352-8abe447f584e",
  };

  it("rejects both-false on create", () => {
    const result = CourseCreateSchema.safeParse({
      ...course,
      forGeneral: false,
      forLanguages: false,
    });
    expect(result.success).toBe(false);
  });

  it("defaults to both when streams are not mentioned at all", () => {
    const result = CourseCreateSchema.safeParse(course);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.forGeneral).toBe(true);
      expect(result.data.forLanguages).toBe(true);
    }
  });

  it("rejects both-false on a lesson", () => {
    const result = LessonCreateSchema.safeParse({
      title: "محاضرة",
      kind: "video",
      forGeneral: false,
      forLanguages: false,
    });
    expect(result.success).toBe(false);
  });

  /**
   * The documented gap, asserted so it stays a known one. On the PARTIAL
   * update schema a patch that unsets ONE flag says nothing about the other,
   * so this layer cannot know the result is empty — the CHECK is what refuses
   * it. A future change that makes this pass has not fixed a bug; it has
   * probably started reading the other flag from somewhere it should not.
   */
  it("cannot catch a one-sided patch — that is the CHECK constraint the database holds", () => {
    expect(CourseUpdateSchema.safeParse({ forGeneral: false }).success).toBe(
      true,
    );
  });

  it("does catch an explicit both-false patch", () => {
    expect(
      CourseUpdateSchema.safeParse({ forGeneral: false, forLanguages: false })
        .success,
    ).toBe(false);
  });
});
