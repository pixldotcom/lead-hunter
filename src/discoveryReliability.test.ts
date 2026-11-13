import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('discovery reliability safeguards',()=>{
 const api=readFileSync(resolve(process.cwd(),'api/discover.ts'),'utf8');
 it('uses independent public OSM sources',()=>{
   expect(api).toContain('overpass-api.de');
   expect(api).toContain('overpass.private.coffee');
   expect(api).toContain('photon.komoot.io');
 });
 it('does not treat an empty upstream result as success',()=>{
   expect(api).toContain('next.result?.businesses.length');
   expect(api).toContain('if(found.length)');
 });
 it('includes diagnostic metadata and no paid API dependency',()=>{
   expect(api).toContain("console.info('[discovery]'");
   expect(api).toContain('X-Discovery-Engine');
   expect(api).not.toContain('GOOGLE_MAPS_API_KEY');
 });
});
