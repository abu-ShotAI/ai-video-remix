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
  --lang <zh|en>       Output language: zh Chinese (default) / en English
                       Affects: video title, per-clip captions & location labels, attribution line
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

## Writing ShotAI Search Queries

ShotAI uses semantic search powered by AI-generated tags and embedding vectors. Query quality is the single biggest factor in shot relevance — invest time here.

### Query construction rules

**Always write full sentences or rich phrases, never bare keywords.**

The search engine understands semantic similarity (`"ocean"` matches `"sea"`, `"waves"`, `"shoreline"`), so richer context produces better recall.

| Quality | Example | When to use |
|---------|---------|-------------|
| ⭐ Detailed description | `"A white seagull with spread wings gliding smoothly over calm blue ocean water, golden sunset light reflecting on the waves"` | Best precision — use for hero shots |
| ⭐ Full sentence | `"A seagull flying gracefully over the ocean at sunset"` | Good balance of precision and recall |
| Short phrase | `"seagull flying over ocean"` | Acceptable fallback |
| Single keyword | `"seagull"` | Avoid — low precision, noisy results |

### What to include in a query

Describe the **visual content** of the ideal shot across these dimensions:

- **Subject**: what/who is in frame (`a lone hiker`, `city traffic at night`, `athlete celebrating`)
- **Action**: what is happening (`walking slowly through fog`, `speeding through intersection`, `jumping with arms raised`)
- **Environment**: location, setting, time of day (`rain-soaked Tokyo street`, `mountain meadow at golden hour`, `empty stadium under floodlights`)
- **Mood / atmosphere**: emotional tone (`melancholic`, `tense`, `euphoric`, `serene`)
- **Camera feel**: implied movement or framing (`wide establishing shot`, `tight close-up`, `slow pan`, `handheld shaky`)

Not all dimensions are needed every time — include whichever are most distinctive for the shot you want.

### The refineQueries step

When the agent runs `refineQueries`, it rewrites the composition's default slot queries to better match the user's actual library. Apply these principles:

1. **Start from the slot's semantic intent** — what emotional or narrative role does this shot play in the composition?
2. **Incorporate any context from the user's request** — location names, event names, specific subjects mentioned
3. **Expand synonyms** — if the slot says `"water"`, try `"river flowing through forest"` or `"lake reflecting mountains"` based on what the library likely contains
4. **Avoid negations** — `"not indoors"` does not work; instead describe the positive version (`"outdoor daylight scene"`)
5. **One query per slot** — make it specific rather than trying to cover multiple scenarios

### Examples: slot query → refined query

```
Slot default: "city at night"
User request: "帮我做一个东京旅行混剪"
Refined:      "Neon-lit Tokyo street at night, pedestrians crossing under glowing signs, rain reflections on pavement"

Slot default: "nature landscape"
User request: "trip to Patagonia last month"
Refined:      "Dramatic Patagonia mountain landscape, snow-capped peaks under stormy clouds, vast open wilderness"

Slot default: "athlete in action"
User request: "basketball highlight from last game"
Refined:      "Basketball player driving to the hoop, explosive movement, crowd in background blurred"
```

## Adding a New Composition

See [references/composition-guide.md](references/composition-guide.md) to add a new Remotion composition to the registry.
