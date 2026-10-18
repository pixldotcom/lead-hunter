import type {IncomingMessage,ServerResponse} from 'node:http';
import {logServerError} from './diagnostics.ts';

// Load the application inside the invocation boundary so import/setup failures
// produce safe diagnostics and a closed response rather than an unhandled crash.
export function createProductionHandler(load=()=>import('./supabaseApp.ts')){
 let initialized:Promise<ReturnType<typeof import('./supabaseApp.ts').createSupabaseHandler>>|undefined;
 return async(req:IncomingMessage & {body?:unknown},res:ServerResponse)=>{
  try{
   initialized??=(async()=>{
    let app;try{app=await load()}catch(error){logServerError('MODULE_INIT',error);throw error}
    let config;try{config=app.supabaseConfig()}catch(error){logServerError('AUTH_CONFIG',error)}
    return app.createSupabaseHandler(config);
   })();
   await (await initialized)(req,res);
  }catch(error){
   logServerError('REQUEST_FAILED',error);
   if(res.destroyed||res.writableEnded)return;
   if(res.headersSent){res.end();return}
   res.writeHead(503,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});
   res.end(JSON.stringify({error:'The service is unavailable. Unsaved work can be retried.'}));
  }
 };
}
export const productionHandler=createProductionHandler();
