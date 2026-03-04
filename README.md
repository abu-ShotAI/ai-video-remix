# AI Video Remix

> AI-driven video remix generator — semantic search + LLM planning + Remotion rendering.
>
> 中文文档: [README.zh.md](README.zh.md)

Generate styled video compositions from your local ShotAI video library using natural language.

---

## Use as a Claude Skill

This repo ships a ready-to-install [Claude Agent Skill](https://support.claude.com/en/articles/12512176-what-are-skills) in the [`skill/`](skill/) directory.

**Install in Claude Code:**
```bash
/plugin install ai-video-remix@abu-ShotAI/ai-video-remix#skill
```

Or point Claude Code settings to the local `skill/` folder.

Once installed, just describe what you want:
> *"Make a travel vlog from my library"*
> *"Create a cyberpunk city highlight reel"*
> *"Sports highlight from last weekend's footage"*

---

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| [ShotAI](https://www.shotai.io) | Local video asset management + semantic shot search (MCP server) | Download from website |
| ffmpeg | Clip extraction and keyframe analysis | `brew install ffmpeg` |
| yt-dlp | Auto background music from YouTube | `brew install yt-dlp` |
| Node.js 18+ | Runtime | `brew install node` |

### ShotAI Setup

1. Download and open ShotAI, add your video files/folders to a collection
2. Wait for indexing (shot detection + embeddings — takes a few minutes)
3. **Settings → MCP Server → Enable**
4. Note your **MCP URL** (default: `http://127.0.0.1:23817`) and **MCP Token**

---

## Quick Start

```bash
git clone https://github.com/abu-ShotAI/ai-video-remix.git
cd ai-video-editor
npm install
cp .env.example .env   # fill in SHOTAI_URL, SHOTAI_TOKEN, and optionally AGENT_PROVIDER
```

```bash
# Travel vlog from your library
npx tsx src/skill/cli.ts "make a travel vlog from my library"

# Sports highlight reel
npx tsx src/skill/cli.ts "create a sports highlight from last weekend"

# Cyberpunk city night cuts
npx tsx src/skill/cli.ts "cyberpunk city vibes, neon nights"

# Nature documentary style
npx tsx src/skill/cli.ts "BBC nature doc style with my wildlife footage"

# With explicit composition + local music
npx tsx src/skill/cli.ts "scenic alpine journey" --composition SwitzerlandScenic --bgm ./music/alpine.mp3
```

---

## Pipeline

```
User prompt
    │
    ▼
1. parseIntent     — LLM extracts theme, selects composition, optionally overrides music style
2. refineQueries   — LLM rewrites per-slot search terms to match library content
3. pickShots       — ShotAI semantic search per slot; scored by similarity + duration + mood
4. resolveMusic    — yt-dlp YouTube search+download, or local --bgm file
5. extractClip     — ffmpeg trims each shot to an independent .mp4
6. annotateClips   — LLM assigns per-clip visual params (tone, kenBurns, dramatic, caption)
7. File Server     — HTTP server serves clips to the Remotion renderer
8. Remotion render — Final MP4 composed and rendered
```

---

## CLI Reference

```bash
npx tsx src/skill/cli.ts "<request>" [options]

Options:
  --composition <id>   Force a specific composition (skip LLM selection)
  --bgm <path>         Local MP3 path (skip YouTube search)
  --output <dir>       Output directory (default: ./output)
  --probe              Scan library first; LLM plans slots from actual content
```

---

## Compositions

| ID | Style | Best For |
|----|-------|----------|
| `CyberpunkCity` | Cyberpunk night | Neon city, night scenes, sci-fi |
| `TravelVlog` | Travel vlog | Multi-city travel with location cards |
| `MoodDriven` | Mood-driven cuts | Emotional fast/slow montage |
| `NatureWild` | BBC nature doc | Wildlife, landscapes, nature footage |
| `SwitzerlandScenic` | Alpine scenic | Mountain travel with elegant captions |
| `SportsHighlight` | ESPN sports | Goal/action highlights with captions |

---

## Modes

**Standard mode** (default) — LLM picks the composition and generates search queries from registry templates.

**Probe mode** (`--probe`) — Scans the library first (video names, shot samples, mood/scene tags), then LLM builds custom slots tailored to what actually exists. Use this when:
- Library content is unknown or varied
- User wants "best of my library"
- Standard queries return low-quality shots

---

## Configuration

Edit `.env` (copy from `.env.example`):

```env
# ── LLM Agent ────────────────────────────────────────────────────────────────
AGENT_PROVIDER=claude              # claude | openai | openai-compat | none
ANTHROPIC_API_KEY=sk-ant-...       # required when AGENT_PROVIDER=claude
OPENAI_API_KEY=sk-...              # required when AGENT_PROVIDER=openai
OPENAI_COMPAT_BASE_URL=https://... # required when AGENT_PROVIDER=openai-compat
OPENAI_COMPAT_API_KEY=sk-...
AGENT_MODEL=claude-sonnet-4-6      # override default model

# ── ShotAI ───────────────────────────────────────────────────────────────────
SHOTAI_URL=http://127.0.0.1:23817
SHOTAI_TOKEN=<your-token>

# ── Music ────────────────────────────────────────────────────────────────────
BGM_PATH=/path/to/music.mp3        # permanent local BGM default

# ── Quality ──────────────────────────────────────────────────────────────────
MIN_SCORE=0.5                      # shot quality threshold 0–1 (recommended: 0.5)
```

### LLM Providers

<details>
<summary>Claude (Anthropic)</summary>

```env
AGENT_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
AGENT_MODEL=claude-sonnet-4-6
```
</details>

<details>
<summary>OpenAI</summary>

```env
AGENT_PROVIDER=openai
OPENAI_API_KEY=sk-...
AGENT_MODEL=gpt-4o
```
</details>

<details>
<summary>OpenRouter (recommended for multi-provider access)</summary>

```env
AGENT_PROVIDER=openai-compat
OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPAT_API_KEY=sk-or-v1-...
AGENT_MODEL=deepseek/deepseek-chat-v3-0324
```
</details>

<details>
<summary>Ollama (local, no API key needed)</summary>

```env
AGENT_PROVIDER=openai-compat
OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1
OPENAI_COMPAT_API_KEY=ollama
AGENT_MODEL=llama3.1
```
</details>

<details>
<summary>DeepSeek (direct)</summary>

```env
AGENT_PROVIDER=openai-compat
OPENAI_COMPAT_BASE_URL=https://api.deepseek.com/v1
OPENAI_COMPAT_API_KEY=sk-...
AGENT_MODEL=deepseek-chat
```
</details>

<details>
<summary>No LLM (heuristic fallback)</summary>

```env
AGENT_PROVIDER=none
```
Keyword-based composition selection + registry default queries. No API key required.
</details>

---

## Troubleshooting

### Clip boundary flicker (1–2 frame flash at cuts)

An 80ms head/tail trim is applied automatically (`TRIM = 0.08`). If it persists, increase `TRIM` to `0.12` or `0.15` in `src/skill/orchestrator.ts`.

### Red flash in CyberpunkCity

`GlitchFlicker` triggers on very short clips. Set `MIN_SCORE=0.5` in `.env` to keep short clips out of the pipeline.

### Low-quality or off-topic shots

1. Raise `MIN_SCORE` (try `0.5` → `0.7`)
2. Use `--probe` mode — LLM sees your actual library before picking queries
3. Force `--composition <id>` to a composition whose slots match your content

### Music download fails

```bash
pip install -U yt-dlp          # update yt-dlp
# or use a local file:
npx tsx src/skill/cli.ts "..." --bgm /path/to/music.mp3
```

---

## Performance

| Step | Typical time (M-series Mac) |
|------|-----------------------------|
| Remotion render (60s video) | 30–90s |
| ShotAI search per slot | 1–3s |
| ffmpeg clip extraction | ~0.5s per clip |

---

## Adding a New Composition

See [references/composition-guide.md](references/composition-guide.md) for step-by-step instructions on adding a new Remotion visual style + registry entry.
