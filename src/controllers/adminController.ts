import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import * as bcrypt from 'bcrypt';

// ═════════════════════════════════════════════════════════════
// BUAT AKUN KABID
// POST /api/admin/kabid
// ═════════════════════════════════════════════════════════════
export const createKabid = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    // Debug logging
    console.log('📨 createKabid - Request body:', req.body);
    console.log('📨 createKabid - Request headers:', { 
      contentType: req.headers['content-type'],
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : []
    });

    const {
      email,
      fullName,
      password,
      phoneNumber
    } = req.body || {};

    // Validasi
    if (!email || !fullName || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, nama lengkap, dan password wajib diisi',
        received: { email, fullName, password }
      });
    }

    // Cek email
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email sudah terdaftar'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Buat akun KABID
    const newKabid = await prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        phoneNumber: phoneNumber || null,
        role: 'KABID',
        isActive: true
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Akun Kepala Bidang berhasil dibuat',
      data: {
        ...newKabid,
        id: newKabid.id.toString()
      }
    });

  } catch (error: any) {
    console.error('❌ createKabid:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal membuat akun Kepala Bidang',
      error: error.message
    });
  }
};

// ═════════════════════════════════════════════════════════════
// GET ALL KABID
// GET /api/admin/kabid
// ═════════════════════════════════════════════════════════════
export const getAllKabid = async (
  _req: Request,
  res: Response
): Promise<any> => {
  try {
    const kabidList = await prisma.user.findMany({
      where: {
        role: 'KABID'
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        isActive: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const formatted = kabidList.map((item) => ({
      ...item,
      id: item.id.toString()
    }));

    return res.json({
      success: true,
      data: formatted
    });

  } catch (error: any) {
    console.error('❌ getAllKabid:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar Kepala Bidang'
    });
  }
};

// ═════════════════════════════════════════════════════════════
// UPDATE KABID
// PUT /api/admin/kabid/:id
// ═════════════════════════════════════════════════════════════
export const updateKabid = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.params;

    const {
      fullName,
      phoneNumber,
      isActive,
      newPassword
    } = req.body;

    // Cari akun
    const kabid = await prisma.user.findFirst({
      where: {
        id: BigInt(id),
        role: 'KABID'
      }
    });

    if (!kabid) {
      return res.status(404).json({
        success: false,
        message: 'Akun Kepala Bidang tidak ditemukan'
      });
    }

    const updateData: any = {};

    if (fullName !== undefined) {
      updateData.fullName = fullName;
    }

    if (phoneNumber !== undefined) {
      updateData.phoneNumber = phoneNumber;
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    // Reset password
    if (newPassword) {
      updateData.passwordHash = await bcrypt.hash(
        newPassword,
        10
      );
    }

    // Update data
    const updated = await prisma.user.update({
      where: {
        id: BigInt(id)
      },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        isActive: true,
        role: true
      }
    });

    return res.json({
      success: true,
      message: 'Akun Kepala Bidang berhasil diperbarui',
      data: {
        ...updated,
        id: updated.id.toString()
      }
    });

  } catch (error: any) {
    console.error('❌ updateKabid:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui akun Kepala Bidang'
    });
  }
};

// ═════════════════════════════════════════════════════════════
// DELETE / NONAKTIFKAN KABID
// DELETE /api/admin/kabid/:id
// ═════════════════════════════════════════════════════════════
export const deleteKabid = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.params;

    // Cari akun
    const kabid = await prisma.user.findFirst({
      where: {
        id: BigInt(id),
        role: 'KABID'
      }
    });

    if (!kabid) {
      return res.status(404).json({
        success: false,
        message: 'Akun Kepala Bidang tidak ditemukan'
      });
    }

    // Soft delete
    await prisma.user.update({
      where: {
        id: BigInt(id)
      },
      data: {
        isActive: false
      }
    });

    return res.json({
      success: true,
      message: 'Akun Kepala Bidang berhasil dinonaktifkan'
    });

  } catch (error: any) {
    console.error('❌ deleteKabid:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal menonaktifkan akun Kepala Bidang'
    });
  }
};


// ==========================================
// BAGIAN 1: MANAJEMEN SUPIR (OPERATOR)
// ==========================================

export const addOperator = async (req: Request, res: Response): Promise<any> => {
  const { email, password, fullName, phoneNumber } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email sudah terdaftar di sistem" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const supirBaru = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phoneNumber,
        role: 'OPERATOR',
        isActive: true
      }
    });

    const { passwordHash: _, ...result } = supirBaru;

    res.status(201).json({
      success: true,
      message: "Akun Supir (Operator) berhasil dibuat oleh Admin",
      data: {
        ...result,
        id: result.id.toString()
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSemuaSupir = async (req: Request, res: Response): Promise<any> => {
  try {
    const supirList = await prisma.user.findMany({
      where: { role: 'OPERATOR' },
      select: { id: true, fullName: true, email: true, phoneNumber: true, isActive: true }
    });

    const formattedSupir = supirList.map(supir => ({
      ...supir,
      id: supir.id.toString()
    }));

    return res.status(200).json({ success: true, data: formattedSupir });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: `Gagal mengambil data supir: ${error.message}` });
  }
};

export const updateOperator = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { email, password, fullName, phoneNumber, isActive } = req.body;

  try {
    const existingSupir = await prisma.user.findUnique({ where: { id: BigInt(id) } });
    if (!existingSupir) {
      return res.status(404).json({ success: false, message: "Supir tidak ditemukan" });
    }

    if (email && email !== existingSupir.email) {
      const emailTerpakai = await prisma.user.findUnique({ where: { email } });
      if (emailTerpakai) {
        return res.status(400).json({ success: false, message: "Email sudah terdaftar di sistem" });
      }
    }

    const dataUpdate: any = {
      fullName,
      email,
      phoneNumber,
      isActive
    };

    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      dataUpdate.passwordHash = await bcrypt.hash(password, salt);
    }

    const supirDiupdate = await prisma.user.update({
      where: { id: BigInt(id) },
      data: dataUpdate
    });

    const { passwordHash: _, ...result } = supirDiupdate;

    return res.status(200).json({
      success: true,
      message: "Data supir berhasil diperbarui",
      data: { ...result, id: result.id.toString() }
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteOperator = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;

  try {
    await prisma.user.delete({
      where: { id: BigInt(id) }
    });

    return res.status(200).json({ success: true, message: "Supir berhasil dihapus" });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({
        success: false,
        message: "Gagal menghapus! Supir ini tidak bisa dihapus karena masih terikat dengan riwayat tugas/laporan atau truk."
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// BAGIAN 2: MANAJEMEN PENUGASAN
// ==========================================

export const tugaskanLaporan = async (req: Request, res: Response): Promise<any> => {
  const { idLaporan } = req.params;
  const { idSupir } = req.body;

  if (!idLaporan || !idSupir) {
    return res.status(400).json({ success: false, message: "ID Laporan dan ID Supir wajib diisi!" });
  }

  try {
    await prisma.report.update({
      where: { id: BigInt(idLaporan) },
      data: {
        status: 'DITINDAKLANJUTI',
      }
    });

    return res.status(200).json({
      success: true,
      message: "Berhasil! Laporan telah ditugaskan ke Supir."
    });
  } catch (error: any) {
    console.error("ERROR TUGASKAN LAPORAN:", error);
    return res.status(500).json({ success: false, message: `Gagal menugaskan laporan: ${error.message}` });
  }
};

// ==========================================
// BAGIAN 3: MANAJEMEN ARMADA (TRUK)
// ==========================================

export const getSemuaTruk = async (req: Request, res: Response): Promise<any> => {
  try {
    const trukList = await prisma.truck.findMany({
      include: {
        operator: { select: { id: true, fullName: true, phoneNumber: true } }
      }
    });

    const formattedTruk = trukList.map(truk => ({
      ...truk,
      id: truk.id.toString(),
      operatorId: truk.operatorId ? truk.operatorId.toString() : null,
      operator: truk.operator ? { ...truk.operator, id: truk.operator.id.toString() } : null
    }));

    return res.status(200).json({ success: true, data: formattedTruk });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: `Gagal mengambil data truk: ${error.message}` });
  }
};

export const addTruk = async (req: Request, res: Response): Promise<any> => {
  const { plateNumber, operatorId, status, lastLocation, unitCode, brand, truckType } = req.body;
  try {
    const existingTruk = await prisma.truck.findUnique({ where: { plateNumber } });
    if (existingTruk) return res.status(400).json({ success: false, message: "Plat nomor ini sudah terdaftar!" });

await prisma.truck.create({
  data: {
    plateNumber,
    unitCode,
    brand,
    truckType,
    status: status || 'AVAILABLE',
    lastLocation: lastLocation || '',
    operatorId: operatorId ? BigInt(operatorId) : null
  }
});

    return res.status(201).json({ success: true, message: "Truk berhasil didaftarkan" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateTruk = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { plateNumber, operatorId, status, lastLocation } = req.body;
  try {
    await prisma.truck.update({
      where: { id: BigInt(id) },
      data: {
        plateNumber,
        status,
        lastLocation,
        operatorId: operatorId ? BigInt(operatorId) : null
      }
    });
    return res.status(200).json({ success: true, message: "Data truk berhasil diperbarui" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteTruk = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  try {
    await prisma.truck.delete({ where: { id: BigInt(id) } });
    return res.status(200).json({ success: true, message: "Truk berhasil dihapus" });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ success: false, message: "Truk tidak bisa dihapus karena masih terikat riwayat tugas!" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};