# CLAUDE.md

Make commits in English.

In this repository, do not commit until explicitly asked to commit.

## Project Overview

**bossman** is a local AI code review tool built on top of [difit](https://github.com/yoshiko-pg/difit) (MIT licensed). difit provides the diff viewer, comment system, and syntax highlighting. bossman adds automatic AI code review via Claude and/or Gemini, rendering findings as inline comments and architecture-level observations.

## Quick Reference

```bash
pnpm install              # Install dependencies
pnpm run build            # Build CLI + client (tsc + vite)
pnpm run dev              # Dev mode with hot reload
pnpm test                 # Run vitest tests
pnpm run check            # Lint (oxlint)
pnpm run format           # Format (oxfmt)

# Run locally (from any git repo with a .env containing API keys)
node dist/cli/index.js HEAD              # Review latest commit
node dist/cli/index.js HEAD main         # Review full PR (HEAD vs main)
node dist/cli/index.js . main            # Review uncommitted changes vs main
```

## Architecture

```
CLI (commander + dotenv)
  -> Express Server (port 4966)
     -> GET /api/diff              (existing: structured diff data)
     -> GET /api/ai-review         (NEW: SSE stream of AI findings)
        -> AIReviewOrchestrator
           -> Claude provider (Anthropic SDK, tool_use for structured output)
           -> Gemini provider (Google AI SDK, JSON response mode)
           -> Context builder (reads full files + CLAUDE.md from reviewed repo)
     -> AI review cache (in-memory, survives page refreshes)
  -> React SPA (Vite + Tailwind)
     -> useAIReview hook (SSE consumer, converts findings to DiffComment[])
     -> Merged comments (AI + user) flow through existing comment pipeline
     -> AIReviewStatus (header: per-model progress, re-run button)
     -> AIArchitecturePanel (collapsible panel above file diffs)
     -> InlineComment (severity badges, read-only for AI, blue border)
```

### Key Data Flow

1. Server starts, client loads diff via `GET /api/diff`
2. `useAIReview` hook connects to `GET /api/ai-review` SSE endpoint after 1s delay
3. Server's `AIReviewOrchestrator` reads full file contents + convention files (CLAUDE.md, AGENTS.md, .cursorrules), sends to Claude/Gemini in parallel
4. Each AI provider returns structured JSON: `{ findings: AIReviewFinding[], architectureComments: AIReviewArchitectureComment[], summary: string }`
5. Findings are emitted as SSE events, converted to `DiffComment` in the hook
6. `App.tsx` merges AI `DiffComment[]` with user `DiffComment[]`, normalizes into `Comment[]`
7. The existing comment rendering pipeline handles display (no changes needed to DiffViewer, DiffLineRow, etc.)
8. Results are cached server-side; page refreshes replay instantly from cache
9. Re-run button sends `?rerun=true` to bypass cache

### AI Review Types (two categories)

**Line-level findings**: Attached to a specific file + line number. Rendered as inline comments below diff lines. Have severity (critical/important/improvement) shown as colored badges.

**Architecture observations**: High-level feedback not tied to specific lines. Rendered in a collapsible purple panel at the top of the diff view. Include related file paths as chips.

### Comment System Integration

AI comments are injected at the `DiffComment` level and flow through the existing normalization pipeline (`DiffComment` -> `Comment`). Key distinctions:

- AI comments have `author: 'Claude' | 'Gemini'` and `severity` field
- AI comments are read-only (no edit/resolve buttons in InlineComment)
- AI comments have a blue left border (user comments have yellow)
- The "Copy All Prompt" button formats ALL comments (AI findings + architecture + user comments) into a structured prompt for pasting into any AI coding agent

### Heartbeat and Server Lifecycle

difit shuts down when the browser tab disconnects. We added a 2-second grace period so page refreshes don't kill the server. When the old heartbeat disconnects, a timer starts. If a new heartbeat connects within 2s (which a refresh does in ~200ms), the shutdown is cancelled via `app.emit('heartbeat-connected')`.

## Files We Added

| File                                            | Purpose                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/types/ai-review.ts`                        | Types: AIReviewFinding, AIReviewArchitectureComment, AIReviewEvent, AIReviewConfig, ReviewContext |
| `src/server/ai-config.ts`                       | Config resolution: env vars > ~/.config/difit/config.json                                         |
| `src/server/ai-review.ts`                       | AIReviewOrchestrator: context builder, parallel provider execution, event emission                |
| `src/server/ai-providers/prompt.ts`             | Shared system/user prompt builder, JSON schema for structured output                              |
| `src/server/ai-providers/claude.ts`             | Claude provider: Anthropic SDK with tool_use                                                      |
| `src/server/ai-providers/gemini.ts`             | Gemini provider: Google AI SDK with JSON response mode                                            |
| `src/client/hooks/useAIReview.ts`               | SSE consumer hook: connects to /api/ai-review, converts to DiffComment[]                          |
| `src/client/components/AIReviewStatus.tsx`      | Header status bar: per-model progress, re-run button                                              |
| `src/client/components/AIArchitecturePanel.tsx` | Collapsible panel for architecture observations                                                   |
| `src/client/utils/formatReviewPrompt.ts`        | Formats all comments (AI + user) into a structured prompt for copy                                |

## Files We Modified

| File                                      | Change                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/types/diff.ts`                       | Added `severity`, `isAIGenerated` to Comment; added `severity` to DiffComment                               |
| `src/cli/index.ts`                        | Added `dotenv/config` import, `--no-ai-review` / `--ai-model-*` flags, AI config resolution                 |
| `src/server/server.ts`                    | Added SSE endpoint with caching + pending client queue, refresh-safe heartbeat (2s grace period)            |
| `src/client/App.tsx`                      | Merged AI + user comments, wired AIReviewStatus/AIArchitecturePanel, rewired Copy All to include everything |
| `src/client/components/InlineComment.tsx` | Severity badges, read-only mode for AI comments, blue border                                                |
| `package.json`                            | Added deps: `@anthropic-ai/sdk`, `@google/generative-ai`, `dotenv`, `picomatch`                             |

## API Key Configuration

Keys are resolved in this order (no CLI flags for security):

1. Environment variables: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
2. `.env` file in the working directory (loaded via `dotenv/config` at CLI startup)
3. `~/.config/difit/config.json`:
   ```json
   {
     "claude": { "apiKey": "sk-ant-..." },
     "gemini": { "apiKey": "AIza..." }
   }
   ```

Both providers run in parallel. If only one key is set, only that provider runs. If neither is set, the AI review is skipped with a warning.

## Convention Files

The orchestrator reads these files from the reviewed repo's root and includes them in the AI prompt as project context:

- `CLAUDE.md`
- `AGENTS.md`
- `.cursorrules`
- `.github/copilot-instructions.md`

Each is truncated to 10KB. A console log lists which files are sent. These are sent to third-party AI APIs.

## Important Design Decisions

1. **SSE not WebSocket**: SSE is simpler, unidirectional (server to client), and sufficient since the client never sends data back during a review.

2. **Server-side caching**: AI review results are cached in memory on the Express server. Page refreshes replay cached events instantly (~13ms vs ~50s). The re-run button passes `?rerun=true` to bypass cache.

3. **Pending client queue**: If a second SSE client connects while a review is running (e.g., page refresh mid-review), it's queued and receives events in real-time as they arrive, plus the done event when the review completes.

4. **try/finally on aiReviewRunning**: The running flag is always reset even if the review throws, preventing permanent deadlock.

5. **picomatch for excludePatterns**: User-configured exclude patterns support full glob syntax (`**/*.generated.ts`, `src/generated/**`, etc.).

6. **No API key CLI flags**: Keys passed as `--claude-key` would be visible in `ps aux` and shell history. Only env vars and config files are supported.

7. **Structured output**: Claude uses `tool_use` with `tool_choice: { type: 'tool' }` to force JSON. Gemini uses `responseMimeType: 'application/json'` + `responseSchema`.

8. **Architecture comments as a separate type**: Not attached to lines, rendered in their own panel. This is distinct from line-level findings because architectural feedback (coupling, patterns, approach) doesn't map to specific code locations.
