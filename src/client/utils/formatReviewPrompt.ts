import type { DiffComment } from '../../types/diff';
import type { ArchitectureComment } from '../hooks/useAIReview';

export function formatReviewPrompt(
  aiComments: DiffComment[],
  architectureComments: ArchitectureComment[],
  userComments: DiffComment[],
): string {
  const parts: string[] = [];

  parts.push(
    'The following issues were found during code review. For each finding, verify whether it is a legitimate issue by reading the relevant code. If it is legit, fix it. If it is not a real issue (false positive, already handled, or intentional), briefly explain why it does not need to be fixed.\n',
  );

  // Architecture observations first (high-level context)
  if (architectureComments.length > 0) {
    parts.push('## Architecture Observations\n');
    for (const comment of architectureComments) {
      const severity = comment.severity.toUpperCase();
      parts.push(`### [${severity}] ${comment.title}`);
      parts.push(comment.body);
      if (comment.relatedFiles && comment.relatedFiles.length > 0) {
        parts.push(`Related files: ${comment.relatedFiles.join(', ')}`);
      }
      parts.push('');
    }
  }

  // AI line-level findings
  if (aiComments.length > 0) {
    parts.push('## AI Findings\n');
    for (const comment of aiComments) {
      const line =
        typeof comment.position.line === 'number'
          ? comment.position.line
          : `${comment.position.line.start}-${comment.position.line.end}`;
      parts.push(`### ${comment.filePath}:${line}`);
      const body = comment.body.replace(/^[🔴🟠🟡]\s*/, '');
      parts.push(body);
      parts.push('');
    }
  }

  // Reviewer comments (from the human)
  if (userComments.length > 0) {
    parts.push('## Reviewer Comments\n');
    for (const comment of userComments) {
      const line =
        typeof comment.position.line === 'number'
          ? comment.position.line
          : `${comment.position.line.start}-${comment.position.line.end}`;
      parts.push(`### ${comment.filePath}:${line}`);
      parts.push(comment.body);
      parts.push('');
    }
  }

  return parts.join('\n').trim();
}
