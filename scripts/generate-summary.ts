/**
 * Builds a run summary from Playwright's JSON report (reports/results.json).
 * Every number comes from that file; nothing is estimated.
 *
 *   npm run summary            -> writes reports/summary.json and reports/summary.md
 *   in GitHub Actions          -> also appends the markdown to the job summary
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

interface JsonResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  error?: { message?: string };
}
interface JsonTest {
  projectName: string;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  results: JsonResult[];
}
interface JsonSpec {
  title: string;
  file: string;
  line: number;
  tests: JsonTest[];
}
interface JsonSuite {
  title: string;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}
interface JsonReport {
  stats: {
    startTime: string;
    duration: number;
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
  };
  suites: JsonSuite[];
}

interface ProjectCounts {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

const root = path.resolve(__dirname, '..');
const reportFile = path.join(root, 'reports', 'results.json');

if (!existsSync(reportFile)) {
  console.error(`No report at ${reportFile}. Run the tests first (npm test).`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportFile, 'utf8')) as JsonReport;

const byProject = new Map<string, ProjectCounts>();
const failures: Array<{ project: string; title: string; location: string; error: string }> = [];
const flaky: Array<{ project: string; title: string }> = [];

function visit(suite: JsonSuite, titles: string[]): void {
  const path = suite.title ? [...titles, suite.title] : titles;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      const counts = byProject.get(t.projectName) ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
      const title = [...path.slice(1), spec.title].join(' › ');
      if (t.status === 'expected') counts.passed += 1;
      if (t.status === 'skipped') counts.skipped += 1;
      if (t.status === 'flaky') {
        counts.flaky += 1;
        flaky.push({ project: t.projectName, title });
      }
      if (t.status === 'unexpected') {
        counts.failed += 1;
        const last = t.results.at(-1);
        failures.push({
          project: t.projectName,
          title,
          location: `${spec.file}:${spec.line}`,
          // Strip ANSI colour codes and keep the first line of the error.
          error:
            stripVTControlCharacters(last?.error?.message ?? 'no error message').split('\n')[0] ??
            '',
        });
      }
      byProject.set(t.projectName, counts);
    }
  }
  for (const child of suite.suites ?? []) visit(child, path);
}
for (const suite of report.suites) visit(suite, []);

const { stats } = report;
const total = stats.expected + stats.unexpected + stats.flaky + stats.skipped;
const summary = {
  generatedAt: new Date().toISOString(),
  runStartedAt: stats.startTime,
  durationSeconds: Math.round(stats.duration / 100) / 10,
  totals: {
    total,
    passed: stats.expected,
    failed: stats.unexpected,
    flaky: stats.flaky,
    skipped: stats.skipped,
  },
  projects: Object.fromEntries([...byProject.entries()].sort(([a], [b]) => a.localeCompare(b))),
  failures,
  flaky,
};

const status = stats.unexpected > 0 ? '❌ Failed' : '✅ Passed';
const lines = [
  `## ShopSure test run: ${status}`,
  '',
  `Started ${stats.startTime} · duration ${summary.durationSeconds}s · ${total} tests`,
  '',
  '| Project | Passed | Failed | Flaky | Skipped |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...[...byProject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, c]) => `| ${name} | ${c.passed} | ${c.failed} | ${c.flaky} | ${c.skipped} |`),
  `| **Total** | **${stats.expected}** | **${stats.unexpected}** | **${stats.flaky}** | **${stats.skipped}** |`,
];
if (failures.length > 0) {
  lines.push('', '### Failures', '');
  for (const f of failures)
    lines.push(`- **[${f.project}]** ${f.title} (\`${f.location}\`): ${f.error}`);
}
if (flaky.length > 0) {
  lines.push('', '### Flaky (passed only on retry — investigate)', '');
  for (const f of flaky) lines.push(`- **[${f.project}]** ${f.title}`);
}
const markdown = `${lines.join('\n')}\n`;

mkdirSync(path.join(root, 'reports'), { recursive: true });
writeFileSync(path.join(root, 'reports', 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(path.join(root, 'reports', 'summary.md'), markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

console.log(markdown);
