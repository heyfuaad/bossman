import type { ReviewContext } from '../../types/ai-review.js';

const SYSTEM_PROMPT = `You are an expert staff-level software engineer performing a code review. Analyze the provided code changes and give specific, actionable feedback.

## Review Focus
- Correctness: runtime errors, logical bugs, off-by-one, wrong conditions, missing edge cases
- Architecture: separation of concerns, unnecessary coupling, design patterns
- Performance: memory leaks, inefficient algorithms, unnecessary work
- Security: injection, auth issues, data exposure
- Maintainability: naming, complexity, dead code

## Output Structure

Your review must include TWO sections:

### 1. Line-level findings
Specific issues tied to exact lines in the code. Each must reference a file path and line number.
- Reference line numbers from the file contents provided (NOT diff line numbers)
- For additions/modifications, use line numbers from the NEW version of the file (side: "new")
- For deletions, use line numbers from the OLD version (side: "old")

### 2. Architecture observations
High-level observations about the overall approach, design, or patterns. These are NOT tied to specific lines. Use these for:
- Architectural concerns (coupling, separation of concerns, missing abstractions)
- Cross-cutting issues that span multiple files
- Design pattern suggestions
- Missing error handling strategies
- Overall approach feedback (is this the right way to solve the problem?)
- Suggestions for alternative approaches

## Rules
- Only comment on the actual changes shown in the diff
- Do NOT comment on formatting, import ordering, or trivial style issues
- Be concise and specific; each finding must be actionable
- Categorize each finding/observation by severity:
  - critical: bugs, security vulnerabilities, data loss risks, crashes
  - important: performance issues, error handling gaps, logic errors, architectural concerns
  - improvement: naming, readability, minor refactors, design suggestions`;

export function buildSystemPrompt(conventions?: string): string {
  if (!conventions) {
    return SYSTEM_PROMPT;
  }

  return `${SYSTEM_PROMPT}

## Project Conventions
The following project-specific conventions and guidelines should inform your review:

${conventions}`;
}

export function buildUserPrompt(context: ReviewContext): string {
  const parts: string[] = [];

  parts.push('## Diff\n```diff\n' + context.diff + '\n```');

  if (context.files.length > 0) {
    parts.push('\n## Changed Files (full contents)\n');

    for (const file of context.files) {
      if (file.newContent) {
        parts.push(`### File: ${file.path} (NEW version)`);
        const numbered = file.newContent
          .split('\n')
          .map((line, i) => `${i + 1} | ${line}`)
          .join('\n');
        parts.push('```\n' + numbered + '\n```\n');
      }

      if (file.oldContent) {
        const oldLabel = file.oldPath || file.path;
        parts.push(`### File: ${oldLabel} (OLD version)`);
        const numbered = file.oldContent
          .split('\n')
          .map((line, i) => `${i + 1} | ${line}`)
          .join('\n');
        parts.push('```\n' + numbered + '\n```\n');
      }
    }
  }

  parts.push('\nRespond with your findings as structured JSON.');

  return parts.join('\n');
}

export const AI_REVIEW_RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    findings: {
      type: 'array' as const,
      description: 'Line-level findings tied to specific code locations',
      items: {
        type: 'object' as const,
        properties: {
          filePath: { type: 'string' as const, description: 'Path of the file being reviewed' },
          side: {
            type: 'string' as const,
            enum: ['old', 'new'],
            description: 'Whether the finding is on the old or new side of the diff',
          },
          line: {
            description: 'Line number from the file content',
            type: 'number' as const,
          },
          severity: {
            type: 'string' as const,
            enum: ['critical', 'important', 'improvement'],
          },
          title: { type: 'string' as const, description: 'Short one-line summary of the finding' },
          body: {
            type: 'string' as const,
            description: 'Detailed explanation with markdown formatting',
          },
          suggestion: {
            type: 'object' as const,
            properties: {
              original: { type: 'string' as const },
              replacement: { type: 'string' as const },
            },
            required: ['original', 'replacement'],
          },
        },
        required: ['filePath', 'side', 'line', 'severity', 'title', 'body'],
      },
    },
    architectureComments: {
      type: 'array' as const,
      description: 'High-level architecture observations not tied to specific lines',
      items: {
        type: 'object' as const,
        properties: {
          severity: {
            type: 'string' as const,
            enum: ['critical', 'important', 'improvement'],
          },
          title: { type: 'string' as const, description: 'Short one-line summary' },
          body: {
            type: 'string' as const,
            description: 'Detailed explanation of the architectural observation',
          },
          relatedFiles: {
            type: 'array' as const,
            items: { type: 'string' as const },
            description: 'File paths this observation relates to',
          },
        },
        required: ['severity', 'title', 'body'],
      },
    },
    summary: {
      type: 'string' as const,
      description: 'Brief overall summary of the review',
    },
  },
  required: ['findings', 'architectureComments', 'summary'],
};
