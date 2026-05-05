import { PrismaClient, Category } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Prototype BigInt agar tidak error
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

async function main() {
  console.log('🌱 Memulai proses Seeding...');

  // 1. Akun Admin
  let admin = await prisma.user.findUnique({ where: { email: "admin@dlh.com" } });
  if (!admin) {
    // Enkripsi password untuk keamanan
    const adminPassword = await bcrypt.hash("admin123", 10);
    admin = await prisma.user.create({
      data: {
        fullName: "Administrator DLH",
        email: "admin@dlh.com",
        passwordHash: adminPassword,
        role: "ADMIN",
        isActive: true
      }
    });
    console.log("✅ User Admin OK (admin@dlh.com)");
  } else {
    console.log("✅ User Admin sudah ada di database");
  }

  // 2. Akun Warga (Budi)
  let warga = await prisma.user.findUnique({ where: { email: "budi@gmail.com" } });
  if (!warga) {
    const wargaPassword = await bcrypt.hash("budi123", 10);
    await prisma.user.create({
      data: {
        fullName: "Budi Santoso",
        email: "budi@gmail.com",
        passwordHash: wargaPassword,
        role: "WARGA",
        isActive: true
      }
    });
    console.log("✅ User Warga OK (budi@gmail.com)");
  }

  // 3. Akun Supir (Pak Tarjo)
  let supir = await prisma.user.findUnique({ where: { email: "tarjo@gmail.com" } });
  if (!supir) {
    const supirPassword = await bcrypt.hash("tarjo123", 10);
    supir = await prisma.user.create({
      data: {
        fullName: "Pak Tarjo",
        email: "tarjo@gmail.com",
        passwordHash: supirPassword,
        role: "OPERATOR",
        isActive: true
      }
    });
    console.log("✅ User Supir OK (tarjo@gmail.com)");
  } else {
    console.log("✅ User Supir sudah ada di database");
  }

  // 4. Data Berita (Sekarang admin.id bisa dibaca)
  const posts = [
    {
      title: 'Pengumuman Jadwal Baru Pengangkutan',
      slug: 'jadwal-baru-2026',
      content: 'Mulai Maret 2026, armada akan beroperasi mulai pukul 05.00 WIB...',
      category: Category.PENGUMUMAN, 
      isPublished: true,
      isFeatured: true,
      authorId: admin.id, 
    },
    {
      title: 'Tips Memilah Sampah Organik di Rumah',
      slug: 'tips-pilah-sampah',
      content: 'Memilah sampah dari rumah membantu mempercepat proses pengolahan di TPA...',
      category: Category.BERITA, 
      isPublished: true,
      isFeatured: false,
      authorId: admin.id, 
    }
  ];

  console.log('⏳ Menyinkronkan data berita...');

  for (const post of posts) {
    await prisma.post.upsert({
      where: { slug: post.slug },
      update: {
        title: post.title,
        content: post.content,
        category: post.category,
        isPublished: post.isPublished,
        isFeatured: post.isFeatured,
        authorId: post.authorId,
      },
      create: post,
    });
  }

  console.log('✅ Seeding Selesai!');
}

main()
  .catch((e) => {
    console.error("🔥 Error saat seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });