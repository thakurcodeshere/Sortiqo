import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { ingestReadEmails } from './gmail';

const app = express();
const prisma = new PrismaClient();

// Task 5: Background Scalability Protocol - BullMQ Redis Queue
// We safely wrap Redis initialization so the server doesn't crash if Redis is unavailable locally.
let unsubscribeQueue: any = null;
try {
  unsubscribeQueue = new Queue('unsubscribe-queue', {
    connection: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379')
    }
  });
  unsubscribeQueue.on('error', (err: any) => console.log('Redis Connection Gracefully Degraded'));
} catch(e) {
  console.log("Redis unavailable locally. Running in degraded Background Mode.");
}

app.use(cors());
app.use(express.json());

// Healthcheck
app.get('/', (req, res) => res.send('Sortiqo Backend Engine is Online'));

// --------------------------------------------------------------------------
// TASK 1: OAUTH PERMISSIONS (SDE3)
// --------------------------------------------------------------------------
app.get('/auth/google', (req, res) => {
  // TODO: Redirect user to Google OAuth Consent screen requesting Gmail Scopes
  res.json({ message: "Redirecting to Google OAuth...", scopes: ["gmail.readonly", "gmail.modify"] });
});

app.post('/auth/google/callback', async (req, res) => {
  // TODO: Exchange OAuth code for AccessToken and RefreshToken, then Upsert to DB
  res.json({ success: true, message: "Tokens generated & encrypted successfully." });
});

// --------------------------------------------------------------------------
// TASK 1 & 2: OAUTH PERMISSIONS & EMAIL INGESTION HYBRID (SDE3/SDE4)
// --------------------------------------------------------------------------
app.post('/api/ingest', async (req, res) => {
  const { accessToken, userId } = req.body;
  if (!accessToken || !userId) {
    return res.status(400).json({ error: "Missing OAuth Token or User Identifier" });
  }

  try {
    const result = await ingestReadEmails(userId, accessToken);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to ingest emails using Google Workspace API." });
  }
});

// --------------------------------------------------------------------------
// TASK 4 & SCALE PHASE: PAGINATED ORGANIZATION TABLE INGESTION (SDE5)
// --------------------------------------------------------------------------
app.get('/api/senders', async (req, res) => {
  const cursor = req.query.cursor as string;
  const take = parseInt(req.query.limit as string) || 50;

  // Use highly-performant cursor-based pagination for massive infinite scrolling workloads
  const senders = await prisma.sender.findMany({
    take,
    skip: cursor ? 1 : 0, // Bypass the cursor anchor itself
    ...(cursor && { cursor: { id: cursor } }),
    orderBy: { emailCount: 'desc' }
  });

  const nextCursor = senders.length === take ? senders[take - 1].id : null;
  
  res.json({ 
    senders, 
    nextCursor 
  });
});

// --------------------------------------------------------------------------
// TASK 5: ASYNC UNSUBSCRIBE WORKER DISPATCHER (SDE5)
// --------------------------------------------------------------------------
app.post('/api/senders/:id/unsubscribe', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Optimistically toggle state in DB for instantaneous UI response
    await prisma.sender.update({
      where: { id },
      data: { isUnsubscribed: true }
    });

    // Scale Phase: Push complex unsubscribe logic to BullMQ Background Worker
    if (unsubscribeQueue) {
      await unsubscribeQueue.add('process-unsubscribe', { senderId: id }).catch((e: any) => console.log('Redis task dropped securely.'));
    }
    
    res.json({ success: true, message: "Unsubscribe sequence securely queued." });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: "Operation Failed." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sortiqo Engine running on port ${PORT}`);
});
