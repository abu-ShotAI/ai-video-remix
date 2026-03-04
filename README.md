# AI Video Remix

> AI-powered video remix generator — natural language → styled video composition

Uses **ShotAI** (semantic shot search) + **LLM planning** + **Remotion** (React-based rendering) to turn your local video library into polished, themed video cuts.

---

## Features

- **Natural language input**: "帮我做一个赛博朋克香港夜景混剪" → full video
- **6 built-in compositions**: CyberpunkCity, TravelVlog, MoodDriven, NatureWild, SwitzerlandScenic, SportsHighlight
- **LLM-driven shot planning**: Claude / GPT-4o / DeepSeek / Ollama all supported
- **Heuristic fallback**: works with `AGENT_PROVIDER=none`, no API key needed
- **Auto BGM**: yt-dlp YouTube search, or bring your own MP3
- **ShotAI integration**: shot-level semantic search over your local video library
- **Probe mode**: scans library first, generates queries tailored to actual content

## Prerequisites

| Dependency | Required | Notes |
|---|---|---|
| [ShotAI](https://www.shotai.io) | ✅ Yes | Local video asset manager, provides MCP server |
| ffmpeg | ✅ Yes | Clip extraction |
| Node.js 18+ | ✅ Yes | Runtime |
| yt-dlp | For auto music | YouTube BGM download |
| LLM API key | Optional | Falls back to heuristic mode if absent |

## Quick Start

```bash
git clone https://github.com/seeknetic/ai-video-editor.git
cd ai-video-editor
npm install
cp .env.example .env   # edit with your ShotAI token + optional LLM key
```

```bash
# Heuristic mode (no LLM key needed)
AGENT_PROVIDER=none npx tsx src/skill/cli.ts "travel vlog" --composition TravelVlog

# With LLM (Claude)
npx tsx src/skill/cli.ts "帮我做一个赛博朋克香港混剪"

# Bring your own music
npx tsx src/skill/cli.ts "nature montage" --bgm ~/music/ambient.mp3

# Probe mode: scan library first
npx tsx src/skill/cli.ts "best of my library" --probe
```

Output video: `./output/<composition>-<timestamp>.mp4`

## Compositions

| ID | Style | Best For |
|----|-------|----------|
| `CyberpunkCity` | 赛博朋克夜景 | Neon city, night scenes, sci-fi |
| `TravelVlog` | 旅行 Vlog | Multi-city travel with location cards |
| `MoodDriven` | 情绪驱动混剪 | Fast/slow emotion cuts |
| `NatureWild` | 自然野生动物 | BBC nature documentary style |
| `SwitzerlandScenic` | 瑞士风光 | Alpine scenic travel |
| `SportsHighlight` | 体育集锦 | ESPN-style sports cuts |

## Configuration

Copy `.env.example` to `.env` and fill in:

```env
# Required
SHOTAI_URL=http://127.0.0.1:23817
SHOTAI_TOKEN=<your-token>

# Optional: LLM provider (default: none / heuristic)
AGENT_PROVIDER=openai-compat
OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPAT_API_KEY=sk-or-v1-...
AGENT_MODEL=deepseek/deepseek-chat-v3-0324

# Quality
MIN_SCORE=0.5
```

See [docs/config.md](docs/config.md) for all options and LLM provider examples (Claude, OpenAI, OpenRouter, Ollama, DeepSeek).

## ShotAI Setup

1. Download at [https://www.shotai.io](https://www.shotai.io)
2. Add your video folders and wait for indexing
3. Enable MCP server: **Settings → MCP Server → Enable**
4. Copy the MCP URL and token to `.env`

## Project Structure

```
src/
  skill/
    cli.ts          # Entry point
    orchestrator.ts # Pipeline: shots → clips → render
    agent.ts        # LLM backends (Claude, OpenAI, OpenRouter, heuristic)
    registry.ts     # Composition metadata + shot slots
    mcp.ts          # ShotAI MCP client
    music.ts        # BGM resolution (yt-dlp / local)
  remotion/
    compositions/   # Remotion React components per style
    Root.tsx        # Composition registry
```

## Adding a New Composition

See [docs/composition-guide.md](docs/composition-guide.md).

## Known Issues & Tuning

See [docs/tuning.md](docs/tuning.md) for solutions to boundary flicker, flash artifacts, and low-quality shots.

## License

MIT — see [LICENSE](LICENSE)

---

Built with [ShotAI](https://www.shotai.io) · [Remotion](https://www.remotion.dev) · [Seeknetic](https://seeknetic.com)
