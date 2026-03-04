/**
 * Minimal HTTP file server for a directory of video assets during Remotion rendering.
 * Serves files from a directory with full range-request support (required for video playback).
 */
import http from 'http';
import path from 'path';
import { createReadStream, statSync } from 'fs';

/**
 * Starts an HTTP server that serves files from `dir` at `GET /<filename>`.
 * If `singleAlias` is provided, serves a single file `filePath` at that alias.
 * Returns a stop function to shut down the server.
 */
export function startFileServer(
  dirOrFile: string,
  aliasOrEmpty: string,
  port = 9876,
): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestedFile = decodeURIComponent(req.url ?? '/').replace(/^\//, '');

      // Resolve actual file path
      const filePath = aliasOrEmpty
        ? dirOrFile  // dirOrFile is a single file path, aliasOrEmpty is its URL alias
        : path.join(dirOrFile, requestedFile);  // dirOrFile is a directory

      // Security: prevent path traversal when serving directory
      if (!aliasOrEmpty) {
        const resolvedDir = path.resolve(dirOrFile);
        const resolvedFile = path.resolve(filePath);
        if (!resolvedFile.startsWith(resolvedDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
      } else if (requestedFile !== aliasOrEmpty) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      try {
        const stat = statSync(filePath);
        const totalSize = stat.size;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
          const chunkSize = end - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
            'Access-Control-Allow-Origin': '*',
          });
          createReadStream(filePath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': totalSize,
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
          });
          createReadStream(filePath).pipe(res);
        }
      } catch (err) {
        res.writeHead(404);
        res.end(`Not found: ${(err as Error).message}`);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`   🌐 Asset server started at http://127.0.0.1:${port}`);
      resolve(() => server.close());
    });

    server.on('error', reject);
  });
}
