import { prisma } from "../config/db.js";
import * as XLSX from "xlsx";

// ─── Helper ────────────────────────────────────────────────────────────────

const sanitize = (p: any) => ({
  ...p,
  id: p.id.toString(),
  userId: p.userId?.toString() ?? null,
  locationId: p.locationId?.toString() ?? null,
  userName: p.user?.fullName ?? null,
});

// ─── GET PELANGGAN (with pagination + search + filter by user) ─────────────

export const getPelanggan = async (req: any, res: any) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string)  || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 12);
    const skip  = (page - 1) * limit;
    const search     = (req.query.search as string) ?? "";
    const userId     = req.query.userId as string;
    const locationId = req.query.locationId as string; // ✅ TAMBAHKAN: baca locationId dari query

    const where: any = {
      ...(userId     ? { userId: BigInt(userId) }         : {}),
      ...(locationId ? { locationId: BigInt(locationId) } : {}), // ✅ TAMBAHKAN: filter by locationId
      ...(search
        ? {
            OR: [
              { nama:       { contains: search, mode: "insensitive" } },
              { alamat:     { contains: search, mode: "insensitive" } },
              { jenisUsaha: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.pelanggan.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.pelanggan.count({ where }),
    ]);

    res.json({
      success: true,
      data: data.map(sanitize),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error("GET PELANGGAN ERROR:", err);
    res.status(500).json({ success: false, message: "Gagal ambil data pelanggan" });
  }
};

// ─── GET SINGLE ────────────────────────────────────────────────────────────

export const getPelangganById = async (req: any, res: any) => {
  try {
    const item = await prisma.pelanggan.findUnique({
      where: { id: BigInt(req.params.id) },
      include: {
        user: { select: { id: true, fullName: true } },
        location: { select: { id: true, name: true, address: true } },
      },
    });
    if (!item) return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    res.json({ success: true, data: sanitize(item) });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Gagal ambil data" });
  }
};

// ─── CREATE ────────────────────────────────────────────────────────────────

export const createPelanggan = async (req: any, res: any) => {
  try {
    const { nama, alamat, jenisUsaha, userId, locationId } = req.body;

    if (!nama?.trim()) {
      return res.status(400).json({ success: false, message: "Nama pelanggan wajib diisi" });
    }
    if (!locationId) {
      return res.status(400).json({ success: false, message: "Lokasi wajib diisi" });
    }
    // ✅ userId TIDAK wajib lagi — hanya diisi kalau pelanggan punya akun (hasil registrasi app)

    const item = await prisma.pelanggan.create({
      data: {
        nama:       nama.trim(),
        alamat:     alamat?.trim()     ?? "",
        jenisUsaha: jenisUsaha?.trim() ?? "Rumah Tangga",
        locationId: BigInt(locationId),
        ...(userId ? { userId: BigInt(userId) } : {}), // ✅ opsional
      } as any,
      include: {
        user:     { select: { id: true, fullName: true } },
        location: { select: { id: true, name: true, address: true } },
      },
    });

    res.json({ success: true, data: sanitize(item) });
  } catch (err: any) {
    console.error("CREATE PELANGGAN ERROR:", err);
    res.status(500).json({ success: false, message: "Gagal tambah pelanggan", error: err.message });
  }
};

// ─── BULK CREATE (import Excel) ────────────────────────────────────────────

export const bulkCreatePelanggan = async (req: any, res: any) => {
  try {
    const { pelanggan, locationId } = req.body;

    if (!Array.isArray(pelanggan) || pelanggan.length === 0) {
      return res.status(400).json({ success: false, message: "Data tidak valid atau kosong" });
    }
    // ✅ Naikkan batas karena sekarang pakai bulk insert (jauh lebih cepat)
    if (pelanggan.length > 5000) {
      return res.status(400).json({ success: false, message: "Maksimal 5000 baris per import" });
    }

    const results: { nama: string; status: string; message: string }[] = [];
    let successCount = 0;
    let errorCount   = 0;

    // 1️⃣ Pisahkan dulu baris yang nama-nya kosong
    const validRows = pelanggan.filter((row: any) => {
      if (!row.nama?.trim()) {
        results.push({ nama: row.nama || "kosong", status: "error", message: "Nama wajib diisi" });
        errorCount++;
        return false;
      }
      return true;
    });

    // 2️⃣ Ambil SEMUA data existing sekali saja (bukan per baris) untuk cek duplikat
    const existing = await prisma.pelanggan.findMany({
      where: locationId ? { locationId: BigInt(locationId) } : {},
      select: { nama: true, alamat: true },
    });
    const existingKeys = new Set(
      existing.map((p) => `${p.nama.trim()}|||${(p.alamat ?? "").trim()}`),
    );

    // 3️⃣ Pisahkan yang duplikat vs yang siap di-insert, dan buang duplikat DALAM file itu sendiri juga
    const seenInFile = new Set<string>();
    const toInsert: any[] = [];

    for (const row of validRows) {
      const nama = row.nama.trim();
      const alamat = row.alamat?.trim() ?? "";
      const key = `${nama}|||${alamat}`;

      if (existingKeys.has(key) || seenInFile.has(key)) {
        results.push({ nama, status: "error", message: "Data sudah ada (duplikat)" });
        errorCount++;
        continue;
      }

      seenInFile.add(key);
      toInsert.push({
        nama,
        alamat,
        jenisUsaha: row.jenisUsaha?.trim() ?? "Rumah Tangga",
        ...(locationId ? { locationId: BigInt(locationId) } : {}),
      });
    }

    // 4️⃣ Insert semua sekaligus dalam SATU query
    if (toInsert.length > 0) {
      await prisma.pelanggan.createMany({ data: toInsert });
      toInsert.forEach((row) => {
        results.push({ nama: row.nama, status: "success", message: "Berhasil didaftarkan" });
        successCount++;
      });
    }

    res.json({
      success: true,
      message: `Import selesai: ${successCount} berhasil, ${errorCount} gagal`,
      summary: { total: pelanggan.length, success: successCount, error: errorCount },
      results,
    });
  } catch (err: any) {
    console.error("BULK CREATE ERROR:", err);
    res.status(500).json({ success: false, message: "Gagal import data", error: err.message });
  }
};

// ─── UPDATE ────────────────────────────────────────────────────────────────

export const updatePelanggan = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { nama, alamat, jenisUsaha, userId, locationId } = req.body;

    const existing = await prisma.pelanggan.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return res.status(404).json({ success: false, message: "Pelanggan tidak ditemukan" });

    const item = await prisma.pelanggan.update({
      where: { id: BigInt(id) },
      data: {
        nama:       nama?.trim()       ?? existing.nama,
        alamat:     alamat?.trim()     ?? existing.alamat,
        jenisUsaha: jenisUsaha?.trim() ?? existing.jenisUsaha,
        userId:     userId     ? BigInt(userId)     : existing.userId,
        locationId: locationId ? BigInt(locationId) : existing.locationId,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        location: { select: { id: true, name: true, address: true } },
      },
    });

    res.json({ success: true, data: sanitize(item) });
  } catch (err: any) {
    console.error("UPDATE PELANGGAN ERROR:", err);
    res.status(500).json({ success: false, message: "Gagal update pelanggan", error: err.message });
  }
};

// ─── DELETE ────────────────────────────────────────────────────────────────

export const deletePelanggan = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const existing = await prisma.pelanggan.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return res.status(404).json({ success: false, message: "Pelanggan tidak ditemukan" });

    await prisma.pelanggan.delete({ where: { id: BigInt(id) } });
    res.json({ success: true, message: "Pelanggan berhasil dihapus" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Gagal hapus pelanggan", error: err.message });
  }
};

// ─── Helper: build worksheet ───────────────────────────────────────────────

const buildWorksheet = (rows: any[]) => {
  const data = rows.map((p, i) => ({
    No:               i + 1,
    "Nama Pelanggan": p.nama,
    Alamat:           p.alamat      || "",
    "Jenis Usaha":    p.jenisUsaha  || "Rumah Tangga",
    "User":           p.user?.fullName || "-",
    "Lokasi":         p.location?.name || "-",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  // ✅ Tambah 1 kolom untuk Lokasi
  ws["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 32 }, { wch: 20 }, { wch: 22 }, { wch: 22 }];
  return ws;
};

// ─── EXPORT ALL ───────────────────────────────────────────────────────────

export const exportPelanggan = async (_req: any, res: any) => {
  try {
    const all = await prisma.pelanggan.findMany({
      include: {
        user: { select: { id: true, fullName: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildWorksheet(all), "Semua Pelanggan");

    const byLocation = all.reduce<Record<string, any[]>>((acc, p) => {
      const key = p.location?.name ?? "Tanpa Lokasi";
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    for (const [locationName, list] of Object.entries(byLocation)) {
      XLSX.utils.book_append_sheet(wb, buildWorksheet(list), `Lokasi ${locationName}`.slice(0, 31));
    }

    const buffer   = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const filename = `pelanggan_retribusi_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Gagal export data", error: err.message });
  }
};

// ✅ Ganti exportPelangganByDriver → exportPelangganByLocation
export const exportPelangganByLocation = async (req: any, res: any) => {
  try {
    const { locationId } = req.params;

    const location = await prisma.location.findUnique({
      where: { id: BigInt(locationId) },
      select: { name: true },
    });
    if (!location) return res.status(404).json({ success: false, message: "Lokasi tidak ditemukan" });

    const list = await prisma.pelanggan.findMany({
      where:   { locationId: BigInt(locationId) },
      include: {
        user: { select: { id: true, fullName: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildWorksheet(list), `Lokasi ${location.name}`.slice(0, 31));

    const buffer      = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const locationSlug = location.name.toLowerCase().replace(/\s+/g, "_");
    const filename    = `pelanggan_${locationSlug}_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Gagal export data lokasi", error: err.message });
  }
};