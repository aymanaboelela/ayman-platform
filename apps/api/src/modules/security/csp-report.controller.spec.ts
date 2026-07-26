import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getLoggerToken, type PinoLogger } from 'nestjs-pino';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { CspReportController, normalise } from './csp-report.controller';

describe('CspReportController', () => {
  let controller: CspReportController;
  let warn: jest.Mock;

  beforeEach(async () => {
    warn = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [CspReportController],
      providers: [
        { provide: getLoggerToken(CspReportController.name), useValue: { warn } as unknown as PinoLogger },
      ],
    }).compile();
    controller = moduleRef.get(CspReportController);
  });

  it('normalises the legacy report-uri body', () => {
    expect(
      normalise({
        'csp-report': {
          'document-uri': 'https://x/y',
          'effective-directive': 'script-src-elem',
          'blocked-uri': 'https://evil.example/a.js',
          'script-sample': 'alert(1)',
        },
      }),
    ).toEqual([
      {
        directive: 'script-src-elem',
        blockedUri: 'https://evil.example/a.js',
        documentUri: 'https://x/y',
        sample: 'alert(1)',
      },
    ]);
  });

  it('normalises the Reporting API array body, skipping non-csp-violation entries', () => {
    expect(
      normalise([
        {
          type: 'csp-violation',
          body: {
            documentURL: 'https://x/y',
            effectiveDirective: 'img-src',
            blockedURL: 'https://cdn.example/a.png',
            sample: '',
          },
        },
        { type: 'deprecation', body: {} },
      ]),
    ).toEqual([
      { directive: 'img-src', blockedUri: 'https://cdn.example/a.png', documentUri: 'https://x/y', sample: '' },
    ]);
  });

  it('truncates a long sample to 120 characters', () => {
    const [violation] = normalise({
      'csp-report': { 'effective-directive': 'script-src', 'script-sample': 'x'.repeat(500) },
    });
    expect(violation!.sample).toHaveLength(120);
  });

  it('drops an unrecognised or empty body without throwing', () => {
    expect(() => controller.report({ nonsense: true })).not.toThrow();
    expect(() => controller.report(null)).not.toThrow();
    expect(() => controller.report(undefined)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs a repeated violation once per dedupe window', () => {
    const body = { 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' } };
    controller.report(body);
    controller.report(body);
    controller.report(body);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('logs two DIFFERENT violations separately, not deduped against each other', () => {
    controller.report({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' } });
    controller.report({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://x/y.png' } });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('is reachable without a session (@Public())', () => {
    const isPublic = new Reflector().get(IS_PUBLIC_KEY, CspReportController.prototype.report);
    expect(isPublic).toBe(true);
  });
});
