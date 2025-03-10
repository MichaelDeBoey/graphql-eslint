import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { CWD as PROJECT_CWD, slash } from '../src/utils.js';

const CWD = path.join(PROJECT_CWD, '..', '..');

function countErrors(results: ESLint.LintResult[]): number {
  return results.reduce<number>((acc, curr: ESLint.LintResult & { fatalErrorCount: number }) => {
    if (curr.fatalErrorCount > 0) {
      throw new Error(`Found fatal error:

${results.map(result => result.messages.map(m => m.message)).join('\n\n')}
      `);
    }
    return acc + curr.errorCount;
  }, 0);
}

function getFlatESLintOutput(cwd: string): ESLint.LintResult[] {
  const { stdout, stderr } = spawnSync('eslint', ['--format', 'json', '.'], {
    cwd,
    // For Windows, otherwise `stdout` and `stderr` are `null`
    shell: os.platform() === 'win32',
  });

  return parseESLintOutput({ stdout, stderr });
}

function getLegacyESLintOutput(cwd: string): ESLint.LintResult[] {
  const { stdout, stderr } = spawnSync(
    'eslint',
    ['--format', 'json', '--ignore-pattern', 'eslint.config.js', '.'],
    {
      cwd,
      env: { ...process.env, ESLINT_USE_FLAT_CONFIG: 'false' },
      // For Windows, otherwise `stdout` and `stderr` are `null`
      shell: os.platform() === 'win32',
    },
  );

  return parseESLintOutput({ stdout, stderr });
}

function parseESLintOutput({
  stdout,
  stderr,
}: {
  stdout: Buffer;
  stderr: Buffer;
}): ESLint.LintResult[] {
  const errorOutput = stderr
    .toString()
    .replace(
      /\(node:\d+\) \[DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead./,
      '',
    )
    .replace(
      /\(node:\d+\) ESLintRCWarning: You are using an eslintrc configuration file, which is deprecated and support will be removed in v10.0.0. Please migrate to an eslint.config.js file. See https:\/\/eslint.org\/docs\/latest\/use\/configure\/migration-guide for details./,
      '',
    )
    .replace(
      'An eslintrc configuration file is used because you have the ESLINT_USE_FLAT_CONFIG environment variable set to false. If you want to use an eslint.config.js file, remove the environment variable. If you want to find the location of the eslintrc configuration file, use the --debug flag.',
      '',
    )
    .replace('(Use `node --trace-deprecation ...` to show where the warning was created)', '')
    .replace('(Use `node --trace-warnings ...` to show where the warning was created)', '')
    .trimEnd();
  if (errorOutput) {
    throw new Error(errorOutput);
  }
  const output = stdout.toString();
  const start = output.indexOf('[{');
  const end = output.lastIndexOf('}]') + 2;
  return JSON.parse(output.slice(start, end));
}

function normalizeResults(results: ESLint.LintResult[]) {
  return results
    .map(result => ({
      filePath: slash(path.relative(CWD, result.filePath)),
      messages: result.messages,
    }))
    .filter(result => result.messages.length > 0);
}

describe('Examples', () => {
  it('should work programmatically', () => {
    const cwd = path.join(CWD, 'examples', 'programmatic');
    testESLintOutput(cwd, 6);
  });

  it('should work on `.js` files', () => {
    const cwd = path.join(CWD, 'examples', 'code-file');
    testESLintOutput(cwd, 4);
  });

  it('should work with `graphql-config`', () => {
    const cwd = path.join(CWD, 'examples', 'graphql-config');
    testESLintOutput(cwd, 2);
  });

  it('should work with `eslint-plugin-prettier`', () => {
    const cwd = path.join(CWD, 'examples', 'prettier');
    testESLintOutput(cwd, 23);
  });

  it('should work in monorepo', () => {
    const cwd = path.join(CWD, 'examples', 'monorepo');
    testESLintOutput(cwd, 11);
  });

  it('should work in svelte', () => {
    const cwd = path.join(CWD, 'examples', 'svelte-code-file');
    testESLintOutput(cwd, 2);
  });

  it('should work in vue', () => {
    const cwd = path.join(CWD, 'examples', 'vue-code-file');
    testESLintOutput(cwd, 4);
  });

  it('should work in multiple projects', () => {
    const cwd = path.join(CWD, 'examples', 'multiple-projects-graphql-config');
    testESLintOutput(cwd, 4);
  });

  it('should work with custom rules', () => {
    const cwd = path.join(CWD, 'examples', 'custom-rules');
    const flatResults = getFlatESLintOutput(cwd);
    // Windows has some offset for `range`, I think due \r\n handling
    if (os.platform() !== 'win32') {
      expect(normalizeResults(flatResults)).toMatchSnapshot();
    }
    expect(countErrors(flatResults)).toBe(1);
  });
});

function testESLintOutput(cwd: string, errorCount: number): void {
  const flatResults = getFlatESLintOutput(cwd);
  const results = getLegacyESLintOutput(cwd);
  // Windows has some offset for `range`, I think due \r\n handling
  if (os.platform() !== 'win32') {
    expect(normalizeResults(flatResults)).toMatchSnapshot();
    expect(normalizeResults(results)).toMatchSnapshot();
  }
  expect(countErrors(flatResults)).toBe(errorCount);
  expect(countErrors(results)).toBe(errorCount);
}
