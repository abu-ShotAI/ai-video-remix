#!/usr/bin/env node
/**
 * Skill CLI — AI-driven video remix generator
 *
 * Usage:
 *   npx tsx src/skill/cli.ts "帮我做一个香港赛博朋克夜景混剪"
 *   npx tsx src/skill/cli.ts "制作一个东京旅行vlog" --composition TravelVlog
 *   npx tsx src/skill/cli.ts "情绪短片" --bgm /path/to/music.mp3
 *   npx tsx src/skill/cli.ts "城市夜景" --output /tmp/my-video
 *
 * Environment variables (see .env):
 *   AGENT_PROVIDER      claude | openai | none  (default: claude)
 *   ANTHROPIC_API_KEY   required for claude
 *   OPENAI_API_KEY      required for openai
 *   AGENT_MODEL         override default model
 *   SHOTAI_URL          ShotAI MCP server URL (default: http://127.0.0.1:23817)
 *   SHOTAI_TOKEN        MCP auth token
 *   BGM_PATH            local MP3 path (skips YouTube search)
 *   OUTPUT_DIR          output directory (default: ./output)
 *   MIN_SCORE           minimum shot quality score 0–1 (default: 0.35)
 */
import { config } from './config';
import { runSkill } from './orchestrator';
import { REGISTRY } from './registry';

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  userRequest: string;
  compositionId?: string;
  bgmPath?: string;
  outputDir?: string;
  probe?: boolean;
  lang?: 'zh' | 'en';
} {
  const args = argv.slice(2);
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] ?? '';
      i++;
    } else {
      positional.push(args[i]);
    }
  }

  const userRequest = positional.join(' ').trim();
  if (!userRequest) {
    printUsage();
    process.exit(1);
  }

  // Validate composition id if provided
  if (flags['composition'] && !REGISTRY.find(m => m.id === flags['composition'])) {
    console.error(`\n❌ 未知合成: "${flags['composition']}"  可用: ${REGISTRY.map(m => m.id).join(', ')}\n`);
    process.exit(1);
  }

  return {
    userRequest,
    compositionId: flags['composition'],
    bgmPath:       flags['bgm'],
    outputDir:     flags['output'],
    probe:         'probe' in flags,
    lang:          (flags['lang'] === 'en' || flags['lang'] === 'zh') ? flags['lang'] : undefined,
  };
}

function printUsage() {
  console.log(`
AI Video Remix Skill — 自然语言驱动视频混剪

用法:
  npx tsx src/skill/cli.ts <需求描述> [选项]

参数:
  <需求描述>            自然语言描述，如 "帮我做香港赛博朋克夜景混剪"

选项:
  --composition <id>   指定合成风格（跳过 AI 自动选择）
  --bgm <path>         本地 MP3 配乐路径（跳过 YouTube 自动搜索）
  --output <dir>       输出目录（默认: ./output）
  --lang <zh|en>       输出语言：zh 中文（默认）/ en 英文，影响标题、字幕和片尾文字
  --probe              先扫描素材库内容，让 AI 根据库里实际有什么来定制搜索词

可用合成:
${REGISTRY.map(m => `  ${m.id.padEnd(16)} ${m.label} — ${m.description}`).join('\n')}

示例:
  npx tsx src/skill/cli.ts "香港夜景赛博朋克混剪"
  npx tsx src/skill/cli.ts "制作日本旅行vlog" --composition TravelVlog
  npx tsx src/skill/cli.ts "情绪短片城市" --bgm ~/music/bgm.mp3
`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const { userRequest, compositionId, bgmPath, outputDir, probe, lang } = parseArgs(process.argv);

  // lang flag overrides env var
  const resolvedLang: 'zh' | 'en' = lang ?? config.lang;

  console.log(`\n🎬 AI Video Remix Skill`);
  console.log(`   需求: "${userRequest}"`);
  console.log(`   Agent: ${config.agent.provider}`);
  console.log(`   语言: ${resolvedLang === 'en' ? 'English' : '中文'}`);
  if (compositionId) console.log(`   合成: ${compositionId} (手动指定)`);

  try {
    const result = await runSkill(userRequest, config, { compositionId, bgmPath, outputDir, probe, lang: resolvedLang });
    console.log(`\n🎉 渲染完成！`);
    console.log(`   主题: ${result.theme}`);
    console.log(`   合成: ${result.compositionId}`);
    console.log(`   文件: ${result.outputPath}`);
  } catch (err) {
    console.error(`\n❌ 失败: ${(err as Error).message}`);
    if (process.env.DEBUG) console.error((err as Error).stack);
    process.exit(1);
  }
}

main();
