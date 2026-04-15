import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScheduleType } from '@shared/types/schedule';
import type { KanbanAttachment } from '@shared/types/kanban';

export interface BuildPromptParams {
  systemPrompt: string;
  goal: string;
  conversationHistory: string;
  provider?: string;
  agentName?: string;
  attachments?: KanbanAttachment[];
  containerProjectPath?: string;
  projectPath?: string;
}

/**
 * Build KB context section for agent prompts.
 * Reads the KB index from the host filesystem (projectPath) but references
 * the container path (containerProjectPath) in the prompt text so agents
 * can read KB pages inside the container.
 */
export function buildKbContext(projectPath: string, containerProjectPath: string, agentName?: string): string {
  if (agentName === 'kb-agent') return '';

  const indexPath = path.join(projectPath, '.yolium', 'kb', '_index.md');
  if (!fs.existsSync(indexPath)) return '';

  const indexContent = fs.readFileSync(indexPath, 'utf-8').trim();
  if (!indexContent) return '';

  return `\n\n## Project Knowledge Base\n\nA project knowledge base exists at \`${containerProjectPath}/.yolium/kb/\`. Index:\n\n${indexContent}\n\nRead relevant KB pages before starting work to leverage existing project knowledge.`;
}

/**
 * Inline protocol reference for non-Claude providers.
 * Embeds the full @@YOLIUM: protocol directly in the prompt so models
 * that deprioritize file-based instructions still follow the protocol.
 */
export const INLINE_PROTOCOL = `## @@YOLIUM: Protocol (MANDATORY)

You MUST communicate with Yolium by outputting JSON messages prefixed with \`@@YOLIUM:\` as plain text lines in your output.
Your work will be marked as FAILED if you do not output these messages.

### Message Types

**progress** — Report step progress (does not pause execution):
\`\`\`
@@YOLIUM:{"type":"progress","step":"<step>","detail":"<what you are doing>"}
\`\`\`
Fields: step (string, required), detail (string, required), attempt (number, optional), maxAttempts (number, optional)

**comment** — Post commentary to the work item thread:
\`\`\`
@@YOLIUM:{"type":"comment","text":"<your commentary>"}
\`\`\`
Fields: text (string, required — supports markdown)

**ask_question** — Pause and wait for user input (only when truly blocked):
\`\`\`
@@YOLIUM:{"type":"ask_question","text":"<question>","options":["A","B"]}
\`\`\`
Fields: text (string, required), options (string[], optional)

**complete** — Signal successful completion (MUST be your last protocol message):
\`\`\`
@@YOLIUM:{"type":"complete","summary":"<what you accomplished>"}
\`\`\`
Fields: summary (string, required)

**error** — Signal failure:
\`\`\`
@@YOLIUM:{"type":"error","message":"<reason for failure>"}
\`\`\`
Fields: message (string, required)

**create_item** — Create a new kanban work item:
\`\`\`
@@YOLIUM:{"type":"create_item","title":"<title>","description":"<details>","agentProvider":"claude","order":1}
\`\`\`
Fields: title (string, required), description (string, optional), branch (string, optional), agentProvider (enum: claude|codex|opencode, required), order (number, required), model (string, optional)

**update_description** — Update the current work item's description:
\`\`\`
@@YOLIUM:{"type":"update_description","description":"<new description>"}
\`\`\`
Fields: description (string, required)

**set_test_specs** — Attach concrete test specifications to the work item (plan agents use this so code agents implement tests first):
\`\`\`
@@YOLIUM:{"type":"set_test_specs","specs":[{"file":"src/tests/foo.test.ts","description":"Unit tests for foo module","specs":["should return empty array when no items","should throw on invalid input"]}]}
\`\`\`
Fields: specs (array, required — each element: file (string), description (string), specs (string[]))

### Required Protocol Usage

1. Your FIRST output MUST be a progress message: \`@@YOLIUM:{"type":"progress","step":"analyze","detail":"Starting analysis"}\`
2. Output progress messages at each major step of your work
3. Post comment messages with your findings and results
4. Your LAST protocol message MUST be either a complete or error message
5. Output these as plain text lines — they will be parsed from your stdout
6. **No commit trailers** — Never add Co-Authored-By, Signed-off-by, or any other trailers to commit messages. Commits must contain only the commit message itself.`;

/**
 * File-based output instructions for non-Claude plan agents.
 * Codex models have internal reasoning and often don't externalize their
 * analysis as text. This forces them to write their plan to a file that
 * the system reads after the agent exits.
 */
export const FILE_OUTPUT_PLAN = `## CRITICAL: Write Your Plan to a File

After completing your analysis, you MUST write your final implementation plan to a file named \`.yolium/plan.md\` in the \`.yolium/\` directory (create it if it doesn't exist).

The file must include:
- Context and summary of your findings
- Chosen approach and rationale
- Ordered implementation steps with specific files to modify
- Acceptance criteria

This file is MANDATORY — the system reads it to capture your plan. If you do not write this file, your work will be lost.`;

/**
 * File-based output instructions for non-Claude code agents.
 * Ensures Codex writes a summary of changes for visibility.
 */
export const FILE_OUTPUT_CODE = `## CRITICAL: Write Your Summary to a File

After completing your implementation and committing changes, you MUST write a summary to a file named \`.yolium/summary.md\` in the \`.yolium/\` directory (create it if it doesn't exist).

The file must include:
- What was implemented
- Files modified and why
- Tests added and results
- Any caveats or follow-up items

This file is MANDATORY — the system reads it to capture your work summary. If you do not write this file, your conclusions will be lost.`;

/**
 * File-based output instructions for non-Claude scout agents.
 * Ensures the scout dossier is written to a known path for capture.
 */
export const FILE_OUTPUT_SCOUT = `## CRITICAL: Write Your Dossier to a File

After completing your research, you MUST write the final JSON dossier array to a file named \`.yolium/scout.json\` in the \`.yolium/\` directory (create it if it doesn't exist).

The file must be a valid JSON array of lead dossier objects, each containing:
- company (name, website, industry, description, headquarters, employeeCount)
- contacts (name, title, relevance)
- techStack (array of technologies)
- signals (recentFunding, hiring, recentNews, growthIndicators)
- qualification (grade, mustHavesMet, confidence, notes)
- sources (array of URLs)

This file is MANDATORY — the system reads it to capture your dossier. If you do not write this file, your research will be lost.`;

/**
 * File-based output instructions for non-Claude verify agents.
 * Ensures the verification report is written to a known path for capture.
 */
export const FILE_OUTPUT_VERIFY = `## CRITICAL: Write Your Verification Report to a File

After completing your verification, you MUST write your final verification report to a file named \`.yolium/verify.md\` in the \`.yolium/\` directory (create it if it doesn't exist).

The file must include:
- Verification status (PASS / FAIL / PARTIAL)
- Task completion assessment
- Issues found (if any)
- Code quality observations
- Guideline compliance
- Test results
- Recommendation (approve, request changes, or needs re-work)

This file is MANDATORY — the system reads it to capture your verification report. If you do not write this file, your report will be lost.`;

/**
 * File-based output instructions for non-Claude kb agents.
 * Ensures the KB update summary is written to a known path for capture.
 */
export const FILE_OUTPUT_KB = `## CRITICAL: Write Your KB Summary to a File

After updating the knowledge base, you MUST write a summary to a file named \`.yolium/kb-summary.md\` in the \`.yolium/\` directory (create it if it doesn't exist).

The file must include:
- Pages created or updated
- Key knowledge extracted
- Categories covered
- Cross-references added

This file is MANDATORY — the system reads it to capture your KB update summary. If you do not write this file, your work will be lost.`;

function buildAttachmentsSection(attachments: KanbanAttachment[], containerProjectPath: string): string {
  if (attachments.length === 0) return '';
  const lines = attachments.map(a =>
    `- \`${containerProjectPath}/.yolium/attachments/${a.filename}\` (${a.mimeType}, ${a.size} bytes)`
  );
  return `\n\n## Attachments\n\nThe following files are available in the worktree:\n${lines.join('\n')}`;
}

export function buildAgentPrompt(params: BuildPromptParams): string {
  const { systemPrompt, goal, conversationHistory, provider, agentName, attachments, containerProjectPath, projectPath } = params;

  // Build KB context if both paths are available
  const kbContext = projectPath && containerProjectPath
    ? buildKbContext(projectPath, containerProjectPath, agentName)
    : '';

  // For non-Claude providers, inline the protocol and system prompt
  // so the model has everything in its primary prompt context
  if (provider && provider !== 'claude') {
    let prompt = `# Yolium Agent Instructions\n\n${INLINE_PROTOCOL}\n\n---\n\n${systemPrompt}\n\n## Current Goal\n\n${goal}`;

    if (attachments && attachments.length > 0 && containerProjectPath) {
      prompt += buildAttachmentsSection(attachments, containerProjectPath);
    }

    if (kbContext) {
      prompt += kbContext;
    }

    // Add file-based output instructions (Codex models don't reliably emit
    // protocol messages, so we also ask them to write output to files that
    // the system reads after the agent exits)
    if (agentName === 'plan-agent') {
      prompt += `\n\n${FILE_OUTPUT_PLAN}`;
    } else if (agentName === 'code-agent') {
      prompt += `\n\n${FILE_OUTPUT_CODE}`;
    } else if (agentName === 'scout-agent') {
      prompt += `\n\n${FILE_OUTPUT_SCOUT}`;
    } else if (agentName === 'verify-agent') {
      prompt += `\n\n${FILE_OUTPUT_VERIFY}`;
    } else if (agentName === 'kb-agent') {
      prompt += `\n\n${FILE_OUTPUT_KB}`;
    }

    if (conversationHistory.trim()) {
      prompt += `\n\n## Previous conversation:\n\n${conversationHistory}\n\nContinue from where you left off.`;
    }

    prompt += `\n\n---\n\nREMINDER: You MUST output @@YOLIUM: protocol messages throughout your work. Start NOW with a progress message.`;

    return prompt;
  }

  // Claude path: system prompt + goal (protocol is already woven into agent definitions)
  let prompt = `${systemPrompt}\n\n## Current Goal\n\n${goal}`;

  if (attachments && attachments.length > 0 && containerProjectPath) {
    prompt += buildAttachmentsSection(attachments, containerProjectPath);
  }

  if (kbContext) {
    prompt += kbContext;
  }

  if (conversationHistory.trim()) {
    prompt += `\n\n## Previous conversation:\n\n${conversationHistory}\n\nContinue from where you left off.`;
  }

  return prompt;
}

/**
 * Build the full prompt for a scheduled agent run.
 * Uses the prompt template if available, otherwise generates a fallback
 * directive from the specialist's description and schedule type.
 */
export function buildScheduledPrompt(params: {
  systemPrompt: string;
  scheduleType: ScheduleType;
  promptTemplate: string | undefined;
  description: string;
  memoryContext: string;
  projectPaths?: Array<{ hostPath: string; containerPath: string }>;
}): string {
  const { systemPrompt, scheduleType, promptTemplate, description, memoryContext, projectPaths } = params;
  let prompt = systemPrompt;

  const template = promptTemplate?.trim();
  if (template) {
    prompt += `\n\n## Schedule: ${scheduleType}\n\n${template}`;
  } else {
    prompt += `\n\n## Schedule: ${scheduleType}\n\nExecute your ${scheduleType} task: ${description}. Review recent run history to avoid repeating work, then report findings and actions taken.`;
  }

  if (projectPaths && projectPaths.length > 0) {
    const lines = projectPaths.map(p => `- \`${p.containerPath}\` (host: \`${p.hostPath}\`)`);
    prompt += `\n\n## Projects\n\nThe following project directories are mounted read-only into this container:\n${lines.join('\n')}`;
  }

  if (memoryContext) {
    prompt += `\n\n${memoryContext}`;
  }

  // Protocol reminder — reinforces @@YOLIUM: message requirements at the end of the prompt
  prompt += `\n\n---\n\nCRITICAL: You MUST output @@YOLIUM: protocol messages. At minimum, emit a run_result before finishing:\n@@YOLIUM:{"type":"run_result","outcome":"completed|no_action|failed","summary":"...","tokensUsed":0}\nIf you take external actions (API calls, posts, etc.), also emit action messages:\n@@YOLIUM:{"type":"action","action":"action_name","data":{...},"timestamp":"..."}`;

  return prompt;
}
