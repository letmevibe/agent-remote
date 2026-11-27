import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitDiffResponse, GitFileChange } from '@agent-remote/protocol';

const execFileAsync = promisify(execFile);

export async function getWorkspaceGitDiff(workspacePath: string): Promise<GitDiffResponse> {
  try {
    const [{ stdout: branchOut }, { stdout: statusOut }, { stdout: diffOut }] =
      await Promise.all([
        execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: workspacePath,
        }).catch(() => ({ stdout: 'main' })),
        execFileAsync('git', ['status', '--porcelain'], {
          cwd: workspacePath,
        }).catch(() => ({ stdout: '' })),
        execFileAsync('git', ['diff', '--unified=3'], {
          cwd: workspacePath,
          maxBuffer: 4 * 1024 * 1024,
        }).catch(() => ({ stdout: '' })),
      ]);

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

        return {
          path: filePath,
          status,
          additions: 0,
          deletions: 0,
        };
      });

    return {
      workspacePath,
      branch: branchOut.trim() || 'HEAD',
      files,
      diff: diffOut,
    };
  } catch {
    return {
      workspacePath,
      branch: 'unknown',
      files: [],
      diff: '',
    };
  }
}
