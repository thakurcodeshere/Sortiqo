// SDE3/SDE4: Ingest Read Mails Service (Production API)
import { google } from 'googleapis';
import { extractEmailParts, analyzeSenderCategory } from './intelligence';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function ingestReadEmails(userId: string, accessToken: string) {
  console.log(`[Ingestion Core] Authenticating live Gmail API for User: ${userId}`);

  // TASK 1 CONSTRAINT: Utilizing the granted secure user permission accessToken 
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  // TASK 2 CONSTRAINT: Access all Read mails securely
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  try {
    console.log(`[Ingestion Core] Executing strict API query q="is:read"`);
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:read', // Constraint strictly filtering read emails
      maxResults: 100 // Scale parameter batching payload
    });

    const messages = res.data.messages || [];
    console.log(`[Ingestion Core] Discovered ${messages.length} read emails. Securely routing metadata...`);

    let processedCount = 0;

    for (const msg of messages) {
      if (!msg.id) continue;
      
      // Requesting purely metadata to prioritize privacy and bandwidth footprint
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'List-Unsubscribe']
      });

      const headers = details.data.payload?.headers || [];
      const fromHeader = headers.find(h => h.name === 'From')?.value;
      const listUnsubHeader = headers.find(h => h.name === 'List-Unsubscribe')?.value;

      if (!fromHeader) continue;

      // TASK 3 CONSTRAINT: Find sender's name
      const { name, localPart, domain } = extractEmailParts(fromHeader);

      // TASK 3a & 3b CONSTRAINT: Check if it's from Organisation or Service
      const category = analyzeSenderCategory(localPart, listUnsubHeader);

      // Upsert to DB accurately updating frequency density mapping
      await prisma.sender.upsert({
        where: { userId_domain: { userId, domain } },
        create: {
          userId,
          domain,
          name,
          category,
          emailCount: 1,
          unsubscribeUrl: listUnsubHeader || null
        },
        update: {
          emailCount: { increment: 1 }
        }
      });
      processedCount++;
    }

    console.log(`[Ingestion Core] Genuine synchronization executed seamlessly on ${processedCount} valid sender configurations.`);
    return { success: true, processedMessages: processedCount };
    
  } catch (error) {
    console.error("[Ingestion Core] Google API Security/Network Exception:", error);
    throw error;
  }
}
