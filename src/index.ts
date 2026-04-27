import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';

import { prisma } from './config/db.js';
import laporanRoutes from './routes/laporanRoutes.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import driverRoutes from './routes/driverRoutes.js';
import penugasanRoutes from './routes/penugasanRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Setup Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('📱 Klien terhubung:', socket.id);
  socket.on('disconnect', () => {
    console.log('Klien terputus:', socket.id);
  });
});

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes); 
app.use('/api/driver', driverRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/penugasan', penugasanRoutes);
app.use('/api/dashboard', dashboardRoutes);

(BigInt.prototype as any).toJSON = function () { return this.toString(); };

const seedUser = async () => {
  try {
    const admin = await prisma.user.findUnique({ where: { email: "admin@dlh.com" } });
    if (!admin) {
      await prisma.user.create({
        data: {
          fullName: "Administrator DLH",
          email: "admin@dlh.com",
          passwordHash: "admin123",
          role: "ADMIN",
          isActive: true
        }
      });
      console.log("✅ User Admin Default OK");
    }
  } catch (e) { 
    console.error("🔥 Seeding gagal:", e); 
  }
};

seedUser();

app.get('/', (req: Request, res: Response) => {
  res.send('🚀 Server TobaBersih OK!');
});

// Error middleware - HARUS 4 parameter agar Express mengenalinya sebagai error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Error:', err);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

server.listen(PORT, () => {
  console.log(`🚀 Server nyala di http://localhost:${PORT}`);
  console.log(`🔌 WebSocket aktif!`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});