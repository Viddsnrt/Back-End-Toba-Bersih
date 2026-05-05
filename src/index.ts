import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

import { prisma } from './config/db.js';
import laporanRoutes from './routes/laporanRoutes.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import driverRoutes from './routes/driverRoutes.js';
import penugasanRoutes from './routes/penugasanRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import postsRoutes from './routes/postRoutes.js';
import trackingRoutes from './routes/trackingRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import galleryRoutes from './routes/galleryRoutes.js';
import usersRoutes from './routes/usersRoutes.js';
import wilayahRoutes from './routes/wilayahRoutes.js';
import RouteRoutes from './routes/Route.routes.js';
import akunmasyarakatRoutes from './routes/akunmasyarakatRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


// 1. SETUP CORS YANG BENAR (Pindahkan ke sini, sebelum app.use rute)
app.use(cors({
  origin: ['http://localhost:3000', 'https://confoundedly-granitic-janetta.ngrok-free.dev'], 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  credentials: true
}));




// ================= SOCKET.IO =================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("📱 Klien terhubung:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Klien terputus:", socket.id);
  });
});

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/penugasan', penugasanRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/wilayah', wilayahRoutes);
app.use('/api/rute', RouteRoutes);
app.use('/api/users', akunmasyarakatRoutes);

(BigInt.prototype as any).toJSON = function () { return this.toString(); };

// ================= SEED ADMIN =================
const seedAdmin = async () => {
  try {
    const admin = await prisma.user.findUnique({
      where: { email: "admin@dlh.com" },
    });

    if (!admin) {
      const bcrypt = (await import('bcrypt')).default;
      const hashedPassword = await bcrypt.hash("admin123", 10);

      await prisma.user.create({
        data: {
          fullName: "Administrator DLH",
          email: "admin@dlh.com",
          passwordHash: hashedPassword,
          role: "ADMIN",
          isActive: true,
        },
      });

      console.log("✅ Admin default dibuat");
    }
  } catch (error) {
    console.error("❌ Seed admin gagal:", error);
  }
};

// Jalankan seed hanya jika database terhubung
if (process.env.NODE_ENV !== 'test') {
  seedAdmin();
}

// ================= ROOT =================
app.get("/", (req: Request, res: Response) => {
  res.send("🚀 Server TobaBersih OK!");
});

// ================= ERROR HANDLER =================
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error("🔥 ERROR:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ================= START SERVER =================
server.listen(PORT, () => {
  console.log(`🚀 Server jalan di http://localhost:${PORT}`);
  console.log("🔌 WebSocket aktif");
});

// ================= GRACEFUL SHUTDOWN =================
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});