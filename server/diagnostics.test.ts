import {afterEach,expect,it,vi} from 'vitest';
import {createServer} from 'node:http';
import {logServerError} from './diagnostics.ts';
import {createProductionHandler} from './production.ts';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()});
it('logs categories and stack locations without error messages or source excerpts',()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const error=new TypeError('cookie=private-cookie token=private-token password=private-password');
 error.stack='TypeError: private-token\nprivate-source-excerpt\n    at unsafeName(private-cookie) (/var/task/server/production.js:12:3)\n    at /var/task/server/supabaseApp.js:4:9\n    at https://example.com/token=private-token:1:2';
 logServerError('MODULE_INIT',error);
 const output=log.mock.calls[0][1];expect(output).toContain('MODULE_INIT');expect(output).toContain('/var/task/server/production.js:12:3');expect(output).toContain('/var/task/server/supabaseApp.js:4:9');expect(output).not.toMatch(/private-|unsafeName|https:/);
});
it('contains application import failures and returns a closed JSON response',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const handler=createProductionHandler(async()=>{throw Object.assign(new Error('private-token'),{code:'ERR_MODULE_NOT_FOUND'})});
 const server=createServer((req,res)=>void handler(req,res));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();if(!address||typeof address==='string')throw Error('Missing port');
  const response=await fetch(`http://127.0.0.1:${address.port}/api/auth/session`);
  expect(response.status).toBe(503);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.text()).not.toContain('private-token');
  expect(log.mock.calls.map(c=>c[1]).join('')).toContain('ERR_MODULE_NOT_FOUND');expect(log.mock.calls.map(c=>c[1]).join('')).not.toContain('private-token');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
