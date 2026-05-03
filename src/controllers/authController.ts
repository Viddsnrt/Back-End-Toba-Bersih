import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';



export const login = async (req: Request, res: Response): Promise<any> => {
  const { email, password } = req.body;

  try {
    console.log(`\n➡️ Seseorang mencoba login dengan email: ${email}`);

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.log("❌ GAGAL: Email tidak ditemukan di database.");
      return res.status(401).json({ success: false, message: 'Email tidak terdaftar' });
    }

    let isPasswordValid = false;

    if (user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2a$')) {
      isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    } else {
      isPasswordValid = (user.passwordHash === password);
    }

    if (!isPasswordValid) {
      console.log("❌ GAGAL: Password yang dimasukkan salah.");
      return res.status(401).json({ success: false, message: 'Password salah' });
    }

    console.log(`✅ BERHASIL: ${user.fullName} login sebagai ${user.role}`);

    // ✅ Generate JWT Token dengan role
    const token = jwt.sign(
      { 
        id: user.id.toString(), 
        email: user.email, 
        role: user.role,
        fullName: user.fullName 
      },
      process.env.JWT_SECRET || 'rahasia-default',
      { expiresIn: '24h' }
    );

    return res.json({ 
      success: true, 
      token, // ✅ Return JWT token
      user: {
        id: user.id.toString(),
        name: user.fullName,
        email: user.email,
        role: user.role
      }
    });

  } catch (error: any) {
    console.error("🔥 ERROR SISTEM SAAT LOGIN:", error);
    return res.status(500).json({ success: false, message: `Kesalahan server: ${error.message}` });
  }
};

// Fungsi Register Khusus Warga (Masyarakat)
export const register = async (req: Request, res: Response): Promise<any> => {
  const { fullName, email, password } = req.body;

  try {
    // 1. Cek apakah email sudah terpakai
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email sudah terdaftar, silakan gunakan email lain.' });
    }

    // 2. Enkripsi Password demi keamanan
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Simpan ke database dengan role WARGA
    const newUser = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash: hashedPassword,
        role: 'WARGA',
        isActive: true
      }
    });

    return res.status(201).json({ 
      success: true, 
      message: 'Registrasi berhasil! Silakan login.',
      data: { id: newUser.id.toString(), name: newUser.fullName, email: newUser.email }
    });

  } catch (error: any) {
    console.error("🔥 ERROR SAAT REGISTER:", error);
    return res.status(500).json({ success: false, message: `Kesalahan server: ${error.message}` });
  }
};