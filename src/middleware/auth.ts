import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// ─────────────────────────────────────────────────────────────
// Custom NextFunction Type
// ─────────────────────────────────────────────────────────────
type NextFunction = (err?: any) => void;

// ─────────────────────────────────────────────────────────────
// Authenticate Token
// ─────────────────────────────────────────────────────────────
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];

  // Format: Bearer TOKEN
  const token = authHeader && authHeader.split(' ')[1];

  // console.log('🔑 authenticateToken - Auth header:', !!authHeader, 'Token:', !!token);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token tidak ditemukan'
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'rahasia-default'
    );

    // Simpan user ke request
    (req as any).user = decoded;

    // console.log('✅ authenticateToken - Token verified, user:', {
    //   id: (decoded as any).id,
    //   email: (decoded as any).email,
    //   role: (decoded as any).role
    // });

    next();
  } catch (error) {
    // console.error('❌ authenticateToken - Token verification failed:', error);

    return res.status(403).json({
      success: false,
      error: 'Token tidak valid atau kadaluarsa'
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Authorize ADMIN
// ─────────────────────────────────────────────────────────────
export const authorizeAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = (req as any).user;

  // console.log('🔐 authorizeAdmin - User info:', { 
  //   exists: !!user, 
  //   role: user?.role,
  //   email: user?.email,
  //   id: user?.id
  // });

  if (!user || user.role !== 'ADMIN') {
    // console.log('❌ authorizeAdmin - Access denied for role:', user?.role);

    return res.status(403).json({
      success: false,
      error: 'Akses ditolak. Hanya untuk Admin.',
      userRole: user?.role
    });
  }

  // console.log('✅ authorizeAdmin - Access granted for ADMIN');

  next();
};

// ─────────────────────────────────────────────────────────────
// Authorize SUPIR / OPERATOR
// ─────────────────────────────────────────────────────────────
export const authorizeSupir = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = (req as any).user;

  if (!user || user.role !== 'OPERATOR') {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak. Hanya untuk Supir / Operator.'
    });
  }

  next();
};

// ─────────────────────────────────────────────────────────────
// Authorize KABID
// KABID hanya boleh GET + POST
// ADMIN tetap bisa akses
// ─────────────────────────────────────────────────────────────
export const authorizeKabid = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = (req as any).user;

  if (!user || (user.role !== 'KABID' && user.role !== 'ADMIN')) {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak. Hanya untuk Kepala Bidang.'
    });
  }

  // Jika role KABID → hanya boleh GET & POST
  if (
    user.role === 'KABID' &&
    !['GET', 'POST'].includes(req.method)
  ) {
    return res.status(403).json({
      success: false,
      error: 'Anda tidak memiliki izin untuk mengubah data.'
    });
  }

  next();
};

// ─────────────────────────────────────────────────────────────
// Authorize KABID Read Only
// KABID hanya boleh GET
// ADMIN tetap bisa akses
// ─────────────────────────────────────────────────────────────
export const authorizeKabidReadOnly = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = (req as any).user;

  if (!user || (user.role !== 'KABID' && user.role !== 'ADMIN')) {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak. Hanya untuk Kepala Bidang.'
    });
  }

  // Jika role KABID → hanya boleh GET
  if (user.role === 'KABID' && req.method !== 'GET') {
    return res.status(403).json({
      success: false,
      error: 'Anda hanya memiliki akses baca (read-only).'
    });
  }

  next();
};

export const authorizeRole = (roles: string[]) => {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const normalizedUserRole = String(user.role).toUpperCase();

    const normalizedRoles = roles.map((role) =>
      String(role).toUpperCase()
    );

    if (!normalizedRoles.includes(normalizedUserRole)) {
      return res.status(403).json({
        success: false,
        error: 'Akses ditolak'
      });
    }

    next();
  };
};