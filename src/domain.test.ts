import { describe,it,expect } from 'vitest';
import { calculateScore, normalizeDomain, parseCsv, importCsvRows, makeLead, parseBackup, totalRevenue } from './domain';
const base={fit:'good fit',services:['WordPress development'],findings:[],email:'',contactPage:'',sourceUrl:'',discovery:'',researchedAt:''};
describe('domain rules',()=>{
 it('normalizes domains and rejects unsafe or local urls',()=>{expect(normalizeDomain('https://WWW.Example.com/path')).toBe('example.com');expect(()=>normalizeDomain('javascript:alert(1)')).toThrow();expect(()=>normalizeDomain('localhost')).toThrow();});
 it('scores only confirmed actionable evidence',()=>{const result=calculateScore({...base,findings:[{id:'1',title:'slow',category:'performance',severity:'high',explanation:'',evidence:'',pageUrl:'',recommendation:'',confidence:'unverified',timestamp:''}]});expect(result.breakdown.problems).toBe(0);expect(result.breakdown.fit).toBe(30);});
 it('validates CSV before importing and normalizes duplicates',()=>{const rows=parseCsv('Business,Website\nOne,https://one.example\nOther,www.one.example');const result=importCsvRows(rows);expect(result.leads).toHaveLength(1);expect(result.duplicates).toHaveLength(1);expect(()=>importCsvRows(parseCsv('Business,Website\nBroken,bad'))).toThrow();});
 it('roundtrips supported backup and counts won revenue only',()=>{const lead=makeLead({name:'Acme',website:'acme.example',stage:'Won',revenueWon:1234});expect(parseBackup(JSON.stringify({version:1,leads:[lead]})).leads).toHaveLength(1);expect(totalRevenue([lead,makeLead({name:'Lost',website:'lost.example',stage:'Lost',revenueWon:900})])).toBe(1234);});
});
