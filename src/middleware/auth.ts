import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// Definisikan tipe untuk NextFunction
type NextFunction = (err?: any) => void;

export const authenticateToken = (
  req: Request, 
  res: Response, 
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {    
    res.status(401).json({ 
      success: false,
      message: 'Token tidak ditemukan. Silakan login terlebih dahulu.' 
    });
    return;
  }

  try {
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'rahasia-default'
    ) as { id: string; email: string; role: string; fullName?: string };
    
    req.user = decoded;  // <-- Sekarang TypeScript tahu ini ada
    next();
  } catch (error) {
    res.status(403).json({ 
      success: false,
      message: 'Token tidak valid atau sudah kadaluarsa.' 
    });
  }
};

// Middleware untuk memeriksa role
export const authorizeRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        message: 'Unauthorized. Silakan login terlebih dahulu.' 
      });
      return;
    }

    const normalizedUserRole = String(req.user.role || '').toUpperCase();
    const normalizedAllowedRoles = roles.map((role) => String(role).toUpperCase());

    if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
      res.status(403).json({ 
        success: false,
        message: 'Akses ditolak. Anda tidak memiliki izin untuk mengakses resource ini.' 
      });
      return;
    }

    next();
  };
};