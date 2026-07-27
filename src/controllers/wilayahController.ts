import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { Prisma } from '@prisma/client';
import * as turf from '@turf/turf';

// --- UTILS / HELPER FUNCTIONS ---

const parseOptionalInt = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseOptionalFloat = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? null : parsed;
};

const isLatitudeValid = (latitude: number): boolean => latitude >= -90 && latitude <= 90;
const isLongitudeValid = (longitude: number): boolean => longitude >= -180 && longitude <= 180;

const parseOptionalBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
};

const normalizeIncomingBoundary = (val: unknown): any | null => {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val ?? null;
};

const toBigIntParam = (value: string | string[] | undefined): bigint => {
  const val = Array.isArray(value) ? value[0] : value;
  if (!val || isNaN(Number(val))) {
    throw new Error('ID tidak valid');
  }
  return BigInt(val);
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isPointInBoundary = (lat: number, lon: number, boundaryGeoJson: any): boolean => {
  const feature = normalizeBoundary(boundaryGeoJson);
  if (!feature) return false; // termasuk kasus geojson corrupt/string/FeatureCollection kosong

  try {
    const point = turf.point([lon, lat]); // GeoJSON: urutan [lon, lat], BUKAN [lat, lon]
    return turf.booleanPointInPolygon(point, feature as any);
  } catch (err) {
    console.error('Error checking point in boundary:', err);
    return false; // kalau geojson corrupt/invalid, jangan crash — biar caller fallback ke radius
  }
};

const calculateAreaKm2 = (radius: number | null, boundaryGeoJson?: any): number => {
  const feature = normalizeBoundary(boundaryGeoJson);
  if (feature) {
    try {
      const areaM2 = turf.area(feature as any);
      if (areaM2 > 0) return areaM2 / 1_000_000; // m² → km²
    } catch (err) {
      console.error('Error calculating polygon area, fallback ke radius:', err);
    }
  }
  if (!radius || radius <= 0) return 0;
  const radiusInKm = radius / 1000;
  return Math.PI * radiusInKm * radiusInKm;
};
// --- CONTROLLERS ---

export const getAllWilayah = async (req: Request, res: Response) => {
  try {
    const wilayah = await prisma.location.findMany({
      orderBy: { name: 'asc' }
    });

    const formatted = wilayah.map(w => ({
      id: w.id.toString(),
      name: w.name,
      code: w.code,
      isActive: w.isActive,
      address: w.address,
      latitude: w.latitude.toString(),
      longitude: w.longitude.toString(),
      radius: w.radius,
      boundaryGeoJson: w.boundaryGeoJson, // ← BARU: null kalau kecamatan ini belum punya poligon
      area: calculateAreaKm2(w.radius, w.boundaryGeoJson), // ← BARU: luas akurat kalau ada poligon
      center: [Number(w.latitude), Number(w.longitude)],
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching wilayah:', error);
    res.status(500).json({ error: 'Gagal mengambil data wilayah' });
  }
};

export const getWilayahById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const wilayah = await prisma.location.findUnique({
      where: { id: toBigIntParam(id) }
    });

    if (!wilayah) return res.status(404).json({ error: 'Wilayah tidak ditemukan' });

    res.json({
      id: wilayah.id.toString(),
      name: wilayah.name,
      code: wilayah.code,
      isActive: wilayah.isActive,
      population: null,        // ✅ Fix
      address: wilayah.address,
      capacityVolume: null,    // ✅ Fix
      latitude: wilayah.latitude.toString(),
      longitude: wilayah.longitude.toString(),
      radius: wilayah.radius,
      boundaryGeoJson: wilayah.boundaryGeoJson, // ← BARU
      area: calculateAreaKm2(wilayah.radius, wilayah.boundaryGeoJson), // ← BARU
      center: [Number(wilayah.latitude), Number(wilayah.longitude)],
      createdAt: wilayah.createdAt,
      updatedAt: wilayah.updatedAt
    });
  } catch (error) {
    console.error('Error fetching wilayah by ID:', error);
    res.status(500).json({ error: 'ID tidak valid atau data tidak ditemukan' });
  }
};

const generateNameFromAddress = (address: string): string => {
  if (!address) return 'Wilayah Tidak Diketahui';
  const addressParts = address.split(',');
  const firstPart = addressParts[0]?.trim();
  const keywords = ['kecamatan', 'kelurahan', 'desa', 'kota', 'camatan'];
  for (const keyword of keywords) {
    const index = firstPart.toLowerCase().indexOf(keyword);
    if (index !== -1) {
      return firstPart.substring(index + keyword.length).trim();
    }
  }
  const villageMatch = firstPart.match(/(kelurahan|desa)\s+([^\d\s]+)/i);
  if (villageMatch) return villageMatch[2].trim();
  return firstPart.length > 50 ? firstPart.substring(0, 50) + '...' : firstPart;
};

export const createWilayah = async (req: Request, res: Response) => {
  try {
const {
  name, code, address,
  latitude, longitude, isActive, radius,
  boundaryGeoJson: rawBoundaryGeoJson
} = req.body;

let boundaryGeoJson = rawBoundaryGeoJson;
if (typeof boundaryGeoJson === 'string') {
  try { boundaryGeoJson = JSON.parse(boundaryGeoJson); } catch { boundaryGeoJson = null; }
}

    let finalName = name;
    if (!finalName && address) {
      finalName = generateNameFromAddress(address);
    } else if (!finalName) {
      finalName = `Wilayah ${new Date().toLocaleDateString('id-ID')}`;
    }

    const normalizedName = typeof finalName === 'string' ? finalName.trim() : finalName;
    if (!normalizedName) return res.status(400).json({ error: 'Nama wilayah harus diisi' });

    const pLat = parseOptionalFloat(latitude);
    const pLon = parseOptionalFloat(longitude);

    if (pLat === null || pLon === null || !isLatitudeValid(pLat) || !isLongitudeValid(pLon)) {
      return res.status(400).json({ error: 'Koordinat tidak valid' });
    }
    if (pLat === 0 && pLon === 0) {
      return res.status(400).json({ error: 'Koordinat wilayah tidak valid (0,0)' });
    }

    const newWilayah = await prisma.location.create({
      data: {
        name: normalizedName,
        code: code?.trim() || null,
        address: address || null,
        latitude: pLat,
        longitude: pLon,
        radius: parseOptionalInt(radius) || 5000,
        boundaryGeoJson: boundaryGeoJson ?? Prisma.JsonNull, // ← BARU: null kalau tidak ada poligon
        isActive: parseOptionalBoolean(isActive, true)
      }
    });

    res.status(201).json({
      ...newWilayah,
      id: newWilayah.id.toString(),
      latitude: newWilayah.latitude.toString(),
      longitude: newWilayah.longitude.toString(),
      center: [Number(newWilayah.latitude), Number(newWilayah.longitude)]
    });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return res.status(400).json({ error: 'Kode wilayah sudah digunakan' });
    }
    console.error('Error creating wilayah:', error);
    res.status(500).json({ error: 'Gagal menambah wilayah' });
  }
};

export const updateWilayah = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const existingWilayah = await prisma.location.findUnique({
      where: { id: toBigIntParam(id) }
    });
    if (!existingWilayah) return res.status(404).json({ error: 'Wilayah tidak ditemukan' });

    const pLat = parseOptionalFloat(data.latitude);
    const pLon = parseOptionalFloat(data.longitude);

    if (pLat !== null && !isLatitudeValid(pLat)) return res.status(400).json({ error: 'Latitude tidak valid' });
    if (pLon !== null && !isLongitudeValid(pLon)) return res.status(400).json({ error: 'Longitude tidak valid' });
    if (pLat === 0 && pLon === 0) return res.status(400).json({ error: 'Koordinat tidak valid (0,0)' });

    const updated = await prisma.location.update({
      where: { id: toBigIntParam(id) },
      data: {
        name: data.name?.trim() || undefined,
        code: data.code !== undefined ? data.code?.trim() : undefined,
        address: data.address !== undefined ? data.address : undefined,
        latitude: pLat ?? undefined,
        longitude: pLon ?? undefined,
        radius: parseOptionalInt(data.radius) ?? undefined,
        

        
        // 🔥 BARU: kalau field dikirim (termasuk null untuk hapus poligon), update; kalau tidak dikirim sama sekali, biarkan
        boundaryGeoJson: data.boundaryGeoJson !== undefined
        ? normalizeIncomingBoundary(data.boundaryGeoJson) ?? Prisma.JsonNull
        : undefined,
        isActive: data.isActive !== undefined
          ? parseOptionalBoolean(data.isActive, existingWilayah.isActive)
          : undefined,
      }
    });

    res.json({
      ...updated,
      id: updated.id.toString(),
      latitude: updated.latitude.toString(),
      longitude: updated.longitude.toString(),
      center: [Number(updated.latitude), Number(updated.longitude)]
    });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return res.status(400).json({ error: 'Kode wilayah sudah digunakan' });
    }
    console.error('Error updating wilayah:', error);
    res.status(500).json({ error: 'Gagal memperbarui wilayah' });
  }
};

export const deleteWilayah = async (req: Request, res: Response) => {
  try {
    const id = toBigIntParam(req.params.id);

    const [pelangganCount, routeCount] = await Promise.all([
      prisma.pelanggan.count({ where: { locationId: id } }),
      prisma.routeTemplate.count({ where: { locationId: id } }),
    ]);

    if (pelangganCount > 0 || routeCount > 0) {
      const detail: string[] = [];
      if (pelangganCount > 0) detail.push(`${pelangganCount} pelanggan`);
      if (routeCount > 0) detail.push(`${routeCount} rute (jadwal truk)`);
      return res.status(409).json({
        error: `Wilayah tidak dapat dihapus karena masih dipakai oleh ${detail.join(' dan ')}. Hapus/pindahkan data tersebut terlebih dahulu.`
      });
    }

    await prisma.location.delete({ where: { id } });
    res.json({ message: 'Wilayah berhasil dihapus' });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      console.error('FK constraint saat hapus wilayah:', error.meta);
      return res.status(409).json({
        error: `Wilayah tidak dapat dihapus, masih terkait relasi lain (${error.meta?.field_name ?? 'tidak diketahui'}).`
      });
    }
    console.error('Error deleting wilayah:', error);
    res.status(500).json({ error: 'Gagal menghapus wilayah karena kesalahan server.' });
  }
};

export const toggleWilayahStatus = async (req: Request, res: Response) => {
  try {
    const id = toBigIntParam(req.params.id);
    const current = await prisma.location.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Wilayah tidak ditemukan' });

    const updated = await prisma.location.update({
      where: { id },
      data: { isActive: !current.isActive }
    });
    res.json({ id: updated.id.toString(), isActive: updated.isActive });
  } catch (error) {
    console.error('Error toggling status:', error);
    res.status(500).json({ error: 'Gagal mengubah status' });
  }
};

// 🔥 INTI PERBAIKAN: cek geofence pakai poligon asli kalau tersedia, fallback ke radius kalau tidak
export const checkLocationInWilayah = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.body;
    const pLat = parseOptionalFloat(latitude);
    const pLon = parseOptionalFloat(longitude);

    if (pLat === null || pLon === null) return res.status(400).json({ error: 'Koordinat diperlukan' });

    const wilayahList = await prisma.location.findMany({
      where: { isActive: true }
    });

    const results = wilayahList
      .map(w => {
        const distance = calculateDistance(pLat, pLon, Number(w.latitude), Number(w.longitude));

        let isInside: boolean;
        let method: 'polygon' | 'radius';

        if (w.boundaryGeoJson) {
          // Prioritas: pakai poligon asli kecamatan dari TomTom kalau tersedia.
          // Ini yang bikin dua kecamatan bertetangga tidak saling "nyerempet" seperti radius.
          isInside = isPointInBoundary(pLat, pLon, w.boundaryGeoJson);
          method = 'polygon';
        } else {
          // Fallback: kecamatan ini belum punya data poligon → tetap pakai radius lama
          const radiusInKm = (w.radius || 5000) / 1000;
          isInside = distance <= radiusInKm;
          method = 'radius';
        }

        return {
          id: w.id.toString(),
          name: w.name,
          distance: parseFloat(distance.toFixed(2)),
          isWithinRadius: isInside,
          method // berguna untuk debug/QA: tahu titik ini dicek pakai poligon atau radius
        };
      })
      .filter(r => r.isWithinRadius);

    res.json({
      inWilayah: results.length > 0,
      currentLocation: { latitude: pLat, longitude: pLon },
      wilayah: results,
      message: results.length > 0
        ? `Lokasi berada di dalam wilayah: ${results.map(r => r.name).join(', ')}`
        : 'Lokasi berada di luar wilayah yang ditentukan'
    });
  } catch (error) {
    console.error('Error checking geofence:', error);
    res.status(500).json({ error: 'Gagal memeriksa lokasi' });
  }
};


// 🔥 BARU: normalisasi boundaryGeoJson apa pun bentuknya jadi Feature<Polygon|MultiPolygon> yang valid, atau null
const normalizeBoundary = (raw: any): any | null => {
  try {
    let val = raw;

    // Kasus: tersimpan sebagai string JSON, bukan object
    if (typeof val === 'string') {
      val = JSON.parse(val);
    }
    if (!val || typeof val !== 'object') return null;

    // Kasus: TomTom mengembalikan FeatureCollection, ambil feature polygon pertamanya
    if (val.type === 'FeatureCollection' && Array.isArray(val.features)) {
      val = val.features.find((f: any) =>
        f?.geometry?.type === 'Polygon' || f?.geometry?.type === 'MultiPolygon'
      );
      if (!val) return null;
    }

    const feature = val.type === 'Feature' ? val : turf.feature(val);
    const geomType = feature.geometry?.type;
    if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') return null;

    return feature;
  } catch {
    return null;
  }
};

export const getAllPolygons = async (req: Request, res: Response) => {
  try {
    const polygons = await prisma.location.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        latitude: true,
        longitude: true,
        isActive: true,
        radius: true,
        boundaryGeoJson: true // ← BARU: dipakai frontend untuk render poligon di peta
      }
    });

    res.json(polygons.map(p => ({
      id: p.id.toString(),
      name: p.name,
      code: p.code,
      center: [Number(p.latitude), Number(p.longitude)],
      radius: p.radius,
      boundaryGeoJson: p.boundaryGeoJson, // ← BARU: null kalau belum punya poligon → frontend fallback ke circle
      isActive: p.isActive
    })));
  } catch (error) {
    console.error('Error fetching polygons:', error);
    res.status(500).json({ error: 'Gagal mengambil data polygon' });
  }
};

export const validateWilayahData = async (req: Request, res: Response) => {
  try {
    const wilayah = await prisma.location.findMany({
      orderBy: { name: 'asc' }
    });

    const validationResults = wilayah.map(w => ({
      id: w.id.toString(),
      name: w.name,
      // ✅ Fix: gunakan Number() untuk konversi Decimal sebelum dibandingkan dengan number
      isValid: Number(w.latitude) !== 0 && Number(w.longitude) !== 0 && (w.radius || 0) > 0,
      latitude: w.latitude,
      longitude: w.longitude,
      radius: w.radius,
      hasPolygon: !!w.boundaryGeoJson, // ← BARU: penanda cepat, wilayah ini pakai poligon atau masih radius saja
      issues: [
        Number(w.latitude) === 0 ? 'Latitude 0' : null,
        Number(w.longitude) === 0 ? 'Longitude 0' : null,
        !w.radius || w.radius < 1000 ? 'Radius terlalu kecil' : null,
        !w.boundaryGeoJson ? 'Belum ada data poligon — masih pakai radius (kurang akurat untuk batas kecamatan)' : null
      ].filter(Boolean)
    }));

    res.json({
      success: true,
      total: wilayah.length,
      valid: validationResults.filter(v => v.isValid).length,
      invalid: validationResults.filter(v => !v.isValid).length,
      withPolygon: validationResults.filter(v => v.hasPolygon).length, // ← BARU
      data: validationResults
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};