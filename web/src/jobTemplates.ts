import type { OperationType } from '../../server/src/domain/models/job.ts';

/** Starting input data for each operation, so a new job begins with the fields it needs. */
export const INPUT_TEMPLATES: Record<OperationType, string> = {
  VALIDATE_ARTICLE: JSON.stringify({ title: 'Article title', body: 'Article body text' }, null, 2),
  COUNT_WORDS: JSON.stringify({ body: 'Article body text' }, null, 2),
  GENERATE_SUMMARY: JSON.stringify({ body: 'Article body text', summary_words: 20 }, null, 2),
  CHECK_METADATA: JSON.stringify({ title: 'Article title', author: 'Author name', category: 'Category' }, null, 2),
  BUILD_EDITORIAL_REPORT: JSON.stringify({ report_title: 'Editorial Report' }, null, 2),
};
