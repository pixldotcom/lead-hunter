import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const bin=process.env.PATH.split(path.delimiter).find(dir=>existsSync(path.join(dir,process.platform==='win32'?'vercel.cmd':'vercel')));
if(!bin)throw Error('Run with: npm exec --package vercel -- node scripts/build-function-smoke.mjs');
const require=createRequire(path.resolve(bin,'../vercel/package.json'));
const {build}=require('@vercel/node');const {FileFsRef}=require('@vercel/build-utils');
const root=process.cwd();
// isDev skips account access and installation; this still traces and emits
// the function using Vercel's compiler. It does not verify hosted project settings.
const {output}=await build({files:{'api/auth/session.ts':new FileFsRef({fsPath:path.join(root,'api/auth/session.ts')})},entrypoint:'api/auth/session.ts',workPath:root,config:{zeroConfig:true},meta:{isDev:true}});
await mkdir('.vercel',{recursive:true});const out=await mkdtemp(path.join(root,'.vercel/function-smoke-'));
for(const [name,file] of Object.entries(output.files)){
 const dest=path.join(out,name);await mkdir(path.dirname(dest),{recursive:true});
 if(file.data!==undefined)await writeFile(dest,file.data);else if(file.fsPath)await copyFile(file.fsPath,dest);else throw Error('Unsupported builder file');
}
const child=spawnSync(process.execPath,['scripts/production-function-smoke.mjs',out],{stdio:'inherit'});
process.exitCode=child.status??1;
