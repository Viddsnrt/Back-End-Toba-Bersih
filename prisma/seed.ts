import { PrismaClient, Category } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

async function main() {
  await prisma.post.deleteMany({});
  // ADMIN
  let admin = await prisma.user.findUnique({ where: { email: 'admin@dlh.com' } });
  if (!admin) {
    const adminPassword = await bcrypt.hash('admin123', 10);
    admin = await prisma.user.create({
      data: { fullName: 'Administrator DLH', email: 'admin@dlh.com', passwordHash: adminPassword, role: 'ADMIN', isActive: true }
    });
  }

  // KABID
  const kabidExists = await prisma.user.findFirst({ where: { role: 'KABID' } });
  if (!kabidExists) {
    const kabidPassword = await bcrypt.hash('rinasondangdlh123', 10);
    await prisma.user.create({
      data: { fullName: 'Rina Sondang Lumban Toruan', email: 'rinasondanglumbantoruan@gmail.com', passwordHash: kabidPassword, role: 'KABID', isActive: true }
    });
    console.log('✅ Akun Kabid berhasil dibuat');
  } else {
    console.log('ℹ️ Akun Kabid sudah ada, skip');
  }

  // WARGA
  let warga = await prisma.user.findUnique({ where: { email: 'budi@gmail.com' } });
  if (!warga) {
    const wargaPassword = await bcrypt.hash('budi123', 10);
    await prisma.user.create({
      data: { fullName: 'Budi Santoso', email: 'budi@gmail.com', passwordHash: wargaPassword, role: 'WARGA', isActive: true }
    });
  }

  // SUPIR / OPERATOR
  let supir = await prisma.user.findUnique({ where: { email: 'tarjo@gmail.com' } });
  if (!supir) {
    const supirPassword = await bcrypt.hash('tarjo123', 10);
    await prisma.user.create({
      data: { fullName: 'Pak Tarjo', email: 'tarjo@gmail.com', passwordHash: supirPassword, role: 'OPERATOR', isActive: true }
    });
  }

  console.log('✅ Seeding selesai');
}

// ← INI yang kurang
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });