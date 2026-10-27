import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NOTES_PER_LESSON_MAX,
  type LessonNote,
  type LessonNotes,
  type Notebook,
  type NotebookLesson,
  type NoteCreate,
} from '@ayman/contracts/engagement';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonAccessService } from '../progress/lesson-access.service';

const NOTE_SELECT = {
  id: true,
  lessonId: true,
  positionSeconds: true,
  body: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toNote(row: {
  id: string;
  lessonId: string;
  positionSeconds: number | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}): LessonNote {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/**
 * «ملاحظاتي» — a student's own notes on a lesson.
 *
 * Writing on a lesson goes through `LessonAccessService.requireOwnership`:
 * enrolled and published, the same 404 for «no such lesson» and «not yours».
 * Not the progression gate — a note is about a lecture the student is already
 * sitting in, and a gate that moves (a new lecture published ahead) must not
 * turn their own notebook read-only.
 *
 * Every read and edit is keyed on `userId` in the WHERE itself: there is no
 * fetched note for a later `if` to forget to check.
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
  ) {}

  async forLesson(userId: string, lessonId: string): Promise<LessonNotes> {
    await this.access.requireOwnership(userId, lessonId);
    const rows = await this.prisma.lessonNote.findMany({
      where: { userId, lessonId },
      orderBy: [{ positionSeconds: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      select: NOTE_SELECT,
    });
    return { notes: rows.map(toNote) };
  }

  async create(userId: string, lessonId: string, input: NoteCreate): Promise<LessonNote> {
    await this.access.requireOwnership(userId, lessonId);
    const count = await this.prisma.lessonNote.count({ where: { userId, lessonId } });
    if (count >= NOTES_PER_LESSON_MAX) throw new ConflictException({ code: 'notes_limit' });
    const row = await this.prisma.lessonNote.create({
      data: { userId, lessonId, body: input.body, positionSeconds: input.positionSeconds ?? null },
      select: NOTE_SELECT,
    });
    return toNote(row);
  }

  async edit(userId: string, noteId: string, body: string): Promise<LessonNote> {
    const written = await this.prisma.lessonNote.updateMany({ where: { id: noteId, userId }, data: { body } });
    if (written.count === 0) throw new NotFoundException();
    const row = await this.prisma.lessonNote.findFirstOrThrow({ where: { id: noteId, userId }, select: NOTE_SELECT });
    return toNote(row);
  }

  async remove(userId: string, noteId: string): Promise<void> {
    const removed = await this.prisma.lessonNote.deleteMany({ where: { id: noteId, userId } });
    if (removed.count === 0) throw new NotFoundException();
  }

  /**
   * Every note, grouped by lesson, the lesson most recently written in first.
   * A lesson that is no longer published (or whose course is not) drops out:
   * its link would 404, and a notebook of dead links reads as data loss.
   */
  async notebook(userId: string): Promise<Notebook> {
    const rows = await this.prisma.lessonNote.findMany({
      where: { userId, lesson: { isPublished: true, course: { status: 'published' } } },
      orderBy: [{ positionSeconds: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        ...NOTE_SELECT,
        lesson: {
          select: {
            title: true,
            kind: true,
            course: { select: { slug: true, title: true, subject: { select: { nameAr: true } } } },
          },
        },
      },
    });

    const byLesson = new Map<string, NotebookLesson & { latest: number }>();
    for (const { lesson, ...note } of rows) {
      const entry = byLesson.get(note.lessonId) ?? {
        lessonId: note.lessonId,
        lessonTitle: lesson.title,
        lessonKind: lesson.kind,
        courseSlug: lesson.course.slug,
        courseTitle: lesson.course.title,
        subjectNameAr: lesson.course.subject.nameAr,
        notes: [],
        latest: 0,
      };
      entry.notes.push(toNote(note));
      entry.latest = Math.max(entry.latest, note.updatedAt.getTime());
      byLesson.set(note.lessonId, entry);
    }

    const lessons = [...byLesson.values()]
      .sort((a, b) => b.latest - a.latest)
      .map(({ latest: _latest, ...lesson }) => lesson);
    return { lessons, total: rows.length };
  }
}
