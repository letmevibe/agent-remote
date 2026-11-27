import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitDiffResponse, GitFileChange } from '@agent-remote/protocol';

const execFileAsync = promisify(execFile);

export async function getWorkspaceGitDiff(workspacePath: string): Promise<GitDiffResponse> {
  try {
    const [
      { stdout: branchOut },
      { stdout: statusOut },
      { stdout: numstatOut },
      { stdout: diffOut },
    ] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: workspacePath,
      }).catch(() => ({ stdout: 'main' })),
      execFileAsync('git', ['status', '--porcelain'], {
        cwd: workspacePath,
      }).catch(() => ({ stdout: '' })),
      execFileAsync('git', ['diff', '--numstat'], {
        cwd: workspacePath,
      }).catch(() => ({ stdout: '' })),
      execFileAsync('git', ['diff', '--unified=3'], {
        cwd: workspacePath,
        maxBuffer: 4 * 1024 * 1024,
      }).catch(() => ({ stdout: '' })),
    ]);

    const statsByPath = new Map<string, { additions: number; deletions: number }>();
    for (const line of numstatOut.split(/\r?\n/)) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const additions = Number.parseInt(parts[0] ?? '0', 10) || 0;
        const deletions = Number.parseInt(parts[1] ?? '0', 10) || 0;
        const filePath = parts[2]!.trim();
        statsByPath.set(filePath, { additions, deletions });
      }
    }

    let totalAdditions = 0;
    let totalDeletions = 0;

    const files: GitFileChange[] = statusOut
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const code = line.slice(0, 2).trim();
        const filePath = line.slice(3).trim();
        let status: GitFileChange['status'] = 'modified';
        if (code === '??') status = 'untracked';
        else if (code.includes('A')) status = 'added';
        else if (code.includes('D')) status = 'deleted';
        else if (code.includes('R')) status = 'renamed';

        const stat = statsByPath.get(filePath) ?? { additions: 0, deletions: 0 };
        totalAdditions += stat.additions;
        totalDeletions += stat.deletions;

        return {
          path: filePath,
          status,
          additions: stat.additions,
          deletions: stat.deletions,
        };
      });

    return {
      workspacePath,
      branch: branchOut.trim() || 'HEAD',
      files,
      totalAdditions,
      totalDeletions,
      diff: diffOut,
    };
  } catch {
    return {
      workspacePath,
      branch: 'unknown',
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      diff: '',
    };
  }
}
