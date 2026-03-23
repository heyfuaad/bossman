# bossman

Local AI code review tool. Runs Claude and Gemini on your git diffs with full codebase context, renders findings inline in a GitHub-style viewer, and copies structured prompts for your AI coding agent to act on.

Built on top of [difit](https://github.com/yoshiko-pg/difit).

## Quick Start

```bash
# From any git repo with API keys configured
bossman HEAD main        # Review full PR diff (HEAD vs main)
bossman HEAD             # Review latest commit
bossman .                # Review all uncommitted changes
```

## Setup

### 1. Install

```bash
# Clone and build (npm publish coming soon)
git clone https://github.com/heyfuaad/bossman.git
cd bossman
pnpm install
pnpm run build
```

### 2. Configure API Keys

Set at least one key. Both providers run in parallel when both are set.

**Option A: `.env` file in your project** (recommended)

```bash
# .env (in the repo you want to review, gitignored)
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
```

**Option B: Environment variables**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
```

**Option C: Global config file**

```json
// ~/.config/difit/config.json
{
  "claude": { "apiKey": "sk-ant-..." },
  "gemini": { "apiKey": "AIza..." }
}
```

### 3. Run

```bash
# From the repo you want to review
node /path/to/bossman/dist/cli/index.js HEAD main
```

Or add an alias to your shell profile:

```bash
alias bossman="node /path/to/bossman/dist/cli/index.js"
```

## What It Does

When you run bossman, it:

1. Opens a GitHub-style diff viewer in your browser
2. Sends the diff + full file contents + project conventions (CLAUDE.md, AGENTS.md, etc.) to Claude and/or Gemini
3. Renders two types of feedback:
   - **Line-level findings**: Inline comments on specific code lines with severity badges (critical/important/improvement)
   - **Architecture observations**: High-level feedback about design, patterns, and cross-cutting concerns in a collapsible panel
4. Caches results server-side so page refreshes are instant
5. You can add your own comments alongside the AI findings
6. **"Copy All Prompt"** copies everything (AI findings + architecture observations + your comments) as a structured prompt

## Intended Workflow

```
AI agent writes code -> You run bossman -> Review findings -> Copy prompt -> Paste into AI agent -> Agent fixes issues
```

1. Your AI coding agent (Claude Code, Cursor, etc.) writes the code
2. Run `bossman HEAD main` to review the diff
3. AI review runs automatically, findings appear inline
4. Look through the findings, add your own notes where needed
5. Click **"Copy All Prompt"** to copy everything
6. Paste into your AI agent
7. The agent verifies each finding, fixes legitimate issues, and explains why false positives don't need fixing

## Usage

### Diff Modes

```bash
bossman HEAD                 # Latest commit
bossman HEAD main            # Compare HEAD vs main (full PR review)
bossman feature main         # Compare branches
bossman .                    # All uncommitted changes
bossman staged               # Staging area only
bossman working              # Unstaged changes only
bossman --pr https://github.com/owner/repo/pull/123   # GitHub PR
```

### Stdin

```bash
git diff main...HEAD | bossman       # Pipe any diff
cat changes.patch | bossman          # Review a patch file
```

### CLI Options

| Flag                        | Default                  | Description                                                                 |
| --------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `<target>`                  | HEAD                     | Commit, tag, branch, HEAD~n, or special keywords (`.`, `staged`, `working`) |
| `[compare-with]`            | -                        | Second ref to compare against                                               |
| `--pr <url>`                | -                        | GitHub PR URL                                                               |
| `--no-ai-review`            | false                    | Disable AI review                                                           |
| `--ai-model-claude <model>` | claude-sonnet-4-20250514 | Claude model (key via ANTHROPIC_API_KEY)                                    |
| `--ai-model-gemini <model>` | gemini-2.5-pro           | Gemini model (key via GEMINI_API_KEY)                                       |
| `--port`                    | 4966                     | Server port                                                                 |
| `--no-open`                 | false                    | Don't open browser automatically                                            |
| `--mode`                    | split                    | Display mode: `split` or `unified`                                          |
| `--clean`                   | false                    | Clear existing comments on startup                                          |
| `--keep-alive`              | false                    | Keep server running after browser disconnects                               |

## How the AI Review Works

1. **Context building**: Reads the raw diff, full contents of all changed files, and project convention files (CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md) from the reviewed repo
2. **Parallel execution**: Sends to Claude (via Anthropic SDK with tool_use) and Gemini (via Google AI SDK with JSON response mode) simultaneously
3. **Structured output**: Both models return typed JSON with file paths, line numbers, severity levels, and optional code suggestions
4. **SSE streaming**: Findings stream to the browser as they arrive via Server-Sent Events
5. **Caching**: Results are cached in server memory. Page refreshes replay instantly. Re-run button bypasses cache

### What Gets Sent to the AI

- The raw unified diff
- Full file contents of changed files (skips files > 200KB, lock files, minified files)
- Convention files from the repo root (CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md) truncated to 10KB each

A console log lists which convention files are included.

### Exclude Files from Review

Create `~/.config/difit/config.json`:

```json
{
  "excludePatterns": ["**/generated/**", "*.snap", "**/__mocks__/**"],
  "maxFileSizeKB": 200
}
```

## Development

```bash
pnpm install          # Install dependencies
pnpm run dev          # Dev mode with hot reload
pnpm run build        # Production build
pnpm test             # Run tests
pnpm run check        # Lint
pnpm run format       # Format
```

## Architecture

```
CLI (commander + dotenv)
  -> Express Server
     -> GET /api/diff           (diff data)
     -> GET /api/ai-review      (SSE: AI findings stream)
        -> AIReviewOrchestrator
           -> Claude provider (Anthropic SDK, tool_use)
           -> Gemini provider (Google AI SDK, JSON mode)
           -> Context builder (full files + conventions)
        -> In-memory cache (survives page refreshes)
  -> React SPA (Vite + Tailwind)
     -> useAIReview hook (SSE consumer)
     -> AIArchitecturePanel (high-level observations)
     -> InlineComment (line-level findings with severity badges)
     -> Copy All Prompt (formats everything for AI agents)
```

See [CLAUDE.md](CLAUDE.md) for detailed architecture, file-by-file breakdown, and design decisions.

## Requirements

- Node.js >= 21.0.0
- Git
- At least one API key (ANTHROPIC_API_KEY or GEMINI_API_KEY)
- GitHub CLI (`gh`) for `--pr` mode

## Credits

Built on top of [difit](https://github.com/yoshiko-pg/difit) by [yoshiko-pg](https://github.com/yoshiko-pg). difit provides the diff viewer, comment system, syntax highlighting, and file watching. bossman adds the AI review layer.

## License

MIT
