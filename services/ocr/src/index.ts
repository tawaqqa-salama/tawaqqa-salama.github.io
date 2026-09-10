import { createServer } from 'node:http';
import { createRequestHandler } from './app.js';
import { getRequiredApiKey } from './auth.js';
import { DEFAULT_PORT } from './limits.js';
import { logOcr } from './log.js';

function main(): void {
  const apiKey = getRequiredApiKey();
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const handler = createRequestHandler({ apiKey });

  const server = createServer((req, res) => {
    void handler(req, res);
  });

  server.listen(port, () => {
    logOcr({
      event: 'service_listen',
      ok: true,
      reason: `port_${port}`,
    });
  });
}

main();
