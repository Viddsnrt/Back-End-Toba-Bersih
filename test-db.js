import { PrismaClient } from '@prisma/client';

async function testDB() {
  console.log('Testing database connection with DIRECT_URL...');

  // Test with direct URL
  const directPrisma = new PrismaClient({
    datasourceUrl: "postgresql://postgres:cOyf53GykK7nGd2z@db.fnfmcrsgssxlwqrehmaz.supabase.co:5432/postgres"
  });

  try {
    await directPrisma.$connect();
    console.log('✅ Direct database connected successfully');

    const count = await directPrisma.post.count();
    console.log(`📊 Total posts: ${count}`);

  } catch (error) {
    console.error('❌ Direct database connection failed:', error.message);
  } finally {
    await directPrisma.$disconnect();
  }
}

testDB();