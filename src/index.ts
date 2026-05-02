import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

// ================= CONFIG & ROUTES =================
import { prisma } from "./config/db";

import authRoutes from "./routes/authRoutes";
import adminRoutes from "./routes/adminRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import driverRoutes from "./routes/driverRoutes";
import laporanRoutes from "./routes/laporanRoutes";
import penugasanRoutes from "./routes/penugasanRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import postsRoutes from "./routes/postRoutes";
import usersRoutes from "./routes/usersRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());

// ================= ROUTES =================
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/laporan", laporanRoutes);
app.use("/api/penugasan", penugasanRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/users", usersRoutes);

// ================= BIGINT FIX =================
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// ================= SEED ADMIN =================
const seedAdmin = async () => {
  try {
    const admin = await prisma.user.findUnique({
      where: { email: "admin@dlh.com" },
    });

    if (!admin) {
      await prisma.user.create({
        data: {
          fullName: "Administrator DLH",
          email: "admin@dlh.com",
          passwordHash: "admin123", // ⚠️ sebaiknya bcrypt
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

seedAdmin();

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