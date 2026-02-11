export type ProjectType =
  | 'nodejs'
  | 'python'
  | 'rust'
  | 'go'
  | 'java-maven'
  | 'java-gradle'
  | 'dotnet';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | null;

export interface PreFlightResult {
  success: boolean;
  errors: string[];
  availableDiskBytes: number | null;
}
