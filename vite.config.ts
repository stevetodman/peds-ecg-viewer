import { defineConfig } from 'vite';
import { resolve } from 'path';
import type { Plugin } from 'vite';

// API keys for AI providers - loaded from environment variables
// Create a .env file with ANTHROPIC_API_KEY and XAI_API_KEY
const API_KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY ?? '',
  xai: process.env.XAI_API_KEY ?? '',
};

// Vite plugin to proxy AI API calls (bypasses CORS)
function aiProxyPlugin(): Plugin {
  return {
    name: 'ai-proxy',
    configureServer(server) {
      // Anthropic API proxy
      server.middlewares.use('/api/anthropic', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEYS.anthropic,
                'anthropic-version': '2023-06-01',
              },
              body: body,
            });

            const data = await response.text();
            res.statusCode = response.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(error) }));
          }
        });
      });

      // xAI/Grok API proxy
      server.middlewares.use('/api/xai', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const response = await fetch('https://api.x.ai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEYS.xai}`,
              },
              body: body,
            });

            const data = await response.text();
            res.statusCode = response.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(error) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [aiProxyPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@types': resolve(__dirname, 'src/types'),
      '@config': resolve(__dirname, 'src/config'),
      '@data': resolve(__dirname, 'src/data'),
      '@signal': resolve(__dirname, 'src/signal'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@pediatric': resolve(__dirname, 'src/pediatric'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Gemuse',
      fileName: 'gemuse',
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
  },
});
