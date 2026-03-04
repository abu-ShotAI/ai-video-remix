# Setup Guide

## 1. ShotAI (Required)

ShotAI is the local video asset management system that powers semantic shot search.

**Download**: https://www.shotai.io — download the Mac app.

After installation:
1. Open ShotAI and add your video files/folders to a collection
2. Wait for indexing to complete (ShotAI processes each video: detects shots, generates embeddings)
3. Enable the MCP server: **Settings → MCP Server → Enable**
4. Note your **MCP URL** (default: `http://127.0.0.1:23817`) and **MCP Token**

The MCP server uses SSE transport (not REST). The token is shown in ShotAI settings.

## 2. ffmpeg (Required)

Used for clip extraction and keyframe brightness analysis.

```bash
# macOS
brew install ffmpeg

# Verify
ffmpeg -version
ffprobe -version
```

## 3. yt-dlp (Required for auto music)

Used to search and download background music from YouTube. Skip if using `--bgm` with a local file.

```bash
# macOS
brew install yt-dlp

# Verify
yt-dlp --version
```

## 4. Node.js (Required)

Node.js 18+ required (LTS recommended, tested on Node 18–22).

```bash
node --version  # should be 18+
npm --version
```

## 5. Project Setup

```bash
git clone https://github.com/abu-ShotAI/ai-video-remix.git
cd ai-video-editor
npm install
cp .env.example .env
```

Edit `.env` with at minimum:

```env
SHOTAI_URL=http://127.0.0.1:23817
SHOTAI_TOKEN=<your-token-from-shotai-settings>
```

## 6. Verify Everything Works

```bash
# Test ShotAI connection (should print video count)
npx tsx -e "
import { ShotAIClient } from './src/shotai/client';
const c = new ShotAIClient(process.env.SHOTAI_URL, process.env.SHOTAI_TOKEN);
c.listVideos().then(v => console.log('Videos:', v.length)).catch(console.error);
"

# Test skill (heuristic mode, no LLM needed)
AGENT_PROVIDER=none npx tsx src/skill/cli.ts "test run" --composition TravelVlog
```
