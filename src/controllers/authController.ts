import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET) {
  console.error('🔴 CRITICAL: JWT_SECRET not configured in .env');
  process.exit(1);
}

export const login = async (req: Request, res: Response): Promise<any> => {
  const { email, password, fcmToken } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password harus diisi', code: 'INVALID_INPUT' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Format email tidak valid', code: 'INVALID_EMAIL_FORMAT' });
    }

    console.log(`\n➡️ Login attempt: ${email}`);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        passwordHash: true,
        isActive: true,
      }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Email atau password tidak valid', code: 'INVALID_CREDENTIALS' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Akun Anda telah dinonaktifkan. Hubungi admin.', code: 'ACCOUNT_INACTIVE' });
    }

    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Email atau password tidak valid', code: 'INVALID_CREDENTIALS' });
    }

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Email atau password tidak valid', code: 'INVALID_CREDENTIALS' });
    }

    if (fcmToken) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { fcm_token: fcmToken }
        });
      } catch (tokenError) {
        console.error('⚠️ Gagal memperbarui FCM Token:', tokenError);
      }
    }

    const tokenPayload = {
      id: user.id.toString(),
      email: user.email,
      role: user.role,
      fullName: user.fullName
    };

    let token: string;
    try {
      token = jwt.sign(tokenPayload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN as any,
        algorithm: 'HS256'
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Gagal generate token.', code: 'TOKEN_GENERATION_ERROR' });
    }

    try {
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });
    } catch (err) {
      console.warn('Warning: unable to set httpOnly cookie.', err);
    }

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      token,
      user: {
        id: user.id.toString(),
        name: user.fullName,
        email: user.email,
        role: user.role,
      },
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Kesalahan server.',
      code: 'INTERNAL_SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

export const register = async (req: Request, res: Response): Promise<any> => {
  const { fullName, email, password, passwordConfirm, phoneNumber,alamat,locationId,jenisUsaha } = req.body;

try {

  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Nama lengkap, email, dan password harus diisi',
      code: 'INVALID_INPUT'
    });
  }

  if (!alamat) {
    return res.status(400).json({
      success: false,
      message: 'Alamat harus diisi',
      code: 'ADDRESS_REQUIRED'
    });
  }

  if (!locationId) {
    return res.status(400).json({
      success: false,
      message: 'Wilayah harus dipilih',
      code: 'LOCATION_REQUIRED'
    });
  }

  if (!jenisUsaha) {
    return res.status(400).json({
      success: false,
      message: 'Jenis pelanggan harus dipilih',
      code: 'CUSTOMER_TYPE_REQUIRED'
    });
  }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Format email tidak valid', code: 'INVALID_EMAIL_FORMAT' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password minimal 8 karakter', code: 'WEAK_PASSWORD' });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({ success: false, message: 'Password dan konfirmasi password tidak cocok', code: 'PASSWORD_MISMATCH' });
    }

    if (fullName.trim().length < 3 || fullName.trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Nama lengkap harus 3-100 karakter', code: 'INVALID_NAME' });
    }


    const location = await prisma.location.findUnique({
      where: {
        id: BigInt(locationId)
      }
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Wilayah tidak ditemukan",
        code: "LOCATION_NOT_FOUND"
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar.', code: 'EMAIL_ALREADY_EXISTS' });
    }

    let hashedPassword: string;
    try {
      hashedPassword = await bcrypt.hash(password, 10);
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Gagal memproses password.', code: 'HASH_ERROR' });
    }

    let newUser;
    let pelanggan;

    try {
      const result = await prisma.$transaction(async (tx) => {

        // ==========================
        // 1. Buat User
        // ==========================
        const user = await tx.user.create({
          data: {
            fullName: fullName.trim(),
            email: email.toLowerCase(),
            passwordHash: hashedPassword,
            phoneNumber: phoneNumber || null,
            role: 'WARGA',
            isActive: true,
          },
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            createdAt: true,
          },
        });

        // ==========================
        // 2. Buat Pelanggan
        // ==========================
        const pelanggan = await tx.pelanggan.create({
          data: {
            nama: fullName.trim(),
            alamat,
            jenisUsaha,
            locationId: BigInt(locationId),
            userId: user.id,
          },
        });

        return {
          user,
          pelanggan,
        };
      });

      newUser = result.user;
      pelanggan = result.pelanggan;

    } catch (error: any) {
      if (error.code === 'P2002') {
        const field = error.meta?.target?.[0];
        return res.status(409).json({
          success: false,
          message: `${field} sudah terdaftar`,
          code: 'DUPLICATE_FIELD',
        });
      }

      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Registrasi berhasil! Silakan login.",
      data: {
        id: newUser.id.toString(),
        name: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        phoneNumber: phoneNumber,
        alamat: pelanggan.alamat,
        jenisUsaha: pelanggan.jenisUsaha,
        locationId: pelanggan.locationId.toString(),
      },
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Kesalahan server.',
      code: 'INTERNAL_SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

export const verifyToken = async (req: Request, res: Response): Promise<any> => {
  console.log("\n================ VERIFY TOKEN ================");
  console.log("Method:", req.method);
  console.log("JWT_SECRET exists:", !!JWT_SECRET);

  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1] || req.cookies?.token;

    console.log("Token exists:", !!token);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak ditemukan',
        code: 'NO_TOKEN'
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET!);
    } catch (jwtError: any) {
      console.error("❌ JWT Error:", jwtError.name);
      return res.status(401).json({
        success: false,
        message: jwtError.name === 'TokenExpiredError' ? 'Token kadaluarsa' : 'Token tidak valid',
        code: jwtError.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
      });
    }

    console.log("✅ Verified:", decoded.email, decoded.role);

    return res.json({
      success: true,
      message: 'Token valid',
      user: {
        id: decoded.id,
        email: decoded.email,
        name: decoded.fullName,
        role: decoded.role,
      }
    });

  } catch (error: any) {
    console.error("❌ UNEXPECTED ERROR:", error.name, error.message);
    return res.status(500).json({
      success: false,
      message: 'Kesalahan server',
      code: 'INTERNAL_SERVER_ERROR',
      detail: error.message
    });
  }
};

export const logout = async (req: Request, res: Response): Promise<any> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log(`\n🚪 ${(decoded as any).fullName} logout`);
      } catch (e) {}
    }

    res.clearCookie('token', { path: '/' });
    return res.json({ success: true, message: 'Logout berhasil.', code: 'LOGOUT_SUCCESS' });

  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Kesalahan server', code: 'INTERNAL_SERVER_ERROR' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<any> => {
  const { userId, fullName, phoneNumber } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId harus diisi', code: 'INVALID_INPUT' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: BigInt(userId as string) },
      data: {
        ...(fullName && { fullName }),
        ...(phoneNumber !== undefined && { phoneNumber }),
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Profil berhasil diperbarui',
      data: {
        fullName: updatedUser.fullName,
        phoneNumber: updatedUser.phoneNumber,
        address: null,
        locationId: null
      }
    });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan', code: 'USER_NOT_FOUND' });
    }
    return res.status(500).json({ success: false, message: 'Gagal memperbarui profil', code: 'INTERNAL_SERVER_ERROR' });
  }
};
export const getProfile = async (req: Request, res: Response): Promise<any> => {
  try {
    // id user berasal dari JWT
    const userId = BigInt((req as any).user.id);

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        pelanggan: {
          include: {
            location: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      data: user,
    });

  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};