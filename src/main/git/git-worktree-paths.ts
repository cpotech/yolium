import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { validateBranchName } from './git-repository'

function msys2ToWindowsPath(p: string): string {
  const match = p.match(/^\/([a-zA-Z])\//)
  if (match) {
    return `${match[1].toUpperCase()}:/${p.slice(3)}`
  }
  return p
}

export function fixWorktreeGitFile(worktreePath: string): void {
  const gitFile = path.join(worktreePath, '.git')
  let resolvedGitdir: string | null = null

  try {
    const content = fs.readFileSync(gitFile, 'utf-8').trim()
    if (content.startsWith('gitdir: /')) {
      const gitdir = content.replace('gitdir: ', '')
      const fixed = msys2ToWindowsPath(gitdir)
      if (fixed !== gitdir) {
        fs.writeFileSync(gitFile, `gitdir: ${fixed}\n`)
      }
      resolvedGitdir = fixed
    } else if (content.startsWith('gitdir: ')) {
      resolvedGitdir = content.replace('gitdir: ', '')
    }
  } catch {
    // Best effort.
  }

  if (!resolvedGitdir) {
    return
  }

  try {
    const backRefFile = path.join(resolvedGitdir, 'gitdir')
    const backRefContent = fs.readFileSync(backRefFile, 'utf-8').trim()
    if (backRefContent.startsWith('/')) {
      const fixed = msys2ToWindowsPath(backRefContent)
      if (fixed !== backRefContent) {
        fs.writeFileSync(backRefFile, `${fixed}\n`)
      }
    }
  } catch {
    // Best effort.
  }
}

export function generateBranchName(): string {
  return `yolium-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

export function getWorktreePath(projectPath: string, branchName: string): string {
  validateBranchName(branchName)
  const absolutePath = path.resolve(projectPath)
  const hash = crypto.createHash('sha256').update(absolutePath).digest('hex').substring(0, 12)
  return path.join(os.homedir(), '.yolium', 'worktrees', `yolium-${hash}`, branchName)
}
