import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
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
import postsRoutes from './routes/beritaRoutes.js';
import routeRoutes from './routes/Routeroutes.js';
import usersRoutes from './routes/usersRoutes.js';
import pelangganRoutes from './routes/pelangganRoute.js';
import galleryRoutes from './routes/galleryRoutes.js';
import edukasiRoutes from './routes/edukasiRoutes.js';
import { sendEmail } from "./utils/sendEmail.js";
import kabidRoutes from './routes/kabidRoutes.js';
import wilayahRoutes from './routes/wilayahRoutes.js';
import trackingRoutes from './routes/trackingRoutes.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


// 1. SETUP CORS YANG BENAR (Pindahkan ke sini, sebelum app.use rute)
app.use(cors({
  origin: ['http://localhost:3000', 'https://confoundedly-granitic-janetta.ngrok-free.dev',
      'http://187.77.121.239:3001'
  ], 
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
  console.log("Klien terhubung:", socket.id);

  socket.on("disconnect", () => {
    console.log("Klien terputus:", socket.id);
  });
});

// ================= BODY PARSER MIDDLEWARE =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/penugasan', penugasanRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/rute', routeRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/wilayah', wilayahRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/pelanggan', pelangganRoutes);
app.use('/api/galleries', galleryRoutes);
app.use('/api/edukasi', edukasiRoutes);
app.use('/api/kabid', kabidRoutes);
app.use('/api/tracking', trackingRoutes);

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

// Jalankan seed hanya jika diminta (hindari gagal startup saat DB belum tersedia)
// set SEED_ADMIN=true di .env untuk mengaktifkan
if (process.env.SEED_ADMIN === 'true') {
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

app.get("/test-email", async (req, res) => {
  await sendEmail(
    "ivansrt883@gmail.com",
    "TEST EMAIL",
    "Ini test dari sistem kamu"
  );

  res.send("Email dikirim!");
});