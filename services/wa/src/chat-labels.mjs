import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * «محتاج رد مني» — the WhatsApp Business label the owner made on his own
 * phone, put on a chat when the bot hands it to him and taken off when he
 * answers it.
 *
 * ## Labels are an app-state fact the socket only hears about
 *
 * There is no "list labels" call. WhatsApp delivers labels through app-state
 * sync as `labels.edit` events — the full set right after linking, and one
 * event per later edit. So this keeps its own name → id map from those events,
 * and writes it next to the pairing credentials: a container restart does not
 * replay the initial sync, and without the file the label would go missing
 * until the owner happened to edit one. `clearAuthDir()` (a new number) takes
 * the file with it, which is right — label ids belong to the account.
 *
 * ## Business accounts only, and never fatal
 *
 * Labels exist on WhatsApp Business. On a personal account nothing ever
 * arrives, `idFor()` stays `null`, and `/label` answers `{ applied: false,
 * reason: 'no-label' }` — the bot and the inbox carry on exactly as before.
 */

/** Folds a label name so «محتاج رد منى» and « محتاج  رد مني » are one label. */
export function foldLabelName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .replace(/[ًٌٍَُِّْـ]/gu, '')
    .replace(/[أإآ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

export class ChatLabels {
  /**
   * @param {string} dir   the auth directory (a volume)
   * @param {{ warn: Function }} [logger]
   * @param {{ readFile?: typeof readFile, writeFile?: typeof writeFile }} [io]
   */
  constructor(dir, logger, io = {}) {
    this.file = join(dir, 'labels.json');
    this.logger = logger;
    this.read = io.readFile ?? readFile;
    this.write = io.writeFile ?? writeFile;
    /** @type {Map<string, { id: string, name: string }>} folded name → label */
    this.byName = new Map();
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const rows = JSON.parse(await this.read(this.file, 'utf8'));
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row && typeof row.id === 'string' && typeof row.name === 'string') {
          this.byName.set(foldLabelName(row.name), { id: row.id, name: row.name });
        }
      }
    } catch {
      // No file yet (first link) or an unreadable one: the next sync fills it.
    }
  }

  /** One `labels.edit` event. A deleted label is forgotten, a renamed one moves. */
  async observe(label) {
    if (!label || typeof label.id !== 'string') return;
    await this.load();
    for (const [key, row] of this.byName) if (row.id === label.id) this.byName.delete(key);
    if (!label.deleted && typeof label.name === 'string' && label.name.trim()) {
      this.byName.set(foldLabelName(label.name), { id: label.id, name: label.name });
    }
    try {
      await this.write(this.file, JSON.stringify([...this.byName.values()]), 'utf8');
    } catch (error) {
      this.logger?.warn({ err: error }, 'wa labels: could not persist the label map');
    }
  }

  /** The label id for a name, or `null` when this account has no such label. */
  async idFor(name) {
    await this.load();
    return this.byName.get(foldLabelName(name))?.id ?? null;
  }

  /** Forget everything — called when the pairing is cleared. */
  reset() {
    this.byName.clear();
    this.loaded = true;
  }
}
