import { Lead } from '../../domain';

// Follow-up reminder scheduling
export function scheduleFollowUp(firstContact: string | undefined): { nextFollowUp: string; daysUntil: number } | null {
  if(!firstContact)return null;
  const contactDate = new Date(firstContact);
  if(isNaN(contactDate.getTime()))return null;
  const today = new Date();
  const daysSinceContact = Math.round((today.getTime() - contactDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Follow-up schedule: day 3, 7, 14 after first contact
  const schedule = [3, 7, 14];
  const nextScheduled = schedule.find(d => d > daysSinceContact);
  
  if(!nextScheduled)return null; // All follow-ups completed
  
  const nextDate = new Date(contactDate);
  nextDate.setDate(contactDate.getDate() + nextScheduled);
  const nextISO = nextDate.toISOString().split('T')[0];
  
  return { nextFollowUp: nextISO, daysUntil: nextScheduled - daysSinceContact };
}

// Function to check if follow-up should be sent
export function shouldSendFollowUp(lead: Lead, todayISO: string): { send: boolean; days: number; type: 'day-3'|'day-7'|'day-14'|'no-contact'|'completed' } {
  if(lead.stage === 'Won' || lead.stage === 'Lost')return { send: false, days: 0, type: 'completed' };
  
  const contactDate = lead.firstContact ? new Date(lead.firstContact) : null;
  if(!contactDate || isNaN(contactDate.getTime()))return { send: false, days: 0, type: 'no-contact' };
  
  const today = new Date(todayISO);
  const daysSinceContact = Math.round((today.getTime() - contactDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Check if already replied or opted out
  if(lead.lastResponse && lead.lastResponse.trim())return { send: false, days: 0, type: 'completed' };
  
  const schedule = [3, 7, 14];
  const nextScheduled = schedule.find(d => d > daysSinceContact);
  
  if(!nextScheduled)return { send: false, days: 0, type: 'completed' };
  
  const daysUntil = nextScheduled - daysSinceContact;
  const type: 'day-3'|'day-7'|'day-14'|'completed' = daysUntil === 3 ? 'day-3' : daysUntil === 7 ? 'day-7' : daysUntil === 14 ? 'day-14' : 'completed';
  
  return { send: true, days: daysUntil, type };
}
