/**
 * The subject the API resolves for this stack — the slug the seed opens on
 * every track, and the name the assistant says.
 *
 * Decided at module load, so each case resets the registry and re-requires.
 */
const KEYS = ['TENANT_KEY', 'TENANT_SUBJECT'] as const;
type Env = Partial<Record<(typeof KEYS)[number], string>>;
type SubjectModule = typeof import('./tenant-subject');

function loadWith(env: Env): SubjectModule {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./tenant-subject') as SubjectModule;
}

let saved: Partial<Record<(typeof KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  jest.resetModules();
});

describe('STACK_SUBJECT_SLUG', () => {
  it('is programming on every stack that set nothing — his and the first two instructors’', () => {
    // The seed opens this subject on every track on every boot; programming is
    // what it has always opened, so their databases see the same upserts.
    expect(loadWith({}).STACK_SUBJECT_SLUG).toBe('programming_cs');
    expect(loadWith({ TENANT_KEY: 'mohamed-sabry' }).STACK_SUBJECT_SLUG).toBe('programming_cs');
    expect(loadWith({ TENANT_KEY: 'mohamed-sabry', TENANT_SUBJECT: '' }).STACK_SUBJECT_SLUG).toBe(
      'programming_cs',
    );
  });

  it('is programming on his stack whatever the variable says', () => {
    expect(loadWith({ TENANT_SUBJECT: 'physics' }).STACK_SUBJECT_SLUG).toBe('programming_cs');
  });

  it('is the configured subject on another stack', () => {
    const module = loadWith({ TENANT_KEY: 'demo', TENANT_SUBJECT: 'physics' });
    expect(module.STACK_SUBJECT_SLUG).toBe('physics');
    expect(module.SUBJECT_NAME_AR).toBe('الفيزياء');
  });

  it('is nothing at all for a slug the list does not know — never a guessed subject', () => {
    const module = loadWith({ TENANT_KEY: 'demo', TENANT_SUBJECT: 'fizyaa' });
    expect(module.STACK_SUBJECT_SLUG).toBeNull();
    expect(module.SUBJECT_NAME_AR).toBe('المادة');
  });
});

describe('bySubject', () => {
  it('hands a programming stack back the very string it passed', () => {
    const original = 'البرمجة وعلوم الحاسب — نظام البكالوريا المصرية';
    expect(loadWith({}).bySubject(original, '{subject} — المرحلة الثانوية')).toBe(original);
  });

  it('fills the twin on any other stack', () => {
    const { bySubject } = loadWith({ TENANT_KEY: 'demo', TENANT_SUBJECT: 'chemistry' });
    expect(bySubject('x', '{subject} — المرحلة الثانوية')).toBe('الكيمياء — المرحلة الثانوية');
  });
});
