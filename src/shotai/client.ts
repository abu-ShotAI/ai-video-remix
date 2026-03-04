/**
 * ShotAI MCP Client
 * Communicates with the local ShotAI MCP server via SSE transport
 */

export interface Shot {
  id: string;
  videoId: string;
  videoName: string;
  startTime: number;  // seconds
  endTime: number;    // seconds
  duration: number;
  summary: string;
  keyframePath: string;
  similarity: number;
  tags: {
    subjects: string[];
    actions: string[];
    scene: string;
    mood: string;
  };
}

export interface Video {
  id: string;
  name: string;
  path: string;
  collectionId: string;
  collectionName: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
}

export interface ExportResult {
  taskId: string;
  outputPath: string;
}

export class ShotAIClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  /**
   * Calls an MCP tool and returns the result.
   * Opens a fresh SSE session for each call.
   */
  private async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const url = new URL(`${this.baseUrl}/sse`);

      const req = http.get(
        { hostname: url.hostname, port: url.port, path: url.pathname, headers: { Authorization: `Bearer ${this.token}` } },
        (res: any) => {
          let sessionId = '';
          let callId = Math.floor(Math.random() * 100000);
          let initialized = false;

          res.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            const lines = text.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();

                // First event: get session endpoint
                if (data.startsWith('/message?')) {
                  sessionId = data.split('sessionId=')[1];
                  this.postMessage(sessionId, {
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 0,
                    params: {
                      protocolVersion: '2024-11-05',
                      capabilities: {},
                      clientInfo: { name: 'ai-video-editor', version: '1.0' },
                    },
                  });
                  return;
                }

                // Parse JSON events
                try {
                  const msg = JSON.parse(data);

                  if (msg.id === 0 && !initialized) {
                    initialized = true;
                    // Send the actual tool call
                    this.postMessage(sessionId, {
                      jsonrpc: '2.0',
                      method: 'tools/call',
                      id: callId,
                      params: { name: toolName, arguments: args },
                    });
                  }

                  if (msg.id === callId) {
                    req.destroy();
                    const content = msg.result?.content ?? [];
                    const textContent = content.find((c: any) => c.type === 'text');
                    if (textContent) {
                      try {
                        resolve(JSON.parse(textContent.text));
                      } catch {
                        resolve(textContent.text);
                      }
                    } else if (msg.error) {
                      reject(new Error(msg.error.message || 'MCP error'));
                    } else {
                      resolve(null);
                    }
                  }
                } catch {
                  // ignore non-json events
                }
              }
            }
          });

          res.on('error', reject);
        }
      );

      req.on('error', reject);
      setTimeout(() => { req.destroy(); reject(new Error('Timeout')); }, 300000); // 5 min for large responses
    });
  }

  private postMessage(sessionId: string, body: unknown): void {
    const http = require('http');
    const payload = JSON.stringify(body);
    const url = new URL(`${this.baseUrl}/message?sessionId=${sessionId}`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${this.token}`,
      },
    });
    req.write(payload);
    req.end();
  }

  async listCollections(): Promise<Collection[]> {
    const result = await this.callTool('list_collections', {}) as any;
    return result.collections ?? [];
  }

  async listVideos(collectionId?: string): Promise<Video[]> {
    const args: Record<string, unknown> = { limit: 100 };
    if (collectionId) args.collectionId = collectionId;
    const result = await this.callTool('list_videos', args) as any;
    return result.videos ?? [];
  }

  async getVideo(videoId: string): Promise<Video> {
    return this.callTool('get_video', { videoId }) as Promise<Video>;
  }

  async searchShots(query: string, options?: { videoId?: string; limit?: number }): Promise<Shot[]> {
    const args: Record<string, unknown> = { query, limit: options?.limit ?? 15 };
    if (options?.videoId) args.videoId = options.videoId;
    const result = await this.callTool('search_shots', args) as any;
    return result.shots ?? [];
  }

  async filterShots(filters: Record<string, unknown>): Promise<Shot[]> {
    const result = await this.callTool('filter_shots', filters) as any;
    return result.shots ?? [];
  }

  /** Get all shots from a video in timeline order. */
  async getVideoShots(videoId: string): Promise<Shot[]> {
    const result = await this.callTool('get_video_shots', { videoId }) as any;
    return result.shots ?? [];
  }

  /** Analyze shot visuals using local multimodal model (Ollama). */
  async analyzeVisual(shotId: string, prompt: string): Promise<string> {
    const result = await this.callTool('analyze_visual', { shotIds: [shotId], prompt }) as any;
    // Response: { results: [{ shotId, analysis }] }
    if (result?.results?.length > 0) return result.results[0].analysis ?? '';
    if (result?.analysis) return result.analysis;
    return String(result ?? '');
  }

  async exportShots(shotIds: string[], outputDir: string, format = 'mp4'): Promise<ExportResult> {
    return this.callTool('export_shots', { shotIds, outputDir, format }) as Promise<ExportResult>;
  }

  async getTaskStatus(taskId: string): Promise<{ status: string; progress?: number; outputPath?: string }> {
    return this.callTool('get_task_status', { taskId }) as Promise<any>;
  }

  async waitForTask(taskId: string, pollInterval = 2000): Promise<string> {
    while (true) {
      const status = await this.getTaskStatus(taskId);
      if (status.status === 'completed' && status.outputPath) return status.outputPath;
      if (status.status === 'failed') throw new Error('Export task failed');
      await new Promise(r => setTimeout(r, pollInterval));
    }
  }
}
