import { prisma } from './src/config/db.js';

async function testConnection() {
  try {
    console.log('Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully!');

    // Test query
    const users = await prisma.user.findFirst();
    console.log('✅ Database query works. Sample user:', users ? `Found ${users.fullName}` : 'No users found');

    await prisma.$disconnect();
    console.log('✅ Database disconnected');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();