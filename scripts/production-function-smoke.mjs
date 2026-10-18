// Exercise a materialized @vercel/node output, never the source TS modules.
// Usage: node scripts/production-function-smoke.mjs .vercel/repro
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const output=process.argv[2];assert(output,'Supply the materialized Vercel function directory.');
process.env.OWNER_USER_ID='11111111-1111-4111-8111-111111111111';process.env.OWNER_EMAIL='one@fixture.example';
process.env.NODE_ENV='production';process.env.VERCEL='1';
process.env.SUPABASE_URL='https://fixture.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
process.env.APP_ORIGIN='https://leads.example.com';
const {default:handler}=await import(pathToFileURL(path.resolve(output,'api/auth/session.js')).href);
assert.equal(typeof handler,'function');
const server=createServer((req,res)=>{req.headers.host='leads.example.com';void handler(req,res)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(base+'/api/auth/session');
 assert.equal(response.status,401);assert.equal((await response.json()).code,'AUTH_REQUIRED');
 assert.equal((await fetch(base+'/api/auth/session',{headers:{origin:'https://other.example.com'}})).status,403);
 console.log('PASS: emitted Vercel function imports successfully, anonymous session returns 401, foreign origin returns 403.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
