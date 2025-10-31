import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

build({
  entryPoints: [resolve(__dirname, 'node_modules/@modelcontextprotocol/sdk/dist/index.js')],
  bundle: true,
  format: 'esm',
  outfile: resolve(__dirname, 'public/mcp-sdk-bundle.js'),
  platform: 'browser',
}).then(() => {
  console.log('✅ SDK bundled successfully!');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});