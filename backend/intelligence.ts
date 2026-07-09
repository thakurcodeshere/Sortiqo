// SDE4 - Intelligence Engine (Sender Analysis)
// Deterministic heuristics engine analyzing millions of emails synchronously

export enum Category {
  ORGANIZATION = 'ORGANIZATION',
  SERVICE = 'SERVICE'
}

// Highly reliable namespace patterns indicating non-marketing transactional servers (Task 3b)
const SERVICE_PREFIXES = [
  'receipts', 'billing', 'noreply', 'no-reply', 'support', 
  'alerts', 'auth', 'security', 'invoices', 'updates', 
  'statements', 'donotreply', 'orders'
];

export function extractEmailParts(rawFromHeader: string) {
  // Expecting format: "Uber Receipts <receipts@uber.com>" or "receipts@uber.com"
  const emailRegex = /<([^>]+)>/;
  const match = rawFromHeader.match(emailRegex);
  
  const emailAddress = match ? match[1] : rawFromHeader.trim();
  const name = rawFromHeader.replace(emailRegex, '').replace(/"/g, '').trim() || emailAddress;
  
  const [localPart, domain] = emailAddress.split('@');
  return { name, localPart, domain };
}

export function analyzeSenderCategory(localPart: string, listUnsubscribeHeader?: string): Category {
  // Task 3a: The presence of RFC-8058 standard List-Unsubscribe strictly guarantees marketing/organization
  if (listUnsubscribeHeader && listUnsubscribeHeader.trim().length > 0) {
    return Category.ORGANIZATION;
  }

  // Task 3b: Detect critical services that should NOT be mass-unsubscribed
  if (localPart && SERVICE_PREFIXES.includes(localPart.toLowerCase())) {
    return Category.SERVICE;
  }
  
  // Fallback heuristic: Assume standard organization broadcast
  return Category.ORGANIZATION;
}
