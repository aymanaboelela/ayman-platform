'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, StickyNote } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import type { LessonNote, Notebook, NotebookLesson } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { SubjectMark } from '@/components/course-art';
import { NoteItem } from './note-item';

const c = engagementCopy.notes;

function lessonHref(lesson: NotebookLesson, at?: number | null): string {
  const page = `/courses/${encodeURIComponent(lesson.courseSlug)}/lessons/${lesson.lessonId}`;
  return at === null || at === undefined ? page : `${page}?t=${at}`;
}

/** Case- and diacritic-blind enough for Arabic notes: tashkeel and tatweel out. */
function fold(text: string): string {
  return text.toLowerCase().replace(/[ً-ْـ]/g, '');
}

/**
 * «ملاحظاتي» — every note, grouped by lecture, the lecture written in last on
 * top. The minute on a pinned note opens the lecture AT that second (`?t=`).
 */
export function NotebookBoard({ notebook }: { notebook: Notebook }) {
  const [lessons, setLessons] = useState(notebook.lessons);
  const [query, setQuery] = useState('');

  const total = lessons.reduce((sum, lesson) => sum + lesson.notes.length, 0);
  const needle = fold(query.trim());
  const shown = needle
    ? lessons
        .map((lesson) => ({
          ...lesson,
          notes: lesson.notes.filter(
            (note) => fold(note.body).includes(needle) || fold(lesson.lessonTitle).includes(needle),
          ),
        }))
        .filter((lesson) => lesson.notes.length > 0)
    : lessons;

  function update(lessonId: string, change: (notes: LessonNote[]) => LessonNote[]): void {
    setLessons((current) =>
      current
        .map((lesson) => (lesson.lessonId === lessonId ? { ...lesson, notes: change(lesson.notes) } : lesson))
        .filter((lesson) => lesson.notes.length > 0),
    );
  }

  if (total === 0) {
    return (
      <section className="eg-empty">
        <span className="eg-empty__badge" aria-hidden="true">
          <StickyNote className="size-8" />
        </span>
        <h2 className="eg-empty__title">{c.empty.title}</h2>
        <p className="eg-empty__body">{c.empty.body}</p>
        <Link href="/library" className="eg-btn eg-btn--solid">
          {c.empty.cta}
        </Link>
      </section>
    );
  }

  return (
    <>
      <div className="eg-toolbar">
        <span className="eg-chip" data-tone="amber">
          <StickyNote className="size-4" aria-hidden="true" />
          {arabicCount(total, c.page.count)}
        </span>
        <label className="eg-search">
          <Search className="size-4" aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={c.page.search}
            aria-label={c.page.search}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="eg-muted-line">{c.page.noMatch}</p>
      ) : (
        <div className="eg-stack">
          {shown.map((lesson) => (
            <section key={lesson.lessonId} className="eg-card" aria-labelledby={`nb-${lesson.lessonId}`}>
              <header className="eg-card__head">
                <SubjectMark subjectNameAr={lesson.subjectNameAr} className="size-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 id={`nb-${lesson.lessonId}`} className="eg-card__title">
                    {lesson.lessonTitle}
                  </h2>
                  <p className="eg-card__meta">{lesson.courseTitle}</p>
                </div>
                <Link href={lessonHref(lesson)} className="eg-btn">
                  {c.openLesson}
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </Link>
              </header>
              <ul className="eg-notes">
                {lesson.notes.map((note) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    jumpHref={lesson.lessonKind === 'video' ? lessonHref(lesson, note.positionSeconds) : undefined}
                    onChanged={(changed) =>
                      update(lesson.lessonId, (notes) => notes.map((entry) => (entry.id === changed.id ? changed : entry)))
                    }
                    onRemoved={(id) => update(lesson.lessonId, (notes) => notes.filter((entry) => entry.id !== id))}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
