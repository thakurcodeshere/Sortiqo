import { PrismaClient, Category } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Initializing Sortiqo Scale Phase Stress-Test...");
  
  // Initialize an arbitrary User identity for stress testing
  const user = await prisma.user.create({
    data: {
      email: 'stress.tester@sortiqo.dev',
      accessToken: 'MOCK_GMAIL_ACCESS_TOKEN_XYZ123',
      refreshToken: 'MOCK_GMAIL_REFRESH_TOKEN_ABC456',
    }
  });

  console.log(`Injecting Massive Data Payload for User ID: ${user.id}`);

  // SDE5 / SDE6 Threshold: Injecting 50,000 email sender signatures to validate query execution bounds
  const totalSenders = 50000;
  const chunkSize = 5000;

  for (let i = 0; i < totalSenders; i += chunkSize) {
    const chunk = Array.from({ length: chunkSize }).map((_, index) => {
      // Stochastic classification mapping
      const isOrg = Math.random() > 0.3; 
      
      return {
        userId: user.id,
        domain: `domain_${i + index}.com`,
        name: `Heavy Corporate Entity ${i + index}`,
        category: isOrg ? Category.ORGANIZATION : Category.SERVICE,
        emailCount: Math.floor(Math.random() * 800), // Stochastic spam density
        unsubscribeUrl: isOrg ? `https://domain_${i + index}.com/unsubscribe/webhook` : null,
      };
    });
    
    await prisma.sender.createMany({
      data: chunk,
      skipDuplicates: true // High resilience schema flag
    });
    
    console.log(`[Scale Injection] Successfully committed Data Chunk ${i / chunkSize + 1} of ${totalSenders / chunkSize}.`);
  }

  console.log(`✅ System Stress Test Scaffold Completed. Ingested ${totalSenders} Mock Senders efficiently.`);
}

main()
  .catch(e => {
    console.error("Scale Test Failure: ", e);
    process.exit(1);
  })
  .finally(async () => {
    // Elegant closure pattern
    await prisma.$disconnect();
  });
