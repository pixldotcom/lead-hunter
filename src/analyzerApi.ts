export async function requestAudit(url: string, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }), signal: signal?AbortSignal.any([signal,AbortSignal.timeout(40000)]):AbortSignal.timeout(40000) });
  } catch {
    if(signal?.aborted)throw new Error('Analysis cancelled.');
    throw new Error('Analyzer unavailable or timed out. Check your connection and try again.');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('Analyzer unavailable. Try again later or contact the workspace owner.'); }
  if(response.status===401&&typeof window!=='undefined')window.dispatchEvent(new Event('pixldot:auth-required'));
  if (!response.ok) throw new Error(data.error || 'Analysis failed. Check the URL and retry.');
  return data;
}
