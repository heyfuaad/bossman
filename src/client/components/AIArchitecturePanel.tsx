import { Bot, CheckCircle2, ChevronDown, FileCode2, Sparkles, type LucideIcon } from 'lucide-react';

import type { ArchitectureComment } from '../hooks/useAIReview';

import { FindingMarkdown } from './FindingMarkdown';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { cn } from './ui/utils';

interface AIArchitecturePanelProps {
  comments: ArchitectureComment[];
}

type Severity = ArchitectureComment['severity'];

const SEVERITY_META: Record<Severity, { label: string; labelColor: string }> = {
  critical: { label: 'Critical', labelColor: 'text-red-400' },
  important: { label: 'Important', labelColor: 'text-orange-400' },
  suggestion: { label: 'Suggestion', labelColor: 'text-blue-400' },
  observation: { label: 'Observation', labelColor: 'text-green-400' },
};

function getBasename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function ArchitectureCard({ comment }: { comment: ArchitectureComment }) {
  const meta = SEVERITY_META[comment.severity];

  return (
    <AccordionItem
      value={comment.id}
      className={cn(
        'group rounded-lg bg-github-bg-tertiary/60 backdrop-blur-sm',
        'ring-1 ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        'transition-all duration-200',
        'hover:bg-github-bg-tertiary hover:ring-white/10',
      )}
    >
      <AccordionTrigger className="w-full px-4 py-3.5">
        <div className="flex flex-1 flex-col items-start gap-0.5 min-w-0">
          <span className="text-sm font-semibold text-github-text-primary leading-tight text-left">
            {comment.title}
          </span>
          <span className={cn('text-[11px] font-medium uppercase tracking-wide', meta.labelColor)}>
            {meta.label}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-github-bg-primary/60 px-2 py-0.5 text-[10px] font-medium text-github-text-secondary ring-1 ring-white/5">
          <Bot size={10} />
          {comment.model === 'claude' ? 'Claude' : 'Gemini'}
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-0">
        <FindingMarkdown body={comment.body} />
        {comment.relatedFiles && comment.relatedFiles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {comment.relatedFiles.map((file) => (
              <span
                key={file}
                title={file}
                className="inline-flex items-center gap-1.5 rounded-md bg-github-bg-primary/70 px-2 py-1 font-mono text-[11px] text-github-text-secondary ring-1 ring-white/5 transition-colors hover:bg-github-bg-primary hover:text-github-text-primary hover:ring-white/10"
              >
                <FileCode2 size={10} className="shrink-0 text-github-text-muted" />
                {getBasename(file)}
              </span>
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

interface SectionProps {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  comments: ArchitectureComment[];
  defaultOpen: boolean;
  sectionValue: string;
}

function Section({
  title,
  icon: Icon,
  iconColor,
  iconBg,
  comments,
  defaultOpen,
  sectionValue,
}: SectionProps) {
  if (comments.length === 0) return null;

  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? sectionValue : undefined}>
      <AccordionItem value={sectionValue} className="group/section">
        <AccordionTrigger className="py-1 px-1 mb-1.5 w-fit" hideChevron>
          <div
            className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', iconBg)}
          >
            <Icon size={13} className={iconColor} />
          </div>
          <span className="text-[13px] font-semibold text-github-text-primary tracking-tight">
            {title}
          </span>
          <span className="text-[11px] text-github-text-muted tabular-nums">{comments.length}</span>
          <ChevronDown
            size={14}
            className="shrink-0 text-github-text-muted transition-transform duration-200 group-data-[state=open]/section:rotate-180"
          />
        </AccordionTrigger>
        <AccordionContent>
          <Accordion type="multiple" defaultValue={comments.map((c) => c.id)}>
            <div className="flex flex-col gap-2">
              {comments.map((comment) => (
                <ArchitectureCard key={comment.id} comment={comment} />
              ))}
            </div>
          </Accordion>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function AIArchitecturePanel({ comments }: AIArchitecturePanelProps) {
  const actionableComments = comments.filter((c) => c.severity !== 'observation');
  const observationComments = comments.filter((c) => c.severity === 'observation');

  if (comments.length === 0) return null;

  return (
    <div className="mx-4 mt-4 mb-4 flex flex-col gap-4">
      <Section
        title="Architecture Findings"
        icon={Sparkles}
        iconColor="text-purple-300"
        iconBg="bg-purple-500/15"
        comments={actionableComments}
        defaultOpen={true}
        sectionValue="findings"
      />
      <Section
        title="Positive Observations"
        icon={CheckCircle2}
        iconColor="text-green-300"
        iconBg="bg-green-500/15"
        comments={observationComments}
        defaultOpen={false}
        sectionValue="observations"
      />
    </div>
  );
}
