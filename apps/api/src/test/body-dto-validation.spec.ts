import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every route that types its body as a `…Dto` must actually VALIDATE it.
 *
 * `createZodDto(Schema)` looks like validation and is not: without
 * `ZodValidationPipe` on the handler, `@Body() body: CreateBookOrderDto` is a
 * TypeScript cast over `req.body` and nothing more. The schema's `.strict()`,
 * its `.refine()`s, its `.default(null)`s and every Arabic message in it are
 * dead code, and the first field a client gets wrong reaches the service —
 * where it becomes a Prisma error, i.e. a 500 that says «حصل خطأ، حاول تاني»
 * instead of a 400 that says which field is wrong.
 *
 * Measured on production 2026-09-04: `POST /api/book-orders` answered 500 to
 * `{}` while `POST /api/assistant/ask` — same DTO helper, one decorator more —
 * answered a clean 400. The two student-facing PURCHASE controllers were the
 * ones missing it.
 *
 * A source scan rather than a DI walk on purpose: this must fail in the unit
 * suite, on a laptop, with no database and no app boot, the moment somebody
 * adds route number 51.
 *
 * A body typed `unknown` or as an inline shape is NOT in scope — those hand
 * their input to a service that parses it (`SettingsController.update`,
 * `CspReportController.report`, `WhatsappInboundController.inbound`), which is
 * a different, deliberate contract.
 */

const MODULES_ROOT = join(__dirname, '..', 'modules');

function controllerFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...controllerFiles(path));
    else if (entry.name.endsWith('.controller.ts')) found.push(path);
  }
  return found;
}

/** The decorators + signature that belong to the handler owning `index`. */
function handlerBlock(source: string, index: number): string {
  const lines = source.slice(0, index).split('\n');
  const collected: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    const trimmed = line.trim();
    // The previous method's closing brace, or the class body's opening one:
    // everything after it belongs to THIS handler.
    if (trimmed === '}' || trimmed.endsWith('{}') || /^export class /.test(trimmed)) break;
    collected.unshift(line);
  }
  return collected.join('\n');
}

describe('every `…Dto` body is validated', () => {
  const files = controllerFiles(MODULES_ROOT);

  it('finds the controllers at all (a scan that scans nothing always passes)', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('leaves no handler holding an unvalidated DTO', () => {
    const unvalidated: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const classLevel = /@UsePipes\(/.test(source.slice(0, source.indexOf('export class')));
      if (classLevel) continue;

      for (const match of source.matchAll(/@Body\(\)\s*\w+\??:\s*(\w*Dto)\b/g)) {
        if (/@UsePipes\(/.test(handlerBlock(source, match.index))) continue;
        unvalidated.push(`${file.slice(MODULES_ROOT.length + 1)} → ${match[1]}`);
      }
    }

    // Listed, not counted: the failure message has to name the route, because
    // the person reading it is looking at a 500 in production.
    expect(unvalidated).toEqual([]);
  });
});
