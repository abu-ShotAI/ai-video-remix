---
name: ai-video-remix
description: AI-driven video remix generator that uses ShotAI semantic search + LLM planning + Remotion rendering to produce styled video compositions from a user's local video library. Use when the user asks to create a video remix, highlight reel, travel vlog, sports highlight, nature montage, or any styled video cut from their library. Triggers on requests like "帮我做一个混剪", "make a travel vlog from my library", "create a sports highlight", or "generate a video with my footage". Requires ShotAI (local MCP server) to be running. Works with any OpenAI-compatible LLM API or falls back to heuristic mode with no API key.
---

# AI Video Remix Skill

Generate styled video compositions from a local ShotAI video library using natural language.

## Prerequisites

See [references/setup.md](references/setup.md) for full installation instructions, including:
- ShotAI download and setup
- ffmpeg installation
- yt-dlp installation (for auto music)
- Node.js dependencies

## Quick Start

```bash
cd /path/to/ai-video-editor
cp .env.example .env    # fill in SHOTAI_URL, SHOTAI_TOKEN, and optionally AGENT_PROVIDER
npm install
npx tsx src/skill/cli.ts "帮我做一个旅行混剪"
```

## Pipeline (8 steps)

1. **Agent: parseIntent** — LLM extracts theme, selects composition, optionally overrides music style
2. **Agent: refineQueries** — LLM rewrites per-slot search terms to match library content
3. **ShotAI: pickShots** — Semantic search per slot, scored by similarity+duration+mood, best shot selected
4. **Music: resolveMusic** — yt-dlp YouTube search+download, or local MP3 if `--bgm` provided
5. **ffmpeg: extractClip** — Each shot trimmed to independent `.mp4` clip file
6. **Agent: annotateClips** — LLM assigns per-clip visual effect params (tone, dramatic, kenBurns, caption)
7. **File Server** — HTTP server serves clips to Remotion renderer
8. **Remotion: render** — Composition rendered to final MP4

## CLI Usage

```bash
npx tsx src/skill/cli.ts "<request>" [options]

Options:
  --composition <id>   Override composition (skip LLM selection)
  --bgm <path>         Local MP3 path (skip YouTube search)
  --output <dir>       Output directory (default: ./output)
  --probe              Scan library first, let LLM plan slots from actual content
```

## Compositions

| ID | Label | Best For |
|----|-------|----------|
| `CyberpunkCity` | 赛博朋克夜景 | Neon city, night scenes, sci-fi |
| `TravelVlog` | 旅行 Vlog | Multi-city travel with location cards |
| `MoodDriven` | 情绪驱动混剪 | Fast/slow emotion cuts |
| `NatureWild` | 自然野生动物 | BBC nature documentary style |
| `SwitzerlandScenic` | 瑞士风光 | Alpine/scenic travel with captions |
| `SportsHighlight` | 体育集锦 | ESPN-style with goal captions |

## Modes

**Standard mode** (default): LLM picks composition + generates search queries from registry templates.

**Probe mode** (`--probe`): Scans library videos first (names, shot samples, mood/scene tags), then LLM generates custom slots tailored to what actually exists.

Choose probe mode when: library content is unknown, user wants "best of my library", or standard slots return low-quality shots.

## Environment Variables

See [references/config.md](references/config.md) for all environment variables and LLM provider setup.

## Troubleshooting & Quality Tuning

See [references/tuning.md](references/tuning.md) for solutions to:
- Clip boundary flicker / 1–2 frame flash at cuts
- Red flash artifact in CyberpunkCity (GlitchFlicker on short clips)
- Low-quality or off-topic shots
- Music download failures

**Recommended `.env` defaults for best quality:**
```env
MIN_SCORE=0.5    # filter short/low-quality shots
```

## Adding a New Composition

See [references/composition-guide.md](references/composition-guide.md) to add a new Remotion composition to the registry.
