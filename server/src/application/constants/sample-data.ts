import type { Job } from '../../domain/models/job.ts';
import type { Machine } from '../../domain/models/machine.ts';

export const SAMPLE_MACHINES: readonly Machine[] = [
  { id: 'M1', name: 'Processing Machine 1', status: 'AVAILABLE' },
  { id: 'M2', name: 'Processing Machine 2', status: 'AVAILABLE' },
];

export const SAMPLE_ARTICLE = {
  title: 'City Council Approves New Transit Plan',
  author: 'Priya Nair',
  category: 'Local News',
  body:
    'The city council voted on Tuesday to approve a ten year transit plan that adds three new bus ' +
    'corridors, extends evening service, and funds a pilot for electric ferries on the river. ' +
    'Supporters said the plan would cut commute times for thousands of residents, while critics ' +
    'raised concerns about long term costs. The first corridor is expected to open next spring ' +
    'after a round of public consultations in every district.',
} as const;

/** The six jobs from the assessment brief, listed so every dependency precedes its dependents. */
export const SAMPLE_JOBS: readonly Job[] = [
  {
    id: 'J1',
    name: 'Validate article',
    operationType: 'VALIDATE_ARTICLE',
    duration: 2,
    releaseTime: 0,
    deadline: 5,
    priority: 10,
    eligibleMachines: ['M1', 'M2'],
    dependencies: [],
    inputData: { title: SAMPLE_ARTICLE.title, body: SAMPLE_ARTICLE.body },
  },
  {
    id: 'J2',
    name: 'Count words',
    operationType: 'COUNT_WORDS',
    duration: 2,
    releaseTime: 0,
    deadline: 4,
    priority: 8,
    eligibleMachines: ['M1'],
    dependencies: [],
    inputData: { body: SAMPLE_ARTICLE.body },
  },
  {
    id: 'J3',
    name: 'Generate summary',
    operationType: 'GENERATE_SUMMARY',
    duration: 2,
    releaseTime: 2,
    deadline: 8,
    priority: 9,
    eligibleMachines: ['M1', 'M2'],
    dependencies: ['J1'],
    inputData: { body: SAMPLE_ARTICLE.body, summary_words: 20 },
  },
  {
    id: 'J4',
    name: 'Check article metadata',
    operationType: 'CHECK_METADATA',
    duration: 3,
    releaseTime: 0,
    deadline: 7,
    priority: 6,
    eligibleMachines: ['M2'],
    dependencies: [],
    inputData: { title: SAMPLE_ARTICLE.title, author: SAMPLE_ARTICLE.author, category: SAMPLE_ARTICLE.category },
  },
  {
    id: 'J5',
    name: 'Build editorial report',
    operationType: 'BUILD_EDITORIAL_REPORT',
    duration: 2,
    releaseTime: 4,
    deadline: 10,
    priority: 7,
    eligibleMachines: ['M1', 'M2'],
    dependencies: ['J2'],
    inputData: { report_title: 'Daily Editorial Report' },
  },
  {
    id: 'J6',
    name: 'Check sidebar metadata',
    operationType: 'CHECK_METADATA',
    duration: 1,
    releaseTime: 0,
    deadline: 3,
    priority: 5,
    eligibleMachines: ['M1'],
    dependencies: [],
    inputData: { title: 'Transit Plan Explainer', author: 'Marcus Webb', category: 'Explainers' },
  },
];
