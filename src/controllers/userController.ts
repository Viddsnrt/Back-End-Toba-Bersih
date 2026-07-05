import { prisma, supabase } from "../config/db.js";
import type { Request, Response } from "express";

// ================= GET USERS =================
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: "WARGA" },
      orderBy: { createdAt: "desc" },
    });

    const usersWithRegion = users.map((user: any) => ({
      ...user,
      region: "",
    }));

    res.json({
      success: true,
      data: usersWithRegion,
    });
  } catch (error: any) {
    console.error("GET USERS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Gagal ambil data",
      error: error.message,
    });
  }
};

// ================= CREATE USER =================
export const createUser = async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      email,
      phoneNumber,
      password,
      role,
      region,
    } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({
        success: false,
        message: "Nama dan email wajib diisi",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash: password || "default123",
        phoneNumber: phoneNumber || "",
        role: role || "WARGA",
      },
    });

    const responseData = {
      ...user,
      region: region || "",
    };

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error("CREATE USER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Gagal tambah user",
      error: error.message,
    });
  }
};

// UPDATE USER
export const updateUser = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { fullName, email, phoneNumber, region } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID tidak valid",
      });
    }

    const user = await prisma.user.update({
      where: { id: BigInt(id) },
      data: { fullName, email, phoneNumber },
    });

    const responseData = {
      ...user,
      region: region || "",
    };

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error("UPDATE USER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Gagal update",
      error: error.message,
    });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID tidak valid",
      });
    }

    await prisma.user.delete({ where: { id: BigInt(id) } });

    res.json({
      success: true,
      message: "Berhasil dihapus",
    });
  } catch (error: any) {
    console.error("DELETE USER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Gagal delete",
      error: error.message,
    });
  }
};