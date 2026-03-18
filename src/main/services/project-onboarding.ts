import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackageManager, PreFlightResult, ProjectType } from '@shared/types/onboarding';

const MIN_DISK_SPACE_BYTES = 1024 * 1024 * 1024;
const CONTEXT_FILES = ['README.md', 'CLAUDE.md', 'AGENTS.md'] as const;
const MAX_CONTEXT_CHARS_PER_FILE = 4000;

function fileExists(projectPath: string, fileName: string): boolean {
  return fs.existsSync(path.join(projectPath, fileName));
}

function detectDotnetProject(projectPath: string): boolean {
  try {
    const entries = fs.readdirSync(projectPath);
    return entries.some((entry) => /\.(sln|csproj|fsproj)$/i.test(entry));
  } catch { /* directory may not be readable */
    return false;
  }
}

function trimContext(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_CONTEXT_CHARS_PER_FILE) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_CONTEXT_CHARS_PER_FILE)}\n...[truncated]`;
}

export function detectProjectTypes(projectPath: string): ProjectType[] {
  const detected = new Set<ProjectType>();

  if (fileExists(projectPath, 'package.json')) {
    detected.add('nodejs');
  }
  if (
    fileExists(projectPath, 'requirements.txt')
    || fileExists(projectPath, 'pyproject.toml')
    || fileExists(projectPath, 'setup.py')
    || fileExists(projectPath, 'Pipfile')
  ) {
    detected.add('python');
  }
  if (fileExists(projectPath, 'Cargo.toml')) {
    detected.add('rust');
  }
  if (fileExists(projectPath, 'go.mod')) {
    detected.add('go');
  }
  if (fileExists(projectPath, 'pom.xml')) {
    detected.add('java-maven');
  }
  if (fileExists(projectPath, 'build.gradle') || fileExists(projectPath, 'build.gradle.kts')) {
    detected.add('java-gradle');
  }
  if (detectDotnetProject(projectPath)) {
    detected.add('dotnet');
  }

  return Array.from(detected);
}

export function detectPackageManager(projectPath: string): PackageManager {
  if (fileExists(projectPath, 'pnpm-lock.yaml')) {
    return 'pnpm';
  }
  if (fileExists(projectPath, 'yarn.lock')) {
    return 'yarn';
  }
  if (fileExists(projectPath, 'package-lock.json') || fileExists(projectPath, 'npm-shrinkwrap.json')) {
    return 'npm';
  }
  return null;
}

const BASE_GITIGNORE = [
  '.DS_Store',
  'Thumbs.db',
  '.idea/',
  '.vscode/',
  '*.log',
  '.env',
  '.env.*',
];

const GITIGNORE_BY_TYPE: Record<ProjectType, string[]> = {
  nodejs: [
    'node_modules/',
    'dist/',
    'build/',
    '.npm/',
    '.pnpm-store/',
    '.yarn/',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    'pnpm-debug.log*',
  ],
  python: [
    '__pycache__/',
    '*.pyc',
    '*.pyo',
    '.venv/',
    'venv/',
    '.pytest_cache/',
    '.mypy_cache/',
    '.ruff_cache/',
  ],
  rust: [
    'target/',
  ],
  go: [
    'bin/',
    '*.test',
    'coverage.out',
  ],
  'java-maven': [
    'target/',
    '*.class',
    '*.jar',
  ],
  'java-gradle': [
    '.gradle/',
    'build/',
    '*.class',
    '*.jar',
  ],
  dotnet: [
    'bin/',
    'obj/',
    '*.user',
    '*.suo',
  ],
};

export function generateGitignore(projectTypes: ProjectType[]): string {
  const entries = new Set<string>(BASE_GITIGNORE);

  for (const projectType of projectTypes) {
    const rules = GITIGNORE_BY_TYPE[projectType] || [];
    for (const rule of rules) {
      entries.add(rule);
    }
  }

  return `${Array.from(entries).join('\n')}\n`;
}

export function generateProjectContext(projectPath: string): string {
  const sections: string[] = [];

  for (const fileName of CONTEXT_FILES) {
    const fullPath = path.join(projectPath, fileName);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const normalized = trimContext(raw);
      if (!normalized) {
        continue;
      }

      sections.push(`## ${fileName}\n${normalized}`);
    } catch { /* Ignore unreadable files and continue collecting other context. */
    }
  }

  return sections.join('\n\n').trim();
}

export function validatePreFlight(projectPath: string): PreFlightResult {
  return validatePreFlightWithAdapters(projectPath, {
    accessSync: fs.accessSync,
    statfsSync: fs.statfsSync,
  });
}

interface PreFlightAdapters {
  accessSync: (path: fs.PathLike, mode?: number) => void;
  statfsSync: (path: fs.PathLike) => ReturnType<typeof fs.statfsSync>;
}

export function validatePreFlightWithAdapters(projectPath: string, adapters: PreFlightAdapters): PreFlightResult {
  const errors: string[] = [];
  let availableDiskBytes: number | null = null;

  try {
    adapters.accessSync(projectPath, fs.constants.W_OK);
  } catch { /* error already recorded in errors array above */
    errors.push('Project directory is not writable.');
  }

  try {
    const stat = adapters.statfsSync(projectPath);
    availableDiskBytes = Number(stat.bavail) * Number(stat.bsize);
    if (Number.isFinite(availableDiskBytes) && availableDiskBytes < MIN_DISK_SPACE_BYTES) {
      errors.push('Insufficient disk space. At least 1 GB is required.');
    }
  } catch { /* statfs not supported on this platform or path — error already recorded above */
    errors.push('Unable to determine available disk space.');
  }

  return {
    success: errors.length === 0,
    errors,
    availableDiskBytes,
  };
}
