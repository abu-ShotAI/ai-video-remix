# AI Video Remix Skill — 设计文档

> 目标：将当前的城市混剪 pipeline 抽象成一个通用的、可复用的"AI 视频混剪 Skill"，支持用户接入自己的 LLM/Agent API，使用自定义 MCP 视频理解服务，并自动搜索配乐。

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Video Remix Skill                     │
│                                                             │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐  │
│  │  Music   │   │  Agent   │   │   MCP    │   │Remotion │  │
│  │  Layer   │   │  Layer   │   │  Layer   │   │  Layer  │  │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬────┘  │
│       │              │              │               │       │
│       └──────────────┴──────────────┴───────────────┘       │
│                          Orchestrator                        │
└─────────────────────────────────────────────────────────────┘
```

四个独立接口层，由中间的 **Orchestrator** 统一调度：

| 层 | 职责 | 可替换性 |
|----|------|----------|
| Music Layer | 自动搜索/下载配乐 | YouTube / 本地文件 / 其他音源 |
| Agent Layer | 理解用户意图、编排镜头序列 | Claude / GPT / 自定义 LLM |
| MCP Layer | 搜索镜头、视频理解/质量评估 | ShotAI MCP / 其他 MCP provider |
| Remotion Layer | 渲染视频合成 | CyberpunkCity / TravelVlog / MoodDriven / 自定义 |

---

## 2. 目录结构（规划）

```
src/
├── skill/
│   ├── orchestrator.ts         # 主入口：协调四层
│   ├── config.ts               # 用户配置 (Agent API key, MCP URL 等)
│   │
│   ├── music/
│   │   ├── index.ts            # MusicProvider 接口
│   │   ├── youtube.ts          # YouTube 自动搜索 + yt-dlp 下载
│   │   └── local.ts            # 本地文件/--bgm 直接指定
│   │
│   ├── agent/
│   │   ├── index.ts            # AgentProvider 接口
│   │   ├── claude.ts           # Anthropic Claude SDK 实现
│   │   ├── openai.ts           # OpenAI SDK 实现
│   │   └── prompts.ts          # 镜头编排 prompt 模板
│   │
│   ├── mcp/
│   │   ├── index.ts            # MCPProvider 接口
│   │   ├── shotai.ts           # ShotAI MCP 实现 (当前)
│   │   └── validator.ts        # 镜头质量校验 (调用 MCP 视频理解)
│   │
│   └── remotion/
│       ├── index.ts            # CompositionRegistry 接口
│       ├── registry.ts         # 注册已有 compositions
│       └── render.ts           # 通用渲染函数
│
└── remotion/
    ├── compositions/           # 现有 compositions (不变)
    └── components/             # 现有共享组件 (不变)
```

---

## 3. Music Layer — 自动配乐

### 接口定义

```typescript
// src/skill/music/index.ts
export interface MusicProvider {
  /** 给定描述，返回本地可用的音频文件路径 */
  resolve(description: string): Promise<string>;
}
```

### YouTube 自动搜索实现

```typescript
// src/skill/music/youtube.ts
import { execFileSync } from 'child_process';

export class YouTubeMusicProvider implements MusicProvider {
  constructor(private outputDir: string) {}

  async resolve(description: string): Promise<string> {
    // 1. 用 yt-dlp 搜索匹配音乐（无需 API key）
    //    yt-dlp "ytsearch3:<description>" --get-id --get-title --no-playlist
    const searchResult = execFileSync('yt-dlp', [
      `ytsearch3:${description} no copyright background music`,
      '--get-id', '--get-title',
      '--no-playlist', '--quiet',
    ]).toString().trim();

    // 2. 解析搜索结果，选第一个
    const lines = searchResult.split('\n');
    const videoId = lines[0];  // yt-dlp --get-id 先输出 id
    const title   = lines[1];
    console.log(`   🎵 自动选曲: ${title} (${videoId})`);

    // 3. 下载音频
    const dest = path.join(this.outputDir, `bgm-${videoId}.mp3`);
    if (!fs.existsSync(dest)) {
      execFileSync('yt-dlp', [
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '-o', dest,
        `https://www.youtube.com/watch?v=${videoId}`,
      ]);
    }
    return dest;
  }
}
```

### 调用时机

在 Orchestrator 中，Agent 返回视频风格（如 `"赛博朋克夜景"`）后，Music Layer 用该描述自动检索合适配乐：

```
Agent 返回风格: "赛博朋克电子 暗黑节奏"
  → YouTubeMusicProvider.resolve("赛博朋克电子 暗黑节奏 no copyright")
  → yt-dlp ytsearch → 下载 MP3 → 返回本地路径
  → 传入 Remotion render props.bgm
```

---

## 4. Agent Layer — 用户自定义 LLM

### 接口定义

```typescript
// src/skill/agent/index.ts
export interface ClipRequest {
  position: number;        // 第几个镜头 (0-based)
  totalClips: number;      // 总镜头数
  style: string;           // 整体视频风格
  mood?: 'fast' | 'slow';  // 情绪节奏 (可选)
  previousClips: ShotInfo[]; // 前序镜头信息（用于连贯性判断）
}

export interface AgentProvider {
  /** 给定视频主题，返回搜索关键词列表 */
  generateSearchQueries(theme: string, style: string, count: number): Promise<string[]>;

  /** 给定候选镜头列表和位置上下文，决定最终使用哪个 */
  selectBestShot(candidates: ValidatedShot[], request: ClipRequest): Promise<ShotInfo>;

  /** 生成整体风格描述（用于 Music Layer） */
  describeMusicStyle(theme: string, style: string): Promise<string>;
}
```

### Claude 实现

```typescript
// src/skill/agent/claude.ts
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeAgentProvider implements AgentProvider {
  private client: Anthropic;

  constructor(apiKey: string, model = 'claude-opus-4-6') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateSearchQueries(theme: string, style: string, count: number): Promise<string[]> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: loadPrompt('search-queries', { theme, style, count }),
      }],
    });
    return parseJsonArray(msg.content[0].text);
  }

  async selectBestShot(candidates: ValidatedShot[], req: ClipRequest): Promise<ShotInfo> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: loadPrompt('select-shot', { candidates, req }),
      }],
    });
    const idx = parseInt(msg.content[0].text.trim());
    return candidates[idx].shot;
  }
  // ...
}
```

### 用户配置方式

```typescript
// 用户在 config.ts 中指定自己的 API
export const config = {
  agent: {
    provider: 'claude',                    // 'claude' | 'openai' | 'custom'
    apiKey: process.env.ANTHROPIC_API_KEY, // 用户自己提供
    model: 'claude-opus-4-6',
  },
  // ...
};
```

---

## 5. MCP Layer — 镜头搜索与视频理解

### 接口定义

```typescript
// src/skill/mcp/index.ts

export interface ShotInfo {
  videoId: string;
  videoPath: string;
  startTime: number;
  endTime: number;
  summary: string;
  similarity?: number;
}

export interface VideoUnderstanding {
  description: string;   // 场景详细描述
  mood: string;          // 情绪：calm / energetic / dramatic / ...
  quality: number;       // 画质评分 0-1
  suitability: number;   // 适配当前风格的评分 0-1
  issues?: string[];     // 问题：模糊 / 抖动 / 过曝 / ...
}

export interface MCPProvider {
  /** 语义搜索镜头 */
  searchShots(query: string, limit?: number): Promise<ShotInfo[]>;

  /** 获取镜头视频文件路径（by videoId） */
  getVideoPath(videoId: string): Promise<string>;

  /** 调用 MCP 视频理解模型，返回场景详情 */
  understandShot(shot: ShotInfo): Promise<VideoUnderstanding>;
}
```

### ShotAI MCP 实现（当前）

```typescript
// src/skill/mcp/shotai.ts
export class ShotAIMCPProvider implements MCPProvider {
  constructor(
    private baseUrl: string,  // 'http://127.0.0.1:23817'
    private token: string,
  ) {}

  async searchShots(query: string, limit = 5): Promise<ShotInfo[]> {
    // 调用 ShotAI MCP search_shots tool
    const result = await this.callTool('search_shots', { query, limit });
    return result.shots.map(/* normalize */);
  }

  async understandShot(shot: ShotInfo): Promise<VideoUnderstanding> {
    // 调用 MCP 视频理解工具 (如 describe_shot / analyze_clip)
    const result = await this.callTool('describe_shot', {
      video_path: shot.videoPath,
      start_time: shot.startTime,
      end_time: shot.endTime,
    });
    return {
      description: result.description,
      mood: result.mood,
      quality: result.quality_score,
      suitability: result.relevance_score,
      issues: result.issues,
    };
  }
  // ...
}
```

---

## 6. 镜头质量校验流程 (Shot Validation)

这是新增的关键环节：在摆放每个镜头前，先通过 MCP 视频理解模型评估其适配性。

```
搜索 → 候选镜头列表 → [逐一校验] → 过滤/排序 → Agent 最终选择
```

### 校验器

```typescript
// src/skill/mcp/validator.ts

export interface ValidatedShot {
  shot: ShotInfo;
  understanding: VideoUnderstanding;
  score: number;   // 综合评分
  accept: boolean; // 是否通过阈值
}

export async function validateShots(
  shots: ShotInfo[],
  mcp: MCPProvider,
  context: { style: string; mood?: string; minScore?: number }
): Promise<ValidatedShot[]> {
  const minScore = context.minScore ?? 0.6;

  const results = await Promise.all(shots.map(async (shot) => {
    const understanding = await mcp.understandShot(shot);

    // 综合评分：画质 * 0.3 + 适配度 * 0.5 + （无明显问题）* 0.2
    const issuesPenalty = (understanding.issues?.length ?? 0) * 0.1;
    const score = understanding.quality * 0.3
                + understanding.suitability * 0.5
                + Math.max(0, 0.2 - issuesPenalty);

    return {
      shot,
      understanding,
      score,
      accept: score >= minScore,
    };
  }));

  return results
    .filter(r => r.accept)
    .sort((a, b) => b.score - a.score);
}
```

### 在 Orchestrator 中的调用

```typescript
// 对每个镜头槽位：
const rawCandidates = await mcp.searchShots(query, 8);       // 多搜一些
const validated     = await validateShots(rawCandidates, mcp, { style, mood });

if (validated.length === 0) {
  // 回退：放宽阈值再搜一次，或由 Agent 生成新的搜索词重试
  logger.warn(`镜头 #${i} 无合格候选，尝试回退搜索`);
  // ...
}

const finalShot = await agent.selectBestShot(validated, clipRequest);
```

---

## 7. Remotion Layer — Composition Registry

### 接口定义

```typescript
// src/skill/remotion/index.ts

export interface CompositionMeta {
  id: string;               // 'CyberpunkCity' | 'TravelVlog' | 'MoodDriven' | ...
  label: string;            // 用于展示的名称
  buildProps(clips: ShotInfo[], options: RenderOptions): object;
  defaultDuration(fps: number, clips: ShotInfo[]): number;
}

export interface RenderOptions {
  fps?: number;
  bgm?: string;
  title?: string;
  extraProps?: Record<string, unknown>;
}
```

### 注册表

```typescript
// src/skill/remotion/registry.ts
import { CyberpunkCityMeta } from './compositions/cyberpunk';
import { TravelVlogMeta }    from './compositions/travel';
import { MoodDrivenMeta }    from './compositions/mood';

export const REGISTRY: CompositionMeta[] = [
  CyberpunkCityMeta,
  TravelVlogMeta,
  MoodDrivenMeta,
];

// 用户可追加自定义 composition：
// REGISTRY.push(MyCustomCompositionMeta);
```

### 通用渲染函数

```typescript
// src/skill/remotion/render.ts
export async function renderComposition(
  meta: CompositionMeta,
  clips: ShotInfo[],
  options: RenderOptions,
  outputPath: string,
) {
  const props = meta.buildProps(clips, options);
  await spawnRemotion('render', meta.id, props, outputPath, options);
}
```

---

## 8. Orchestrator — 主流程

```typescript
// src/skill/orchestrator.ts

export async function runSkill(userRequest: string) {
  const cfg = loadConfig();

  // 初始化各层 provider
  const agent   = createAgentProvider(cfg.agent);
  const mcp     = createMCPProvider(cfg.mcp);
  const music   = createMusicProvider(cfg.music);
  const registry = REGISTRY;

  // ── Step 1: Agent 解析用户意图 ──
  const intent = await agent.parseIntent(userRequest);
  // intent = { theme: '香港赛博朋克', style: 'cyberpunk', clipCount: 6, composition: 'CyberpunkCity' }

  // ── Step 2: 自动配乐 ──
  const musicDesc = await agent.describeMusicStyle(intent.theme, intent.style);
  const bgmPath   = await music.resolve(musicDesc);
  console.log(`🎵 配乐: ${bgmPath}`);

  // ── Step 3: 搜索 & 校验镜头 ──
  const queries = await agent.generateSearchQueries(intent.theme, intent.style, intent.clipCount);
  const clips: ShotInfo[] = [];

  for (let i = 0; i < intent.clipCount; i++) {
    const query = queries[i % queries.length];
    const candidates = await mcp.searchShots(query, 8);
    const validated  = await validateShots(candidates, mcp, {
      style: intent.style,
      minScore: 0.55,
    });

    const selected = await agent.selectBestShot(validated, {
      position: i, totalClips: intent.clipCount, style: intent.style, previousClips: clips,
    });
    clips.push(selected);
    console.log(`   ✓ 镜头 #${i+1}: ${selected.summary} (quality ${validated[0].score.toFixed(2)})`);
  }

  // ── Step 4: 提取片段 + 启动文件服务 ──
  const extractedClips = await extractClips(clips, cfg.outputDir);
  const { baseUrl, stop } = await startFileServer(cfg.outputDir, cfg.filePort);

  // ── Step 5: 渲染 ──
  const meta = registry.find(m => m.id === intent.composition)!;
  await renderComposition(meta, extractedClips, {
    fps: 30,
    bgm: copyBgmToServed(bgmPath, baseUrl),
    title: intent.theme,
  }, path.join(cfg.outputDir, `remix-${Date.now()}.mp4`));

  stop();
  console.log('🎉 完成！');
}
```

---

## 9. 配置文件

```typescript
// src/skill/config.ts (用户修改这里)
export const skillConfig = {
  agent: {
    provider: 'claude' as const,
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-opus-4-6',
  },
  mcp: {
    provider: 'shotai' as const,
    baseUrl: process.env.MCP_URL ?? 'http://127.0.0.1:23817',
    token:   process.env.MCP_TOKEN!,
  },
  music: {
    provider: 'youtube' as const,  // 'youtube' | 'local'
    localPath: process.env.BGM_PATH, // 设置后跳过 YouTube 搜索
  },
  output: {
    dir:      path.join(process.cwd(), 'output'),
    filePort: 9877,
  },
  validation: {
    minScore:  0.55,   // 镜头最低质量分
    maxRetries: 2,     // 搜索回退次数
  },
};
```

---

## 10. 关键数据流

```
用户输入: "帮我做一个东京夜景混剪，赛博朋克风格"
    │
    ▼
Agent.parseIntent → { theme: '东京夜景', style: 'cyberpunk', composition: 'CyberpunkCity', clipCount: 6 }
    │
    ├─→ Agent.describeMusicStyle → "电子合成器 暗黑赛博朋克"
    │       │
    │       └─→ YouTubeMusicProvider.resolve → bgm.mp3
    │
    └─→ Agent.generateSearchQueries → ["霓虹街道夜景", "繁华都市灯光", ...]
            │
            └─→ for each query:
                    │
                    ├─→ MCPProvider.searchShots → 8个候选
                    │
                    ├─→ validateShots (MCPProvider.understandShot×8) → 过滤低质量
                    │
                    └─→ Agent.selectBestShot → 最终1个镜头
                            │
                            ▼
                    clips[6个已校验镜头]
                            │
                            ▼
                    ffmpeg 提取 → 文件服务
                            │
                            ▼
                    Remotion.render(CyberpunkCity, props) → remix.mp4
```

---

## 11. 实现优先级

| 优先级 | 模块 | 说明 |
|--------|------|------|
| P0 | MCP Layer 接口抽象 | 解耦现有 ShotAI 直调代码 |
| P0 | Shot Validation | 调用 MCP 视频理解，过滤低质量镜头 |
| P1 | Agent Layer (Claude) | 用 Claude API 驱动搜索词生成和镜头选择 |
| P1 | Remotion Registry | CompositionMeta 接口，支持自定义 composition |
| P2 | YouTube Music Auto | yt-dlp ytsearch，无需 API key |
| P2 | OpenAI Agent 实现 | 让用户可接入 GPT-4 |
| P3 | CLI 入口 | `npx tsx src/skill/cli.ts "帮我做东京夜景混剪"` |

---

## 12. 依赖

```json
{
  "@anthropic-ai/sdk": "^0.29",   // Agent Layer - Claude
  "openai": "^4",                  // Agent Layer - OpenAI (可选)
  "yt-dlp": "系统安装",             // Music Layer - YouTube 下载
  "remotion": "^4",                // Remotion Layer
  "dotenv": "^16"                  // 配置
}
```

系统依赖：`ffmpeg`, `yt-dlp`（均通过 Homebrew 安装）

---

*文档版本: 2026-03-01 | 基于当前 CyberpunkCity + TravelVlog + MoodDriven 三个 composition 的实际实现归纳*
