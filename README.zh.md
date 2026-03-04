# AI Video Remix（AI 智能混剪）

> AI 驱动的视频混剪生成器 — 语义搜索 + LLM 规划 + Remotion 渲染。
>
> English docs: [README.md](README.md)

用自然语言从本地 ShotAI 视频库中生成风格化视频混剪。

---

## 前置依赖

| 工具 | 用途 | 安装方式 |
|------|------|---------|
| [ShotAI](https://www.shotai.io) | 本地视频资产管理 + 语义镜头搜索（MCP 服务器） | 官网下载 |
| ffmpeg | 片段提取与关键帧分析 | `brew install ffmpeg` |
| yt-dlp | 自动从 YouTube 下载背景音乐 | `brew install yt-dlp` |
| Node.js 18+ | 运行时 | `brew install node` |

### ShotAI 配置

1. 下载并打开 ShotAI，将视频文件或文件夹添加到合集
2. 等待索引完成（镜头切割 + 向量嵌入，需要几分钟）
3. **设置 → MCP 服务器 → 启用**
4. 记录 **MCP URL**（默认：`http://127.0.0.1:23817`）和 **MCP Token**

---

## 快速开始

```bash
git clone https://github.com/abu-ShotAI/ai-video-remix.git
cd ai-video-editor
npm install
cp .env.example .env   # 填写 SHOTAI_URL、SHOTAI_TOKEN，可选填 AGENT_PROVIDER
```

```bash
# 旅行混剪
npx tsx src/skill/cli.ts "帮我做一个旅行混剪"

# 体育集锦
npx tsx src/skill/cli.ts "用上周末的素材做个体育高光集锦"

# 赛博朋克夜景风格
npx tsx src/skill/cli.ts "赛博朋克城市氛围，霓虹夜景"

# BBC 自然纪录片风格
npx tsx src/skill/cli.ts "用我的野生动物素材做成 BBC 纪录片风格"

# 指定合成 + 本地音乐
npx tsx src/skill/cli.ts "瑞士高山风光之旅" --composition SwitzerlandScenic --bgm ./music/alpine.mp3
```

---

## 处理流程

```
用户指令
    │
    ▼
1. parseIntent     — LLM 解析主题，选择合成模板，可选择覆盖音乐风格
2. refineQueries   — LLM 将每个槽位的搜索词改写为匹配库内容的表达
3. pickShots       — ShotAI 对每个槽位做语义搜索，按相似度 + 时长 + 情绪评分选最佳镜头
4. resolveMusic    — yt-dlp 搜索并下载 YouTube 音乐，或使用 --bgm 本地文件
5. extractClip     — ffmpeg 将每个镜头裁为独立 .mp4 片段
6. annotateClips   — LLM 为每个片段指定视觉参数（色调、肯·伯恩斯效果、戏剧感、字幕）
7. File Server     — HTTP 服务器将片段提供给 Remotion 渲染器使用
8. Remotion 渲染  — 合成并输出最终 MP4
```

---

## CLI 参数说明

```bash
npx tsx src/skill/cli.ts "<请求>" [选项]

选项：
  --composition <id>   强制指定合成（跳过 LLM 选择）
  --bgm <路径>          本地 MP3 路径（跳过 YouTube 搜索）
  --output <目录>       输出目录（默认：./output）
  --probe              先扫描库，再让 LLM 根据实际内容规划槽位
```

---

## 合成模板

| ID | 风格 | 适用场景 |
|----|------|---------|
| `CyberpunkCity` | 赛博朋克夜景 | 霓虹城市、夜景、科幻题材 |
| `TravelVlog` | 旅行 Vlog | 多城市旅行，含地点卡片 |
| `MoodDriven` | 情绪驱动混剪 | 快慢切换情绪蒙太奇 |
| `NatureWild` | BBC 自然纪录片 | 野生动物、风景、自然素材 |
| `SwitzerlandScenic` | 高山风光 | 山地旅行，优雅字幕 |
| `SportsHighlight` | ESPN 体育集锦 | 进球/精彩动作，含字幕 |

---

## 工作模式

**标准模式**（默认）— LLM 选择合成模板并根据注册表模板生成搜索词。

**探针模式**（`--probe`）— 先扫描库（视频名称、镜头样本、情绪/场景标签），再让 LLM 根据实际内容定制槽位。适用场景：
- 库内容未知或多样化
- 用户想要"最佳素材剪辑"
- 标准查询返回质量不佳的镜头

---

## 配置说明

编辑 `.env`（从 `.env.example` 复制）：

```env
# ── LLM 智能体 ───────────────────────────────────────────────────────────────
AGENT_PROVIDER=claude              # claude | openai | openai-compat | none
ANTHROPIC_API_KEY=sk-ant-...       # AGENT_PROVIDER=claude 时必填
OPENAI_API_KEY=sk-...              # AGENT_PROVIDER=openai 时必填
OPENAI_COMPAT_BASE_URL=https://... # AGENT_PROVIDER=openai-compat 时必填
OPENAI_COMPAT_API_KEY=sk-...
AGENT_MODEL=claude-sonnet-4-6      # 覆盖默认模型名称

# ── ShotAI ───────────────────────────────────────────────────────────────────
SHOTAI_URL=http://127.0.0.1:23817
SHOTAI_TOKEN=<你的 Token>

# ── 音乐 ─────────────────────────────────────────────────────────────────────
BGM_PATH=/路径/到/music.mp3        # 永久本地 BGM 默认值

# ── 质量 ─────────────────────────────────────────────────────────────────────
MIN_SCORE=0.5                      # 镜头质量阈值 0–1（推荐：0.5）
```

### LLM 接入方式

<details>
<summary>Claude（Anthropic）</summary>

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
<summary>OpenRouter（推荐，国内多模型接入）</summary>

```env
AGENT_PROVIDER=openai-compat
OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPAT_API_KEY=sk-or-v1-...
AGENT_MODEL=deepseek/deepseek-chat-v3-0324
```
注意：部分模型（Anthropic/OpenAI）在 OpenRouter 上可能有区域限制。推荐使用 `deepseek/deepseek-chat-v3-0324`、`meta-llama/llama-3.3-70b-instruct` 或 `mistralai/mistral-small-3.2-24b-instruct` 作为稳定替代。
</details>

<details>
<summary>Ollama（本地运行，无需 API Key）</summary>

```env
AGENT_PROVIDER=openai-compat
OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1
OPENAI_COMPAT_API_KEY=ollama
AGENT_MODEL=llama3.1
```
</details>

<details>
<summary>DeepSeek（直连）</summary>

```env
AGENT_PROVIDER=openai-compat
OPENAI_COMPAT_BASE_URL=https://api.deepseek.com/v1
OPENAI_COMPAT_API_KEY=sk-...
AGENT_MODEL=deepseek-chat
```
</details>

<details>
<summary>无 LLM（启发式兜底）</summary>

```env
AGENT_PROVIDER=none
```
基于关键词选择合成 + 注册表默认查询，无需任何 API Key。
</details>

---

## 常见问题排查

### 切换点闪烁（剪辑边界出现 1–2 帧闪光）

系统已自动应用 80ms 首尾裁剪（`TRIM = 0.08`）。如果问题持续，在 `src/skill/orchestrator.ts` 中将 `TRIM` 增大至 `0.12` 或 `0.15`。

### CyberpunkCity 红色闪光

`GlitchFlicker` 在非常短的片段上触发。在 `.env` 中设置 `MIN_SCORE=0.5` 可过滤短片段进入流程。

### 镜头质量差或跑题

1. 提高 `MIN_SCORE`（尝试 `0.5` → `0.7`）
2. 使用 `--probe` 模式 — LLM 先看到你的实际库再挑查询词
3. 用 `--composition <id>` 强制指定与你的内容匹配的合成

### 音乐下载失败

```bash
pip install -U yt-dlp          # 更新 yt-dlp
# 或使用本地文件：
npx tsx src/skill/cli.ts "..." --bgm /路径/到/music.mp3
```

---

## 性能参考

| 步骤 | 典型耗时（苹果 M 系列）|
|------|----------------------|
| Remotion 渲染（60s 视频）| 30–90s |
| ShotAI 每槽位搜索 | 1–3s |
| ffmpeg 片段提取 | 每片段约 0.5s |

---

## 新增合成模板

参见 [references/composition-guide.md](references/composition-guide.md)，了解如何新增 Remotion 视觉风格和注册表条目的分步说明。
