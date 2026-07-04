import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import * as bcrypt from 'bcrypt';

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
      data: { ...result, id: result.id.toString() }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSemuaSupir = async (req: Request, res: Response): Promise<any> => {
  try {
    const supirList = await prisma.user.findMany({
      where: { role: 'OPERATOR' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        isActive: true,
        tasks: {
          where: { status: { not: 'SELESAI' } },
          select: { id: true }
        }
      }
    });

    const formattedSupir = supirList.map(supir => ({
      id: supir.id.toString(),
      fullName: supir.fullName,
      email: supir.email,
      phoneNumber: supir.phoneNumber,
      isActive: supir.isActive,
      isAssigned: supir.tasks.length > 0
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
    const existingSupir = await prisma.user.findUnique({
      where: { id: BigInt(id as string) },
      include: {
        tasks: {
          where: { status: { not: 'SELESAI' } },
          select: { id: true }
        }
      }
    });

    if (!existingSupir) {
      return res.status(404).json({ success: false, message: "Supir tidak ditemukan" });
    }

    // FIX: Cegah nonaktifkan supir yang masih punya tugas aktif
    if (isActive === false && existingSupir.tasks.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Supir tidak dapat dinonaktifkan karena masih memiliki tugas aktif. Selesaikan semua tugas terlebih dahulu."
      });
    }

    if (email && email !== existingSupir.email) {
      const emailTerpakai = await prisma.user.findUnique({ where: { email } });
      if (emailTerpakai) {
        return res.status(400).json({ success: false, message: "Email sudah terdaftar di sistem" });
      }
    }

    // FIX: Deteksi perubahan di backend juga untuk keamanan
    const hasChanges =
      (fullName !== undefined && fullName !== existingSupir.fullName) ||
      (email !== undefined && email !== existingSupir.email) ||
      (phoneNumber !== undefined && phoneNumber !== existingSupir.phoneNumber) ||
      (isActive !== undefined && isActive !== existingSupir.isActive) ||
      (password && password.trim() !== "");

    if (!hasChanges) {
      return res.status(200).json({
        success: true,
        message: "Tidak ada perubahan data",
        data: { ...existingSupir, id: existingSupir.id.toString() }
      });
    }

    const dataUpdate: any = {};
    if (fullName !== undefined) dataUpdate.fullName = fullName;
    if (email !== undefined) dataUpdate.email = email;
    if (phoneNumber !== undefined) dataUpdate.phoneNumber = phoneNumber;
    if (isActive !== undefined) dataUpdate.isActive = isActive;

    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      dataUpdate.passwordHash = await bcrypt.hash(password, salt);
    }

    const supirDiupdate = await prisma.user.update({
      where: { id: BigInt(id as string) },
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
    const activeTask = await prisma.task.findFirst({
      where: {
        driverId: BigInt(id as string),
        status: { not: 'SELESAI' }
      }
    });

    if (activeTask) {
      return res.status(400).json({
        success: false,
        message: "Gagal menghapus! Supir ini masih memiliki tugas aktif dan tidak dapat dihapus."
      });
    }

    await prisma.user.delete({
      where: { id: BigInt(id as string) }
    });

    return res.status(200).json({ success: true, message: "Supir berhasil dihapus" });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({
        success: false,
        message: "Gagal menghapus! Supir ini tidak bisa dihapus karena masih terikat dengan riwayat tugas atau data terkait."
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
      where: { id: BigInt(idLaporan as string) },
      data: { status: 'DITINDAKLANJUTI' }
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

    // ── NEW: Self-heal status truk yang sudah lewat jadwal tapi masih tercatat BUSY ──
    const correctionPromises: Promise<any>[] = [];

    const formattedTruk = await Promise.all(
      trukList.map(async (truk) => {
        let effectiveStatus = truk.status;

        if (truk.status === 'BUSY') {
          const { activeTask, isOverdue } = await getTruckActiveTaskInfo(truk.id);
          if (isOverdue || !activeTask) {
            // Tidak ada tugas aktif yang sah, atau sudah lewat jadwal → seharusnya AVAILABLE
            effectiveStatus = 'AVAILABLE';
            correctionPromises.push(
              prisma.truck.update({ where: { id: truk.id }, data: { status: 'AVAILABLE' } })
            );
          }
        }

        return {
          ...truk,
          id: truk.id.toString(),
          status: effectiveStatus,
          operatorId: truk.operatorId ? truk.operatorId.toString() : null,
          operator: truk.operator ? { ...truk.operator, id: truk.operator.id.toString() } : null,
          // lastLocation: truk.lastLocation ?? null
        };
      })
    );

    // Simpan koreksi ke DB di background, tidak perlu ditunggu response-nya
    if (correctionPromises.length > 0) {
      Promise.all(correctionPromises).catch((err) =>
        console.error('Gagal melakukan auto-correction status truk:', err)
      );
    }

    return res.status(200).json({ success: true, data: formattedTruk });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: `Gagal mengambil data truk: ${error.message}` });
  }
};

export const addTruk = async (req: Request, res: Response): Promise<any> => {
  // FIX: Tidak terima 'status' dari body saat create — selalu AVAILABLE
  const { plateNumber, operatorId, unitCode, brand, truckType } = req.body;

  try {
    const existingTruk = await prisma.truck.findUnique({ where: { plateNumber } });
    if (existingTruk) {
      return res.status(400).json({ success: false, message: "Plat nomor ini sudah terdaftar!" });
    }

    // FIX: Enforce 1-to-1 — cek apakah supir ini sudah punya truk
    if (operatorId) {
      const existingTrukForOperator = await prisma.truck.findFirst({
        where: { operatorId: BigInt(operatorId as string) }
      });
      if (existingTrukForOperator) {
        return res.status(400).json({
          success: false,
          message: "Supir ini sudah memiliki truk yang terdaftar. Satu supir hanya dapat mengelola satu armada."
        });
      }
    }

    await prisma.truck.create({
      data: {
        plateNumber,
        unitCode,
        brand,
        truckType,
        status: 'AVAILABLE', 
        operatorId: operatorId ? BigInt(operatorId as string) : null
      }
    });

    return res.status(201).json({ success: true, message: "Truk berhasil didaftarkan" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateTruk = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { plateNumber, operatorId, status, unitCode, brand, truckType } = req.body;

  try {
    const truckId = BigInt(id as string);
    const existingTruk = await prisma.truck.findUnique({ where: { id: truckId } });

    if (!existingTruk) {
      return res.status(404).json({ success: false, message: "Truk tidak ditemukan" });
    }

    // FIX: Enforce 1-to-1 — cek supir baru tidak sudah punya truk lain
    if (operatorId && BigInt(operatorId) !== existingTruk.operatorId) {
      const existingTrukForOperator = await prisma.truck.findFirst({
        where: {
          operatorId: BigInt(operatorId as string),
          id: { not: truckId }
        }
      });
      if (existingTrukForOperator) {
        return res.status(400).json({
          success: false,
          message: "Supir ini sudah memiliki truk yang terdaftar. Satu supir hanya dapat mengelola satu armada."
        });
      }
    }

    // ── NEW: Cek apakah truk ini punya tugas aktif & apakah sudah lewat jadwal ──
    const { activeTask, isOverdue } = await getTruckActiveTaskInfo(truckId);

    let finalStatus = status;

    if (activeTask && !isOverdue) {
      // Truk benar-benar sedang bertugas (belum lewat jadwal) → status TIDAK BOLEH diubah manual
      if (status !== undefined && status !== existingTruk.status) {
        return res.status(400).json({
          success: false,
          message: "Armada sedang bertugas dan tidak dapat diubah statusnya. Selesaikan tugas terlebih dahulu."
        });
      }
      finalStatus = existingTruk.status; // paksa tetap sama
    }

    if (activeTask && isOverdue) {
      // Tugas sudah lewat jadwal tapi belum selesai → truk otomatis dianggap tersedia
      finalStatus = 'AVAILABLE';
    }

    // FIX: Deteksi perubahan di backend (gunakan finalStatus, bukan status mentah)
    const newOperatorId = operatorId ? BigInt(operatorId as string) : null;
    const hasChanges =
      (plateNumber !== undefined && plateNumber !== existingTruk.plateNumber) ||
      (unitCode !== undefined && unitCode !== existingTruk.unitCode) ||
      (brand !== undefined && brand !== existingTruk.brand) ||
      (truckType !== undefined && truckType !== existingTruk.truckType) ||
      (finalStatus !== undefined && finalStatus !== existingTruk.status) ||
      (newOperatorId?.toString() !== existingTruk.operatorId?.toString());

    if (!hasChanges) {
      return res.status(200).json({
        success: true,
        message: "Tidak ada perubahan data"
      });
    }

    await prisma.truck.update({
      where: { id: truckId },
      data: {
        plateNumber,
        unitCode,
        brand,
        truckType,
        status: finalStatus,
        operatorId: operatorId ? BigInt(operatorId as string) : null
      }
    });

    return res.status(200).json({
      success: true,
      message: isOverdue
        ? "Data truk diperbarui. Status otomatis diset 'Tersedia' karena tugas sebelumnya sudah lewat jadwal."
        : "Data truk berhasil diperbarui"
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteTruk = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  try {
    await prisma.truck.delete({ where: { id: BigInt(id as string) } });
    return res.status(200).json({ success: true, message: "Truk berhasil dihapus" });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ success: false, message: "Truk tidak bisa dihapus karena masih terikat riwayat tugas!" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getTruckActiveTaskInfo = async (truckId: bigint) => {
  const activeTask = await prisma.task.findFirst({
    where: { truckId, status: { not: 'SELESAI' } }, // FIX: 'DITOLAK' bukan TaskStatus yang valid
    orderBy: { scheduledAt: 'desc' },
  });

  if (!activeTask) return { activeTask: null, isOverdue: false };

  const isOverdue =
    activeTask.status !== 'BEKERJA' &&
    !!activeTask.scheduledAt &&
    new Date() > new Date(activeTask.scheduledAt);

  return { activeTask, isOverdue };
};