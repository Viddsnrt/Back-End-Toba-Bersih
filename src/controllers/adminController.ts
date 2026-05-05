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

// ==========================================
// BAGIAN 4: MANAJEMEN WILAYAH (LOCATION)
// ==========================================

export const getSemuaWilayah = async (req: Request, res: Response): Promise<any> => {
  try {
    const listWilayah = await prisma.location.findMany({
      orderBy: { name: 'asc' }
    });

    const formatted = listWilayah.map(w => ({
      ...w,
      id: w.id.toString()
    }));

    return res.status(200).json({ success: true, data: formatted });
  } catch (error: any) {
    console.error("ERROR FETCH WILAYAH:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 🚨 BARU: Validasi data wilayah untuk debugging masalah lokasi
export const validateWilayahData = async (req: Request, res: Response): Promise<any> => {
  try {
    const listWilayah = await prisma.location.findMany({
      orderBy: { name: 'asc' }
    });

    if (listWilayah.length === 0) {
      return res.status(200).json({
        success: true,
        message: "⚠️ Tidak ada data wilayah di database",
        data: null,
        total: 0
      });
    }

    const wilayahValid = [];
    const wilayahInvalid = [];
    const wilayahTidakAktif = [];

    console.log(`🔍 Memvalidasi ${listWilayah.length} wilayah...`);

    for (const wilayah of listWilayah) {
      const wilayahInfo = {
        id: wilayah.id.toString(),
        name: wilayah.name,
        code: wilayah.code,
        isActive: wilayah.isActive,
        latitude: wilayah.latitude,
        longitude: wilayah.longitude,
        radius: wilayah.radius,
        population: wilayah.population,
        capacityVolume: wilayah.capacityVolume
      };

      // Validasi format koordinat
      const lat = parseFloat(wilayah.latitude);
      const lon = parseFloat(wilayah.longitude);

      if (isNaN(lat) || isNaN(lon)) {
        wilayahInvalid.push({
          ...wilayahInfo,
          error: "Koordinat tidak valid"
        });
        continue;
      }

      // Validasi range koordinat (untuk Toba)
      if (lat < 2.0 || lat > 3.5 || lon < 98.5 || lon > 100.0) {
        wilayahInvalid.push({
          ...wilayahInfo,
          error: "Koordinat di luar range Kabupaten Toba"
        });
        continue;
      }

      // Validasi radius
      if (!wilayah.radius || wilayah.radius < 1000 || wilayah.radius > 50000) {
        wilayahInvalid.push({
          ...wilayahInfo,
          error: "Radius tidak valid (harus 1000-50000 meter)"
        });
        continue;
      }

      // Jika aktif, tambahkan informasi tambahan
      if (wilayah.isActive) {
        wilayahInfo.status = "VALID";

        // Hitung luas area (estimasi)
        const luasArea = Math.PI * Math.pow(wilayah.radius / 1000, 2); // dalam km²
        wilayahInfo.luasAreaKm2 = luasArea.toFixed(2);

        // Hitung estimasi populasi per km²
        if (wilayah.population && wilayah.population > 0) {
          wilayahInfo.kepadatanPopulasiPerKm2 = Math.round(wilayah.population / luasArea);
        }

        wilayahValid.push(wilayahInfo);
      } else {
        wilayahTidakAktif.push({
          ...wilayahInfo,
          status: "TIDAK AKTIF"
        });
      }
    }

    console.log(`✅ ${wilayahValid.length} wilayah valid, ${wilayahInvalid.length} tidak valid, ${wilayahTidakAktif.length} tidak aktif`);

    return res.status(200).json({
      success: true,
      message: "Validasi data wilayah selesai",
      data: {
        valid: wilayahValid,
        invalid: wilayahInvalid,
        inactive: wilayahTidakAktif,
        summary: {
          total: listWilayah.length,
          valid: wilayahValid.length,
          invalid: wilayahInvalid.length,
          inactive: wilayahTidakAktif.length,
          active: wilayahValid.length
        }
      }
    });
  } catch (error: any) {
    console.error("ERROR VALIDASI WILAYAH:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const addWilayah = async (req: Request, res: Response): Promise<any> => {
  const { name, code, population, address, capacityVolume, latitude, longitude, radius, isActive } = req.body;

  try {
    const uniqueCode = code && code.trim() !== ""
      ? code
      : `KEC-${name.toUpperCase().substring(0, 3)}-${Date.now().toString().slice(-4)}`;

    const newWilayah = await prisma.location.create({
      data: {
        name,
        code: uniqueCode,
        population: population ? parseInt(population) : null,
        address: address || "",
        capacityVolume: capacityVolume ? parseInt(capacityVolume) : null,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        radius: radius ? parseInt(radius) : 5000,
        isActive: isActive !== undefined ? isActive : true,
        locationType: 'KECAMATAN'
      }
    });

    return res.status(201).json({
      success: true,
      message: "Wilayah berhasil ditambahkan",
      data: { ...newWilayah, id: newWilayah.id.toString() }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const toggleWilayahStatus = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  try {
    const wilayah = await prisma.location.findUnique({ where: { id: BigInt(id) } });
    if (!wilayah) return res.status(404).json({ success: false, message: "Wilayah tidak ditemukan" });

    await prisma.location.update({
      where: { id: BigInt(id) },
      data: { isActive: !wilayah.isActive }
    });

    return res.status(200).json({ success: true, message: "Status wilayah berhasil diubah" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteWilayah = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  try {
    await prisma.location.delete({ where: { id: BigInt(id) } });
    return res.status(200).json({ success: true, message: "Wilayah berhasil dihapus" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// BAGIAN 5: TRACKING SUPIR (LOKASI REAL-TIME)
// ==========================================

export const getTrukAktif = async (req: Request, res: Response): Promise<any> => {
  try {
    const trukAktif = await prisma.truck.findMany({
      where: { status: 'BUSY' },
      include: {
        operator: { select: { id: true, fullName: true, phoneNumber: true } },
        tasks: {
          where: { status: { in: ['DITERIMA', 'DALAM_PERJALANAN', 'TIBA', 'BEKERJA'] } },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { status: true, location: true, district: true }
        }
      }
    });

    const formatted = trukAktif.map(truk => ({
      id: truk.id.toString(),
      plateNumber: truk.plateNumber,
      status: truk.status,
      currentLat: truk.currentLat ? Number(truk.currentLat) : null,
      currentLong: truk.currentLong ? Number(truk.currentLong) : null,
      lastPing: truk.lastPing,
      lastLocation: truk.lastLocation,
      operator: truk.operator
        ? { ...truk.operator, id: truk.operator.id.toString() }
        : null,
      taskAktif: truk.tasks[0] || null
    }));

    return res.status(200).json({ success: true, data: formatted });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getRiwayatJalur = async (req: Request, res: Response): Promise<any> => {
  const { truckId } = req.params;
  const { tanggal } = req.query;

  try {
    const startDate = tanggal
      ? new Date(`${tanggal}T00:00:00.000Z`)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const endDate = tanggal
      ? new Date(`${tanggal}T23:59:59.999Z`)
      : new Date(new Date().setHours(23, 59, 59, 999));

    const history = await prisma.locationHistory.findMany({
      where: {
        truckId: BigInt(truckId),
        createdAt: { gte: startDate, lte: endDate }
      },
      orderBy: { createdAt: 'asc' }
    });

    const truk = await prisma.truck.findUnique({
      where: { id: BigInt(truckId) },
      include: { operator: { select: { fullName: true } } }
    });

    const jalur = history.map(h => ({
      lat: Number(h.latitude),
      lng: Number(h.longitude),
      timestamp: h.createdAt
    }));

    return res.status(200).json({
      success: true,
      data: {
        truckId,
        plateNumber: truk?.plateNumber,
        operatorName: truk?.operator?.fullName,
        tanggal: tanggal || new Date().toISOString().split('T')[0],
        totalTitik: jalur.length,
        jalur
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLokasiTruk = async (req: Request, res: Response): Promise<any> => {
  const { truckId, latitude, longitude } = req.body;

  if (!truckId || !latitude || !longitude) {
    return res.status(400).json({ success: false, message: 'truckId, latitude, longitude wajib diisi' });
  }

  try {
    await prisma.truck.update({
      where: { id: BigInt(truckId) },
      data: {
        currentLat: latitude.toString(),
        currentLong: longitude.toString(),
        lastPing: new Date()
      }
    });

    await prisma.locationHistory.create({
      data: {
        truckId: BigInt(truckId),
        latitude: latitude.toString(),
        longitude: longitude.toString()
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('truck_location_update', {
        truckId: truckId.toString(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({ success: true, message: 'Lokasi berhasil diupdate' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};