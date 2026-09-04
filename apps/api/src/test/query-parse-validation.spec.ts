import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No controller may validate CLIENT input with a bare `Schema.parse(...)`.
 *
 * The companion to `body-dto-validation.spec.ts`, one layer along: that file
 * covers bodies typed as a `…Dto`, this one covers the query strings and params
 * an admin list controller parses by hand. The failure mode is the same and so
 * is the reason it is invisible — `AllExceptionsFilter` fails closed, a
 * `ZodError` is not an `HttpException`, so a value the CONTRACT rejects comes
 * back as `500 Internal server error`.
 *
 * Measured on production 2026-09-04: `GET /api/admin/errors?perPage=40` — 40 is
 * simply not one of `ListQuerySchema`'s 10/20/50/100 — answered a 500 and filed
 * an entry in the admin error log, where it is indistinguishable from the
 * database being down. Six call sites across three admin controllers had it.
 *
 * `parseRequest` (`common/http/parse-request.ts`) is the fix, and
 * `@UsePipes(new ZodValidationPipe(Schema))` is the other acceptable answer —
 * nestjs-zod's `ZodValidationException` extends `BadRequestException`, so a
 * handler carrying the pipe already reaches the client as a 400.
 *
 * A source scan rather than a booted app on purpose, exactly as the body spec
 * argues: this has to fail on a laptop with no database, the moment somebody
 * adds the seventh call site.
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
    if (trimmed === '}' || trimmed.endsWith('{}') || /^export class /.test(trimmed)) break;
    collected.unshift(line);
  }
  return collected.join('\n');
}

/** Comment bodies quote `.parse()` constantly — strip them before matching. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

describe('no controller validates client input with a bare `.parse()`', () => {
  const files = controllerFiles(MODULES_ROOT);

  it('finds the controllers at all (a scan that scans nothing always passes)', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('leaves no handler turning a bad query string into a 500', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      const classLevel = /@UsePipes\(/.test(source.slice(0, source.indexOf('export class')));
      if (classLevel) continue;

      for (const match of source.matchAll(/\b(\w+Schema)\.parse\(/g)) {
        if (/@UsePipes\(/.test(handlerBlock(source, match.index))) continue;
        offenders.push(`${file.slice(MODULES_ROOT.length + 1)} → ${match[1]}.parse()`);
      }
    }

    // Listed, not counted: whoever reads this failure is looking at a 500 in
    // production and needs the file name, not a number.
    expect(offenders).toEqual([]);
  });
});
