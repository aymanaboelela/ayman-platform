import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  isFoundationCourse,
  type AdminChallengeTopics,
  type ChallengeTopicInput,
  type ChallengeTopicPatch,
} from '@ayman/contracts/quiz/challenges';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { challengeCandidates, courseLessons, topicHomeLessons, type CourseLesson } from './challenge-pool';

/**
 * «قسم التحديات» في لوحة التحكم — المواضيع لكل كورس، وكام سؤال جاهز في كل
 * واحد (بنفس الكويري اللي بنك الطالب بيتحسب بيها، `challenge-pool.ts`).
 *
 * كل حفظ بيرجّع الشاشة كلها من تاني: الأعداد بتتغيّر مع الدروس، والترتيب مع
 * أي إضافة، وحساب جزء منها في المتصفح كان هيبقى نسخة تانية من نفس القاعدة.
 */
@Injectable()
export class ChallengeTopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async detail(courseId: string): Promise<AdminChallengeTopics> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, subtitle: true },
    });
    if (!course) throw new NotFoundException();
    const [lessons, candidates, topics] = await Promise.all([
      courseLessons(this.prisma, [courseId]),
      challengeCandidates(this.prisma, [courseId], null),
      this.prisma.challengeTopic.findMany({
        where: { courseId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, title: true, isActive: true, position: true, sectionIds: true, lessonIds: true },
      }),
    ]);

    const readyByLesson = new Map<string, number>();
    for (const candidate of candidates) readyByLesson.set(candidate.lessonId, (readyByLesson.get(candidate.lessonId) ?? 0) + 1);

    const sections = new Map<string, AdminChallengeTopics['sections'][number]>();
    for (const lesson of lessons) {
      const section = sections.get(lesson.sectionId) ?? { id: lesson.sectionId, title: lesson.sectionTitle, ready: 0, lessons: [] };
      sections.set(lesson.sectionId, section);
      // الكويز اللي أسئلته محسوبة على المحاضرة اللي قبله مالوش اختيار لوحده —
      // اختيار المحاضرة بيجيب الاتنين. نفس شكل «أسئلة الألعاب».
      if (lesson.homeId !== lesson.id) continue;
      const ready = readyByLesson.get(lesson.id) ?? 0;
      section.ready += ready;
      section.lessons.push({
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        ready,
        forGeneral: lesson.forGeneral,
        forLanguages: lesson.forLanguages,
      });
    }

    const sectionIds = new Set(lessons.map((lesson) => lesson.sectionId));
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    return {
      courseId: course.id,
      courseTitle: course.title,
      foundation: isFoundationCourse(course),
      sections: [...sections.values()],
      topics: topics.map((topic) => {
        const homes = topicHomeLessons({ courseId, ...topic }, lessons);
        const inTopic = candidates.filter((candidate) => homes.has(candidate.lessonId));
        return {
          id: topic.id,
          title: topic.title,
          isActive: topic.isActive,
          position: topic.position,
          sectionIds: topic.sectionIds,
          lessonIds: topic.lessonIds,
          missing:
            topic.sectionIds.filter((id) => !sectionIds.has(id)).length +
            topic.lessonIds.filter((id) => !lessonIds.has(id)).length,
          ready: {
            total: inTopic.length,
            general: inTopic.filter((candidate) => candidate.forGeneral).length,
            languages: inTopic.filter((candidate) => candidate.forLanguages).length,
          },
        };
      }),
    };
  }

  async create(courseId: string, input: ChallengeTopicInput): Promise<AdminChallengeTopics> {
    const lessons = await this.courseOrRefuse(courseId);
    const scope = this.scopeIn(lessons, input.sectionIds, input.lessonIds);
    const last = await this.prisma.challengeTopic.aggregate({ where: { courseId }, _max: { position: true } });
    const topic = await this.prisma.challengeTopic.create({
      data: {
        courseId,
        title: input.title,
        isActive: input.isActive,
        position: (last._max.position ?? -1) + 1,
        ...scope,
      },
      select: { id: true },
    });
    await this.audit.record({
      action: 'challenge-topic:create',
      resourceType: AUDIT_RESOURCES.challengeTopic,
      resourceId: topic.id,
      outcome: 'success',
      metadata: { courseId, title: input.title, isActive: input.isActive, ...scope },
    });
    return this.detail(courseId);
  }

  async update(courseId: string, topicId: string, patch: ChallengeTopicPatch): Promise<AdminChallengeTopics> {
    const lessons = await this.courseOrRefuse(courseId);
    const topic = await this.prisma.challengeTopic.findFirst({
      where: { id: topicId, courseId },
      select: { sectionIds: true, lessonIds: true },
    });
    if (!topic) throw new NotFoundException();
    // الوحدات/الدروس اللي اتمسحت من الكورس بتتشال هنا — أول حفظ بينضّف.
    const scope = this.scopeIn(lessons, patch.sectionIds ?? topic.sectionIds, patch.lessonIds ?? topic.lessonIds);
    await this.prisma.challengeTopic.update({
      where: { id: topicId },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...scope,
      },
    });
    await this.audit.record({
      action: 'challenge-topic:update',
      resourceType: AUDIT_RESOURCES.challengeTopic,
      resourceId: topicId,
      outcome: 'success',
      metadata: { courseId, ...patch, ...scope },
    });
    return this.detail(courseId);
  }

  async remove(courseId: string, topicId: string): Promise<AdminChallengeTopics> {
    const removed = await this.prisma.challengeTopic.deleteMany({ where: { id: topicId, courseId } });
    if (removed.count === 0) throw new NotFoundException();
    await this.audit.record({
      action: 'challenge-topic:delete',
      resourceType: AUDIT_RESOURCES.challengeTopic,
      resourceId: topicId,
      outcome: 'success',
      metadata: { courseId },
    });
    return this.detail(courseId);
  }

  /** الترتيب الجديد. تحدّي مش في اللستة (اتعمل من تاب تاني) بيروح آخرها. */
  async reorder(courseId: string, ids: readonly string[]): Promise<AdminChallengeTopics> {
    const topics = await this.prisma.challengeTopic.findMany({
      where: { courseId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (topics.length === 0) throw new NotFoundException();
    const known = new Set(topics.map((topic) => topic.id));
    const ordered = [...new Set(ids)].filter((id) => known.has(id));
    for (const topic of topics) if (!ordered.includes(topic.id)) ordered.push(topic.id);
    await this.prisma.$transaction(
      ordered.map((id, position) => this.prisma.challengeTopic.update({ where: { id }, data: { position } })),
    );
    await this.audit.record({
      action: 'challenge-topic:reorder',
      resourceType: AUDIT_RESOURCES.challengeTopic,
      resourceId: courseId,
      outcome: 'success',
      metadata: { order: ordered },
    });
    return this.detail(courseId);
  }

  /** الكورس موجود ومش التأسيسي — ودروسه. */
  private async courseOrRefuse(courseId: string): Promise<CourseLesson[]> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { title: true, subtitle: true } });
    if (!course) throw new NotFoundException();
    if (isFoundationCourse(course)) throw new BadRequestException({ code: 'foundation_course' });
    return courseLessons(this.prisma, [courseId]);
  }

  /** بس وحدات ودروس الكورس ده، من غير تكرار — وفاضي = ٤٠٠. */
  private scopeIn(
    lessons: readonly CourseLesson[],
    sectionIds: readonly string[],
    lessonIds: readonly string[],
  ): { sectionIds: string[]; lessonIds: string[] } {
    const sections = new Set(lessons.map((lesson) => lesson.sectionId));
    const known = new Set(lessons.map((lesson) => lesson.id));
    const scope = {
      sectionIds: [...new Set(sectionIds)].filter((id) => sections.has(id)),
      lessonIds: [...new Set(lessonIds)].filter((id) => known.has(id)),
    };
    if (scope.sectionIds.length + scope.lessonIds.length === 0) throw new BadRequestException({ code: 'empty_topic' });
    return scope;
  }
}
