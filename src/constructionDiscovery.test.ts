import {describe,it,expect} from 'vitest';
import {buildOverpassQuery,parseOverpassBusinesses} from './openStreetMap';

describe('construction discovery categories',()=>{
  it.each([
    ['Builder','craft','builder'],
    ['building contractor','craft','builder'],
    ['construction company','office','construction_company'],
    ['architect','office','architect'],
    ['electrician','craft','electrician'],
    ['plumber','craft','plumber'],
  ])('maps %s to %s=%s', (category,key,value)=>{
    const query=buildOverpassQuery(category,'Noida');
    expect(query).toContain(`["${key}"="${value}"]`);
  });
  it('preserves website-unknown evidence for businesses without OSM website tags',()=>{
    const results=parseOverpassBusinesses({elements:[{type:'node',id:17,lat:28.6,lon:77.3,tags:{name:'Example Builder',craft:'builder'}}]},'Builder','Noida');
    expect(results).toHaveLength(1);
    expect(results[0].websiteStatus).toBe('unknown');
    expect(results[0].sourceUrl).toContain('/node/17');
  });
});
