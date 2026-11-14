import {describe,expect,it} from 'vitest';
import {buildAgentResearchPrompt} from './agentResearch';
import type {BusinessRecord,OpportunityAnalysis} from './opportunityModel';

const business:BusinessRecord={id:'b1',name:'Example Gym',category:'gym',location:'Ludhiana',websiteUrl:'',websiteStatus:'unknown',rating:null,reviewCount:null,phone:'',email:'',profiles:[],discoverySource:'OpenStreetMap',sourceUrl:'https://www.openstreetmap.org/node/123',discoveredAt:'2026-11-13',updatedAt:'2026-11-13'};
const analysis:OpportunityAnalysis={businessId:'b1',websiteStatus:'unknown',opportunities:[],evidence:[],totalScore:0,reputationScore:0,evidenceConfidence:0,analyzedAt:'2026-11-13',researchPrompt:'',researchNotes:{summary:'Website not verified',facts:[],hypotheses:['May need a website'],unknowns:['Find official site'],nextSteps:['Check business listings'],importedAt:'2026-11-13'}};
describe('portable AI research prompt',()=>{
 it('includes prospect context and explicitly prevents fabricated website claims',()=>{const prompt=buildAgentResearchPrompt(business);expect(prompt).toContain('Example Gym');expect(prompt).toContain('Ludhiana');expect(prompt).toContain('Do not invent reviews');expect(prompt).toContain('facts');expect(prompt).toContain('sourceUrl');});
 it('includes saved unknowns for follow-up research',()=>{const prompt=buildAgentResearchPrompt(business,analysis,'follow_up');expect(prompt).toContain('Find official site');expect(prompt).toContain('remaining unknowns');});
 it('requires raw JSON and unescaped URL formatting',()=>{const prompt=buildAgentResearchPrompt(business);expect(prompt).toContain('not a quoted or escaped JSON string');expect(prompt).toContain('Never add a backslash at the end of a line');expect(prompt).toContain('Do not add backslashes before URL punctuation');});
 it('keeps outreach in research-only mode',()=>{const prompt=buildAgentResearchPrompt(business,analysis,'outreach');expect(prompt).toContain('Do not contact the business');expect(prompt).toContain('outreach angles');});
});
