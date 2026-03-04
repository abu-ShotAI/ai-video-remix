#!/usr/bin/env node
/**
 * AI Video Editor - Orchestration Script
 *
 * Pipeline:
 *   1. User provides a natural language query
 *   2. ShotAI MCP server searches your local media library semantics
 *   3. Matching shots (with timestamps) are returned
 *   4. Remotion renders a supercut with animated counter overlay
 *
 * Usage:
 *   npx tsx src/make-video.ts --query "goal scoring celebration" --video "FIFA" --label "GOAL"
 */

import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';
import dotenv from 'dotenv';
import { ShotAIClient, Shot, Video } from './shotai/client';
import { startFileServer } from './file-server';

dotenv.config();

// ─── CLI args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  return {
    query: get('--query') ?? 'goal scoring crowd cheering',
    videoName: get('--video') ?? 'FIFA',
    label: get('--label') ?? 'HIGHLIGHT',
    limit: parseInt(get('--limit') ?? '8', 10),
    outputDir: get('--output') ?? path.join(process.cwd(), 'output'),
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const client = new ShotAIClient(
    process.env.SHOTAI_MCP_URL ?? 'http://127.0.0.1:23817',
    process.env.SHOTAI_MCP_TOKEN ?? '',
  );

  console.log('\n🎬 AI Video Editor — Powered by ShotAI + Remotion');
  console.log('──────────────────────────────────────────────────');
  console.log(`📡 Query : "${args.query}"`);
  console.log(`🎥 Video : "${args.videoName}"`);
  console.log(`🏷  Label : "${args.label}"`);
  console.log(`🔢 Limit : ${args.limit} clips`);

  // ── Step 1: Find the target video ────────────────────────────────────────
  console.log('\n[1/4] 📚 Fetching media library...');
  const videos = await client.listVideos();
  const targetVideo = videos.find(v =>
    v.name.toLowerCase().includes(args.videoName.toLowerCase())
  );

  if (!targetVideo) {
    console.error(`\n❌ No video found matching "${args.videoName}"`);
    console.log('Available videos:');
    videos.forEach(v => console.log(`  • ${v.name}`));
    process.exit(1);
  }

  // Fetch full video details to get file path (listVideos doesn't include path)
  const videoDetail = await client.getVideo(targetVideo.id) as any;
  const videoFilePath = videoDetail.path;

  console.log(`   ✅ Found: ${targetVideo.name}`);
  console.log(`      Path: ${videoFilePath ?? '(not found)'}`);
  console.log(`      Shots indexed: ${targetVideo.shotCount ?? '?'}`);

  // ── Step 2: Semantic search ───────────────────────────────────────────────
  console.log(`\n[2/4] 🔍 Searching for "${args.query}"...`);
  const shots = await client.searchShots(args.query, {
    videoId: targetVideo.id,
    limit: args.limit,
  });

  if (shots.length === 0) {
    console.error('❌ No matching shots found.');
    process.exit(1);
  }

  // Sort by timeline order (not relevance) for a coherent supercut
  const sorted = [...shots].sort((a, b) => a.startTime - b.startTime);

  console.log(`   ✅ Found ${sorted.length} matching shots:`);
  sorted.forEach((s, i) => {
    console.log(`      ${i + 1}. [${fmt(s.startTime)} → ${fmt(s.endTime)}]  sim=${s.similarity.toFixed(3)}  "${s.summary?.slice(0, 60)}..."`);
  });

  // ── Step 3: Build clip manifest for Remotion ──────────────────────────────
  console.log('\n[3/4] 🎞  Extracting clips with ffmpeg...');
  const fps = (videoDetail as any).fps ?? 30;

  // Resolve actual video file path
  if (!videoFilePath || !fs.existsSync(videoFilePath)) {
    console.error(`❌ Video file not found at: ${videoFilePath}`);
    process.exit(1);
  }

  // Pre-extract each clip with ffmpeg so Remotion deals with small files instead of 2.5GB
  fs.mkdirSync(args.outputDir, { recursive: true });
  const clipsDir = path.join(args.outputDir, 'clips');
  fs.mkdirSync(clipsDir, { recursive: true });

  const clips = sorted.map((shot: Shot, i: number) => {
    const clipFile = path.join(clipsDir, `clip-${String(i).padStart(3, '0')}.mp4`);
    if (!fs.existsSync(clipFile)) {
      const duration = shot.endTime - shot.startTime;
      const cmd = [
        'ffmpeg', '-y',
        '-ss', shot.startTime.toFixed(3),
        '-i', `"${videoFilePath}"`,
        '-t', duration.toFixed(3),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
        '-c:a', 'aac',
        `"${clipFile}"`,
      ].join(' ');
      console.log(`   ✂️  Clip ${i + 1}: [${fmt(shot.startTime)} → ${fmt(shot.endTime)}]`);
      execSync(cmd, { stdio: 'pipe' });
    } else {
      console.log(`   ⏭  Clip ${i + 1}: (cached)`);
    }
    return {
      id: shot.id,
      src: clipFile,   // absolute local path; file server will serve it
      startTime: 0,    // clip starts from beginning after extraction
      endTime: shot.endTime - shot.startTime,
      summary: shot.summary ?? `Shot ${i + 1}`,
      index: i,
    };
  });

  // Start file server for the clips directory
  const fileServerPort = 9876;
  const stopServer = await startFileServer(clipsDir, '', fileServerPort);

  // Remap src to http URLs with simple filenames
  const clipsWithUrl = clips.map(c => ({
    ...c,
    src: `http://127.0.0.1:${fileServerPort}/${path.basename(c.src)}`,
  }));

  const manifestPath = path.join(args.outputDir, 'clips-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ clips: clipsWithUrl, label: args.label, fps }, null, 2));
  console.log(`   ✅ Manifest saved → ${manifestPath}`);

  // ── Step 4: Render with Remotion ──────────────────────────────────────────
  const outputFile = path.join(
    args.outputDir,
    `supercut-${args.label.toLowerCase()}-${Date.now()}.mp4`
  );

  const propsBase64 = Buffer.from(
    JSON.stringify({ clips, label: args.label, fps })
  ).toString('base64');

  console.log('\n[4/4] 🎬 Rendering supercut with Remotion...');
  console.log(`   Output → ${outputFile}`);
  console.log('   This may take a few minutes...\n');

  const renderArgs = [
    'remotion', 'render',
    'src/remotion/index.tsx',
    'Supercut',
    outputFile,
    `--props=${JSON.stringify({ clips: clipsWithUrl, label: args.label, fps })}`,
    '--codec=h264',
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('npx', renderArgs, { stdio: 'inherit', cwd: process.cwd() });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Render exited with code ${code}`));
      });
      child.on('error', reject);
    });

    stopServer();
    console.log(`\n✅ Supercut rendered successfully!`);
    console.log(`   📁 ${outputFile}`);
  } catch (err) {
    stopServer();
    console.error('\n❌ Render failed. See error above.');
    process.exit(1);
  }
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
