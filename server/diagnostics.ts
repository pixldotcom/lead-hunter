import {SupabaseConfigError} from './supabaseConfig.ts';
// Deliberately omit error messages, source excerpts, URLs and request data.
// Keep only stack locations: messages and even function names can contain input.
export function logServerError(category:'MODULE_INIT'|'AUTH_CONFIG'|'REQUEST_FAILED',error:unknown){
 const knownCodes=['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND','ERR_UNKNOWN_FILE_EXTENSION','ERR_REQUIRE_ESM','ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'];
 const code=error instanceof Error&&'code' in error&&knownCodes.includes(String(error.code))?String(error.code):undefined;
 const kind=error instanceof TypeError?'TypeError':error instanceof SyntaxError?'SyntaxError':error instanceof RangeError?'RangeError':'Error';
 const frames=error instanceof Error?(error.stack??'').split('\n').slice(1).flatMap(line=>{
  // Only local JS/TS file locations and Node internals, never URL query strings.
  const location=line.match(/(?:\(|\s)((?:file:\/\/\/|[A-Za-z]:[\\/]|\/|node:)[^\s()?<>]+):(\d+):(\d+)\)?$/);
  if(!location||!/(?:\.[cm]?[jt]s|node:[\w/]+)$/.test(location[1]))return [];
  return [`    at ${location[1]}:${location[2]}:${location[3]}`];
 }).slice(0,20):[];
 const configIssues=category==='AUTH_CONFIG'&&error instanceof SupabaseConfigError?error.issues:undefined;
 console.error('[server]',JSON.stringify({category,kind,code,configIssues,stack:[kind,...frames].join('\n')}));
}
