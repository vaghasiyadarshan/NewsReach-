import { describe, expect, it } from 'vitest';
import { OperationError } from '../../../../../src/application/errors/errors.ts';
import { OPERATION_TYPES } from '../../../../../src/domain/models/job.ts';
import { OPERATIONS, runOperation } from '../../../../../src/application/helper/execution/operations.ts';

const noDeps = { dependencyOutputs: {} };
const run = (type: Parameters<typeof runOperation>[0], input: Record<string, unknown>, deps = {}) =>
  runOperation(type, input, { dependencyOutputs: deps });

const thirtyWords = Array.from({ length: 30 }, (_, i) => `w${i + 1}`).join(' ');

describe('operations registry', () => {
  it('has a handler for every operation type', () => {
    for (const type of OPERATION_TYPES) expect(typeof OPERATIONS[type]).toBe('function');
  });
});

describe('VALIDATE_ARTICLE', () => {
  it('passes with a title and body', () => {
    expect(run('VALIDATE_ARTICLE', { title: 'Hello', body: 'one two three' })).toMatchObject({
      valid: true,
      bodyWords: 3,
    });
  });

  it('fails naming the empty title', () => {
    expect(() => run('VALIDATE_ARTICLE', { title: '   ', body: 'text' })).toThrow('Missing or empty field: title');
  });

  it('fails naming every missing field', () => {
    expect(() => run('VALIDATE_ARTICLE', {})).toThrow('title, body');
  });

  it('fails with an OperationError', () => {
    expect(() => run('VALIDATE_ARTICLE', { title: 'x' })).toThrow(OperationError);
  });
});

describe('COUNT_WORDS', () => {
  it('counts whitespace-separated words, ignoring repeated whitespace and newlines', () => {
    expect(run('COUNT_WORDS', { body: 'one two  three' })).toEqual({ wordCount: 3 });
    expect(run('COUNT_WORDS', { body: '  one\ttwo\nthree\n\nfour  ' })).toEqual({ wordCount: 4 });
  });

  it('counts an empty body as zero words', () => {
    expect(run('COUNT_WORDS', { body: '' })).toEqual({ wordCount: 0 });
  });

  it('fails when the body is missing or not text', () => {
    expect(() => run('COUNT_WORDS', {})).toThrow('Missing field: body');
    expect(() => run('COUNT_WORDS', { body: 42 })).toThrow('Missing field: body');
  });
});

describe('GENERATE_SUMMARY', () => {
  it('returns exactly the first summary_words words', () => {
    const out = run('GENERATE_SUMMARY', { body: thirtyWords, summary_words: 5 });
    expect(out.summary).toBe('w1 w2 w3 w4 w5');
    expect(out.summaryWords).toBe(5);
  });

  it('defaults to 20 words when summary_words is omitted', () => {
    const out = run('GENERATE_SUMMARY', { body: thirtyWords });
    expect((out.summary as string).split(' ')).toHaveLength(20);
    expect(out.summary).toMatch(/^w1 w2 .* w20$/);
  });

  it('returns the whole body when it is shorter than summary_words', () => {
    expect(run('GENERATE_SUMMARY', { body: 'a b c', summary_words: 10 })).toMatchObject({
      summary: 'a b c',
      summaryWords: 3,
    });
  });

  it('normalizes whitespace in the summary', () => {
    expect(run('GENERATE_SUMMARY', { body: 'a   b\n c', summary_words: 2 }).summary).toBe('a b');
  });

  it('fails on an invalid summary_words', () => {
    expect(() => run('GENERATE_SUMMARY', { body: 'a b', summary_words: 0 })).toThrow('positive integer');
    expect(() => run('GENERATE_SUMMARY', { body: 'a b', summary_words: 'x' })).toThrow('positive integer');
    expect(() => run('GENERATE_SUMMARY', { body: 'a b', summary_words: 1.5 })).toThrow('positive integer');
  });

  it('fails when the body is missing', () => {
    expect(() => run('GENERATE_SUMMARY', { summary_words: 3 })).toThrow('Missing field: body');
  });
});

describe('CHECK_METADATA', () => {
  it('passes with title, author and category', () => {
    expect(run('CHECK_METADATA', { title: 'T', author: 'A', category: 'C' })).toEqual({
      valid: true,
      title: 'T',
      author: 'A',
      category: 'C',
    });
  });

  it('fails naming an empty author', () => {
    expect(() => run('CHECK_METADATA', { title: 'T', author: '', category: 'C' })).toThrow(
      'Missing or empty field: author',
    );
  });

  it('names every missing field at once', () => {
    expect(() => run('CHECK_METADATA', { title: 'T' })).toThrow('author, category');
  });
});

describe('BUILD_EDITORIAL_REPORT', () => {
  it('contains each dependency output under its job ID', () => {
    const deps = { J2: { wordCount: 42 }, J3: { summary: 'a b' } };
    const out = run('BUILD_EDITORIAL_REPORT', {}, deps);
    expect(out.results).toEqual(deps);
    expect((out.results as Record<string, unknown>).J2).toEqual({ wordCount: 42 });
    expect(out.dependencyCount).toBe(2);
  });

  it('uses report_title from the input when given', () => {
    expect(run('BUILD_EDITORIAL_REPORT', { report_title: 'Weekly' }, {}).title).toBe('Weekly');
    expect(run('BUILD_EDITORIAL_REPORT', {}, {}).title).toBe('Editorial Report');
  });

  it('produces an empty report for a job without dependencies', () => {
    expect(runOperation('BUILD_EDITORIAL_REPORT', {}, noDeps)).toMatchObject({ dependencyCount: 0, results: {} });
  });
});
