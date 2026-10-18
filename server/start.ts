import {createServer} from 'node:http';
import {productionHandler} from './production.ts';
const server=createServer(productionHandler);
server.on('error', () => { console.error('Analyzer could not start. Check whether port 5174 is already in use.'); process.exitCode = 1; });
server.listen(5174, '127.0.0.1', () => console.log('PixlDot analyzer: http://127.0.0.1:5174/api/health'));
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => server.close());
