// Outreach templates with placeholders for business name, observed issue, and proposal offer
export type OutreachTemplate = {
  id: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  senderIdentity: string;
  optOutLine: string;
};

export const TEMPLATES = {
  template1: {
    id: 'template-1',
    name: 'Direct value proposition',
    subjectTemplate: 'Quick question for ${name}',
    bodyTemplate: 'Hi ${name},\n\nI came across your business and noticed ${observedIssue}.\n\nAt PixlDot, we help businesses like yours with website improvements and digital presence. Would you be open to a brief conversation?\n\nBest,\nRajesh\nPixlDot\nhttps://pixldot.com\n\n---\nIf you no longer wish to receive such proposals, please reply "unsubscribe".',
    senderIdentity: 'Rajesh, PixlDot web development studio',
    optOutLine: 'If you no longer wish to receive such proposals, please reply "unsubscribe".'
  },
  template2: {
    id: 'template-2',
    name: 'Case study approach',
    subjectTemplate: 'Improvement idea for ${name}',
    bodyTemplate: 'Hi ${name},\n\nI noticed ${observedIssue} on your homepage.\n\nOur work with similar businesses has seen positive results from website improvements. Could we explore a quick 15-minute call?\n\nBest,\nRajesh\nPixlDot\nhttps://pixldot.com\n\n---\nIf you prefer not to receive such suggestions, please reply "opt-out".',
    senderIdentity: 'Rajesh, PixlDot web development studio',
    optOutLine: 'If you prefer not to receive such suggestions, please reply "opt-out".'
  },
  template3: {
    id: 'template-3',
    name: 'Problem-agitate-solution',
    subjectTemplate: '${name} - addressing the issue',
    bodyTemplate: 'Hi ${name},\n\nI identified ${observedIssue} for your business.\n\nMany businesses face online engagement challenges. Here\'s a focused review and targeted improvements approach.\n\nWould you like to discuss this further?\n\nBest,\nRajesh\nPixlDot\nhttps://pixldot.com\n\n---\nIf this does not apply to you, please reply "unsubscribe".',
    senderIdentity: 'Rajesh, PixlDot web development studio',
    optOutLine: 'If this does not apply to you, please reply "unsubscribe".'
  }
};
