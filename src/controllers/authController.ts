import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';



export const login = async (req: Request, res: Response): Promise<any> => {
  // 🔥 TAMBAHAN: Tangkap fcmToken dari request body
  const { email, password, fcmToken } = req.body;

  try {
    // STEP 1: Validate Input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email dan password harus diisi',
        code: 'INVALID_INPUT'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Format email tidak valid',
        code: 'INVALID_EMAIL_FORMAT'
      });
    }

    console.log(`\n➡️ Login attempt: ${email}`);

    // STEP 2: Find User
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
      console.log(`❌ Login failed: User not found (${email})`);
      return res.status(401).json({
        success: false,
        message: 'Email atau password tidak valid',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (!user.isActive) {
      console.log(`❌ Login failed: User inactive (${email})`);
      return res.status(403).json({
        success: false,
        message: 'Akun Anda telah dinonaktifkan. Hubungi admin.',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // STEP 3: Validate Password
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    } catch (error) {
      console.error('❌ Password comparison error:', error);
      return res.status(401).json({
        success: false,
        message: 'Email atau password tidak valid',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (!isPasswordValid) {
      console.log("❌ GAGAL: Password yang dimasukkan salah.");
      return res.status(401).json({ success: false, message: 'Password salah' });
    }

    console.log(`✅ BERHASIL: ${user.fullName} login sebagai ${user.role}`);

    // STEP 4: Generate JWT Token
    const tokenPayload = {
      id: user.id.toString(),
      email: user.email,
      role: user.role,
      fullName: user.fullName
    };

    let token: string;
    try {
      token = jwt.sign(tokenPayload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        algorithm: 'HS256'
      });
    } catch (error) {
      console.error('❌ Token generation failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Gagal generate token. Coba lagi nanti.',
        code: 'TOKEN_GENERATION_ERROR'
      });
    }

    // STEP 5: Set httpOnly Cookie
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

    console.log(`✅ Login successful: ${user.fullName} (${user.role})`);

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
    console.error('🔥 Critical error during login:', {
      message: error.message,
      email: req.body.email
    });

    return res.status(500).json({
      success: false,
      message: 'Kesalahan server. Coba lagi nanti.',
      code: 'INTERNAL_SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * ============================================================================
 * REGISTER Endpoint (Public - untuk WARGA)
 * ============================================================================
 * POST /auth/register
 * Body: { fullName: string, email: string, password: string, passwordConfirm: string }
 * Response: { success: true, message: string, data: {...} }
 */
export const register = async (req: Request, res: Response): Promise<any> => {
  const { fullName, email, password, passwordConfirm } = req.body;

  try {
    // STEP 1: Validate Input
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nama lengkap, email, dan password harus diisi',
        code: 'INVALID_INPUT'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Format email tidak valid',
        code: 'INVALID_EMAIL_FORMAT'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password minimal 8 karakter',
        code: 'WEAK_PASSWORD'
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Password dan konfirmasi password tidak cocok',
        code: 'PASSWORD_MISMATCH'
      });
    }

    if (fullName.trim().length < 3 || fullName.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Nama lengkap harus 3-100 karakter',
        code: 'INVALID_NAME'
      });
    }

    // STEP 2: Check if Email Exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email sudah terdaftar. Silakan gunakan email lain atau login.',
        code: 'EMAIL_ALREADY_EXISTS'
      });
    }

    // STEP 3: Hash Password
    let hashedPassword: string;
    try {
      hashedPassword = await bcrypt.hash(password, 10);
    } catch (error) {
      console.error('❌ Password hashing failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Gagal memproses password. Coba lagi nanti.',
        code: 'HASH_ERROR'
      });
    }

    // STEP 4: Create User
    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          fullName: fullName.trim(),
          email: email.toLowerCase(),
          passwordHash: hashedPassword,
          role: 'WARGA',
          isActive: true
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          createdAt: true
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const field = error.meta?.target?.[0];
        return res.status(409).json({
          success: false,
          message: `${field} sudah terdaftar`,
          code: 'DUPLICATE_FIELD'
        });
      }
      throw error;
    }

    console.log(`✅ Registration successful: ${newUser.fullName} (${newUser.email})`);

    return res.status(201).json({
      success: true,
      message: 'Registrasi berhasil! Silakan login dengan email dan password Anda.',
      data: {
        id: newUser.id.toString(),
        name: newUser.fullName,
        email: newUser.email,
        role: newUser.role
      }
    });

  } catch (error: any) {
    console.error('🔥 Critical error during registration:', {
      message: error.message,
      email: req.body.email
    });

    return res.status(500).json({
      success: false,
      message: 'Kesalahan server. Coba lagi nanti.',
      code: 'INTERNAL_SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * ============================================================================
 * VERIFY TOKEN Endpoint
 * ============================================================================
 * POST /auth/verify
 * Headers: Authorization: Bearer <TOKEN>
 * Response: { success: true, message: string, user: {...} }
 * 
 * Used by frontend to check if token is still valid
 */
export const verifyToken = async (req: Request, res: Response): Promise<any> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const cookieToken = (req as any).cookies?.token;

    const finalToken = token || cookieToken;

    if (!finalToken) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak ditemukan',
        code: 'NO_TOKEN'
      });
    }

    try {
      const decoded = jwt.verify(finalToken, JWT_SECRET);

      console.log(`✅ Token verified untuk: ${(decoded as any).email}`);

      return res.json({
        success: true,
        message: 'Token valid',
        user: {
          id: (decoded as any).id,
          email: (decoded as any).email,
          name: (decoded as any).fullName,
          role: (decoded as any).role,
        }
      });
    } catch (error: any) {
      let errorCode = 'INVALID_TOKEN';
      if (error.name === 'TokenExpiredError') {
        errorCode = 'TOKEN_EXPIRED';
      }

      console.error(`❌ Token verification failed: ${error.message}`);

      return res.status(401).json({
        success: false,
        message: 'Token tidak valid atau kadaluarsa',
        code: errorCode
      });
    }

  } catch (error: any) {
    console.error('❌ Verify token error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Kesalahan server',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

/**
 * ============================================================================
 * LOGOUT Endpoint
 * ============================================================================
 * POST /auth/logout
 * Headers: Authorization: Bearer <TOKEN>
 * Response: { success: true, message: string }
 * 
 * Logs user logout event and clears cookies
 */
export const logout = async (req: Request, res: Response): Promise<any> => {
  try {
    // Get user info dari token untuk logging
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log(`\n🚪 ${(decoded as any).fullName} (${(decoded as any).email}) logout sebagai ${(decoded as any).role}`);
      } catch (e) {
        // Token might be invalid, tetap lanjut logout
      }
    }

    // Clear httpOnly cookie
    res.clearCookie('token', { path: '/' });

    return res.json({
      success: true,
      message: 'Logout berhasil. Session dihapus.',
      code: 'LOGOUT_SUCCESS'
    });

  } catch (error: any) {
    console.error('❌ Logout error:', error);

    return res.status(500).json({
      success: false,
      message: 'Kesalahan server',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};