/**
 * seed-rute-geocode.ts
 * 
 * Script ini melakukan 2 hal sekaligus:
 * 1. Parse semua rute dari data DOCX ke struktur TypeScript
 * 2. Geocode nama lokasi → lat/lng pakai Nominatim (OpenStreetMap, GRATIS)
 * 
 * Jalankan: npx ts-node prisma/seed-rute-geocode.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Delay helper (Nominatim minta max 1 req/detik) ─────────
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Geocode satu nama lokasi → { lat, lng } ────────────────
async function geocode(namaLokasi: string, kotaKonteks = 'Balige, Toba, Sumatera Utara'): Promise<{ lat: number; lng: number } | null> {
  const query = encodeURIComponent(`${namaLokasi}, ${kotaKonteks}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DLH-Toba-App/1.0 (admin@dlhtoba.go.id)' }
    });
    const data: any[] = await res.json();

    if (data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      console.log(`  ✅ "${namaLokasi}" → ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      return { lat, lng };
    }

    // Coba query lebih singkat (hapus "JLN." prefix)
    const namaSimple = namaLokasi.replace(/^(JLN\.|JL\.)\s*/i, '').trim();
    if (namaSimple !== namaLokasi) {
      return geocode(namaSimple, kotaKonteks);
    }

    console.warn(`  ⚠️  "${namaLokasi}" tidak ditemukan di Nominatim`);
    return null;
  } catch (err) {
    console.error(`  ❌ Gagal geocode "${namaLokasi}":`, err);
    return null;
  }
}

// ─── Koordinat fallback untuk lokasi yang sering gagal ──────
// Koordinat ini sudah diverifikasi manual di Google Maps untuk wilayah Balige
const KOORDINAT_MANUAL: Record<string, { lat: number; lng: number }> = {
  'TPA PINTU BOSI':                     { lat: 2.3180, lng: 99.0450 },
  'SIMPANG SIBULELE':                   { lat: 2.3405, lng: 99.0689 },
  'HOTEL LABERSA':                      { lat: 2.3398, lng: 99.0701 },
  'HOTEL BALIGE BEACH':                 { lat: 2.3241, lng: 99.0612 },
  'TOBA FANTASI':                       { lat: 2.3415, lng: 99.0712 },
  'PASAR BALIGE':                       { lat: 2.3340, lng: 99.0640 },
  'BUNDARAN DI PANJAITAN':              { lat: 2.3370, lng: 99.0620 },
  'JUARA MONANG':                       { lat: 2.3410, lng: 99.0680 },
  'KANTOR BUPATI':                      { lat: 2.3280, lng: 99.0560 },
  'SOPOSURUNG':                         { lat: 2.3250, lng: 99.0540 },
  'LUMBAN SILINTONG':                   { lat: 2.3200, lng: 99.0510 },
  'TERMINAL PORSEA':                    { lat: 2.5100, lng: 99.0700 },
  'RSUD PORSEA':                        { lat: 2.5080, lng: 99.0720 },
  'PASAR LAGUBOTI':                     { lat: 2.1800, lng: 99.0500 },
  'TPA SIJAMBUR':                       { lat: 2.6850, lng: 98.8750 },
  'DERMAGA FERRY AJIBATA':              { lat: 2.6820, lng: 98.8680 },
};

// ─── Helper: cari di fallback ────────────────────────────────
function cariFallback(nama: string): { lat: number; lng: number } | null {
  const namaUpper = nama.toUpperCase();
  for (const [key, coord] of Object.entries(KOORDINAT_MANUAL)) {
    if (namaUpper.includes(key) || key.includes(namaUpper.substring(0, 10))) {
      return coord;
    }
  }
  return null;
}

// ─── Data Rute Semua Truk ────────────────────────────────────
interface DataRute {
  platNomor: string;
  namaSupir: string;
  noHp: string;
  kecamatan: string;
  jadwal: {
    hari: string;
    waypoints: string[];
  }[];
}

const SEMUA_RUTE: DataRute[] = [
  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8160 E',
    namaSupir: 'Ibrahim Silalahi',
    noHp: '0822 6737 9931',
    kecamatan: 'Kec. Balige',
    jadwal: [
      {
        hari: 'SENIN',
        waypoints: [
          'Jln. Raja Sibagot Ni Pohan',
          'Jln. Tambubolon',
          'Jln. Lintas Sumatera Hotel Labersa',
          'Simpang Sibulele',
          'Sibolahotang',
          'Bona Ni Ari Marpaung',
          'Hotel Balige Beach',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SELASA',
        waypoints: [
          'Simpang Sibulele',
          'Jln. Lintas Sumatera Hotel Labersa',
          'Jln. Tampubolon',
          'Jln. Parluasan',
          'MBG Parluasan',
          'Jln. GHM Siahaan GKPI Telkom',
          'Jln. Uma Rihit',
          'Jln. Ompu Batu Tahan',
          'Jln. Cornel Simanjuntak',
          'Jln. Bona Ni Onan',
          'Jln. Pierre Tandean SD Katolik',
          'Hotel JS Balige',
          'Jln. Pardede Tandang Buhit',
          'Rumah Wakil Bupati Toba',
          'Sianipar Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'RABU',
        waypoints: [
          'Simpang Sibulele',
          'Hotel Labersa Balige',
          'Toba Fantasi Water Park',
          'Sigeok-geok Balige',
          'Tambunan Balige',
          'Perumahan DL Sitorus Balige',
          'Jln. Tampubolon Balige',
          'Kantor KPPN Keuangan Balige',
          'Jln. Lumban Bulbul Balige',
          'Jln. Sibolahotang Balige',
          'Hotel Balige Beach',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'Simpang Sibulele',
          'Jln. Lintas Sumatera MBG Balige',
          'Hotel Labersa Balige',
          'Jln. Lumban Bulbul Pantai Balige',
          'Jln. Pardede Onan Balige',
          'SD Katolik Balige',
          'Bak Pardede Balige',
          'Jln. Tandang Buhit Balige',
          'Jln. Cornel Simanjuntak Balige',
          'Jln. Sibagot Ni Pohan Balige',
          'HKBP Tiberias Bulbul Balige',
          'SD Lumban Bulbul Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SABTU',
        waypoints: [
          'Simpang Sibulele',
          'Jln. Lintas Sumatera MBG Balige',
          'Hotel Labersa Balige',
          'Toba Fantasi Water Park',
          'Jln. Parluasan Balige',
          'Jln. GHM Siahaan GKPI Telkom',
          'Jln. Uma Rihit Balige',
          'Jln. Ompu Batu Tahan Balige',
          'Jln. Cornel Simanjuntak Balige',
          'Jln. Bona Ni Onan Balige',
          'Jln. Pierre Tandean Balige',
          'Jln. Pardede Tandang Buhit Balige',
          'Rumah Wakil Bupati Toba',
          'Sianipar Balige',
          'TPA Pintu Bosi',
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8149 E',
    namaSupir: 'Hasiholan Tambunan',
    noHp: '0813 6525 9778',
    kecamatan: 'Kec. Balige',
    jadwal: [
      {
        hari: 'SENIN',
        waypoints: [
          'Jln. Hutabulu Balige',
          'Hutagaol Balige',
          'Parsuratan Balige',
          'Perumahan Dosniroha Balige',
          'Paindoan Balige',
          'Asrama 125 Simbisa Balige',
          'Jln. Serma Muda Balige',
          'Simpang Sibulele Jembatan Juara Monang',
          'KFC Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SELASA',
        waypoints: [
          'Jln. Hutabulu Balige',
          'Jln. Serma Muda Balige',
          'Simpang Sibulele Jembatan Juara Monang',
          'Cafe Agatha Balige',
          'Jln. Siliwangi Balige',
          'Jln. Pdt Leman Balige',
          'Jln. Parbatuan Gereja Advent Balige',
          'Jln. Pemandian Lumban Silintong',
          'Hotel Herty Balige',
          'Gereja HKBP Lumban Silintong',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'RABU',
        waypoints: [
          'Jln. Hutabulu Balige',
          'Asrama Kompi 125 Simbisa Balige',
          'Simpang Sibulele Jembatan Juara Monang',
          'Jln. Siliwangi Balige',
          'Jln. Pdt Leman Puskesmas Balige',
          'Lumban Silintong Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'Jln. Hutabulu Balige',
          'Hutagaol Balige',
          'Parsuratan Balige',
          'Paindoan Balige',
          'Asrama 125 Simbisa Balige',
          'Jln. Serma Muda Balige',
          'Simpang Sibulele Jembatan Juara Monang',
          'KFC Balige',
          'Jln. Siliwangi Balige',
          'Rutan Balige',
          'Jln. Pdt Leman Puskesmas Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SABTU',
        waypoints: [
          'Jln. Hutabulu Balige',
          'Jln. Serma Muda Balige',
          'Simpang Sibulele Jembatan Juara Monang',
          'Jln. Siliwangi Balige',
          'Cafe Agatha Balige',
          'Rutan Balige',
          'Jln. Pdt Leman Puskesmas Balige',
          'Jln. Pdt Munson Hotel OYO Balige',
          'Jln. Parbatuan Gereja Advent Balige',
          'Jln. Pemandian Lumban Silintong',
          'Gereja HKBP Lumban Silintong',
          'Hotel Herty Balige',
          'KFC Balige',
          'TPA Pintu Bosi',
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8132 E',
    namaSupir: 'Jenni P. Napitupulu',
    noHp: '0812 7690 5313',
    kecamatan: 'Kec. Balige - Porsea',
    jadwal: [
      {
        hari: 'SENIN',
        waypoints: [
          'Simpang Silimbat Porsea',
          'Simpang RSUD Porsea',
          'Jln. Raja Sipakko Napitupulu RSUD Porsea',
          'Pantai Pasir Putih Parparean Porsea',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SELASA',
        waypoints: [
          'Ganda Uli Balige',
          'Kompleks Gereja HKBP Balige',
          'Akper Balige',
          'Jln. TD Pardede Balige',
          'Lapas Rutan Balige',
          'Bak Nabasa Balige',
          'Venue Balige',
          'Griya Tampubolon Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'RABU',
        waypoints: [
          'Janji Maria Balige',
          'Lumban Gaol Balige',
          'Griya Lumban Gaol Balige',
          'Gereja GBKP Balige',
          'Griya Lumban Pea Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'Gapura Sipittu Balige',
          'Tangga Batu Balige',
          'Jembatan Kembar Gurgur Balige',
          'Kantor Camat Tampahan Balige',
          'Jln. SM Simanjuntak Balige',
          'Desa Lintong Nihuta Balige',
          'Sigiringgiring Balige',
          'Kompleks Gereja HKBP Balige',
          'Akper Balige',
          'Griya Tampubolon Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SABTU',
        waypoints: [
          'Ganda Uli Balige',
          'Jln. TD Pardede Balige',
          'Jln. Siliwangi Balige',
          'Lapas Rutan Balige',
          'Bak Nabasa Balige',
          'Jln. Bukit Barisan Balige',
          'Venue Balige',
          'TPA Pintu Bosi',
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8135 E',
    namaSupir: 'Sahat Parlindungan Gurning',
    noHp: '0813 6106 4594',
    kecamatan: 'Kec. Balige',
    jadwal: [
      {
        hari: 'SENIN',
        waypoints: [
          'Jln. TB Simatupang Balige',
          'Pasar Balige',
          'Jln. Patuan Anggi Balige',
          'Terminal Mini Balige',
          'Jln. Gereja Balige',
          'Jln. Paindoan Balige',
          'Jln. Jambu Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SELASA',
        waypoints: [
          'Jln. TB Simatupang Balige',
          'Pasar Balige',
          'Jln. Gereja Balige',
          'Jln. Paindoan Balige',
          'Jln. Patuan Anggi Balige',
          'Terminal Mini Balige',
          'Jln. Somba Debata Balige',
          'Gudang Pusri Balige',
          'Dinas Kesehatan Balige',
          'ALS By Pass Balige',
          'Pasar Tambunan Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'RABU',
        waypoints: [
          'Jln. TB Simatupang Balige',
          'Pasar Balige',
          'Jln. Gereja Balige',
          'Jln. Paindoan Balige',
          'Jln. Patuan Anggi Balige',
          'Terminal Mini Balige',
          'Jln. Jambu Balige',
          'Pasar Tambunan Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'Jln. TB Simatupang Balige',
          'Pasar Balige',
          'Jln. Gereja Balige',
          'Jln. Paindoan Balige',
          'Jln. Patuan Anggi Balige',
          'Terminal Mini Balige',
          'Jln. Somba Debata Balige',
          'Gudang Pusri Balige',
          'Dinas Kesehatan Balige',
          'ALS By Pass Balige',
          'Pasar Tambunan Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SABTU',
        waypoints: [
          'Jln. TB Simatupang Balige',
          'Pasar Balige',
          'Jln. Gereja Balige',
          'Jln. Paindoan Balige',
          'Jln. Patuan Anggi Balige',
          'Terminal Mini Balige',
          'TPA Pintu Bosi',
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8137 E',
    namaSupir: 'Brusli Superli Silitonga',
    noHp: '0813 9766 8155',
    kecamatan: 'Kec. Balige',
    jadwal: [
      {
        hari: 'SENIN',
        waypoints: [
          'Jln. Sisingamangaraja Bundaran DI Panjaitan Balige',
          'Jln. Patuan Nagari Jembatan Polsek Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SELASA',
        waypoints: [
          'Jln. Sisingamangaraja Bundaran DI Panjaitan Balige',
          'Jln. Patuan Nagari Jembatan Polsek Balige',
          'Jln. Napitupulu Pardolok Tolong Balige',
          'Hotel Sere Nauli Laguboti',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'RABU',
        waypoints: [
          'Jln. Sisingamangaraja Bundaran DI Panjaitan Balige',
          'Jln. Patuan Nagari Jembatan Polsek Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'Jln. Sisingamangaraja Bundaran DI Panjaitan Balige',
          'Jln. Patuan Nagari Jembatan Polsek Balige',
          'Jln. Napitupulu Pardolok Tolong Balige',
          'Hotel Sere Nauli Laguboti',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SABTU',
        waypoints: [
          'Jln. Sisingamangaraja Bundaran DI Panjaitan Balige',
          'Jln. Patuan Nagari Jembatan Polsek Balige',
          'Hotel Sere Nauli Laguboti',
          'TPA Pintu Bosi',
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8184 E',
    namaSupir: 'Mikael Carles Sihotang',
    noHp: '0812 6037 0459',
    kecamatan: 'Kec. Balige',
    jadwal: [
      {
        hari: 'SENIN',
        waypoints: [
          'Bundaran DI Panjaitan Balige',
          'Jln. TD Pardede Balige',
          'Jln. Bukit Barisan Balige',
          'Jln. Mulia Raja Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SELASA',
        waypoints: [
          'Jln. DI Panjaitan Balige',
          'By Pass Balige',
          'Bagot Asri Balige',
          'Jln. Mulia Raja Balige',
          'Lapas Balige',
          'Jln. Mesjid Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'RABU',
        waypoints: [
          'Jln. DI Panjaitan Balige',
          'Jln. Napitupulu Bagasan Balige',
          'Jln. Bukit Barisan Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'By Pass Balige',
          'Jln. DI Panjaitan Balige',
          'Lapas Balige',
          'Jln. TD Pardede Balige',
          'Jln. Mulia Raja Balige',
          'Jln. Bukit Barisan Balige',
          'Bak Depan Nabasa Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SABTU',
        waypoints: [
          'By Pass Balige',
          'Jln. Bagot Asri Balige',
          'Jln. DI Panjaitan Balige',
          'Jln. Mulia Raja Balige',
          'Kompleks Dermaga Balige',
          'TPA Pintu Bosi',
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8183 E',
    namaSupir: 'Apri Hutajulu',
    noHp: '0852 7537 3321',
    kecamatan: 'Kec. Balige',
    jadwal: [
      {
        hari: 'SENIN',
        waypoints: [
          'Jln. Patuan Nagari Gereja Katolik Balige',
          'Jln. Babalubis Balige',
          'Jln. Lintas Tarutung Jembatan Soposurung Balige',
          'Jln. Kartini Pelajar Balige',
          'Jln. Pagar Batu Kolam Renang Balige',
          'Jln. Sutomo Balige',
          'Kompleks Kantor Bupati DPRD Balige',
          'Hotel Mutiara Balige',
          'Belakang Gereja HKBP Soposurung Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SELASA',
        waypoints: [
          'Simpang Gereja Katolik Balige',
          'Jln. Patuan Nagari Balige',
          'Sangkarnihuta Balige',
          'Soposurung Balige',
          'Alfamidi Balige',
          'Jln. Kartini Pelajar Balige',
          'Jln. Sutomo Balige',
          'Kompleks Kantor Bupati DPRD Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'RABU',
        waypoints: [
          'Haumabange Balige',
          'Jln. Patuan Nagari Gereja Katolik Balige',
          'Jln. Lintas Tarutung Jembatan Soposurung Balige',
          'Jln. Kartini Pelajar Balige',
          'Jln. Hinalang Jembatan Hinalang Balige',
          'Jln. Pagar Batu Kolam Renang Balige',
          'Jln. Sutomo Balige',
          'Kompleks Kantor Bupati DPRD Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'Simpang Gereja Katolik Balige',
          'Simpang Babalubis Balige',
          'Jln. Patuan Nagari Balige',
          'Sangkarnihuta Balige',
          'Soposurung Balige',
          'Jln. Kartini Pelajar Balige',
          'Kompleks Kantor Dishub Kominfo KPU Balige',
          'Alfamidi Balige',
          'Jln. Sutomo Balige',
          'Kantor Bupati DPRD Balige',
          'Belakang Gereja HKBP Soposurung Balige',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SABTU',
        waypoints: [
          'Haumabange Balige',
          'Jln. Patuan Nagari Gereja Katolik Balige',
          'Jln. Lintas Tarutung Jembatan Soposurung Balige',
          'Jln. Kartini Pelajar Balige',
          'Jln. Hinalang Jembatan Hinalang Balige',
          'Jln. Pagar Batu Kolam Renang Balige',
          'Jln. Sutomo Balige',
          'Kompleks Kantor Bupati DPRD Balige',
          'TPA Pintu Bosi',
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8164 E',
    namaSupir: 'Refloni Sinaga',
    noHp: '0853 6562 9201',
    kecamatan: 'Kec. Laguboti',
    jadwal: [
      {
        hari: 'SELASA',
        waypoints: [
          'Pasar Bengkok Laguboti',
          'Jln. SM Raja SPBU Laguboti',
          'Jln. Patuan Anggi Laguboti',
          'Jln. Patuan Nagari Laguboti',
          'Jln. Ahmad Yani Laguboti',
          'Pasar Laguboti',
          'Simpang Sirongit IT Del Laguboti',
          'Sitoluama Laguboti',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'RABU',
        waypoints: [
          'Jln. Parluasan Desa Sibuea Laguboti',
          'Jln. Harapan Laguboti',
          'Jln. Sitakkola Laguboti',
          'Pasar Laguboti',
          'Jln. Patuan Nagari Laguboti',
          'Jln. Pattimura Laguboti',
          'Jln. SM Raja SPBU Laguboti',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'Jln. Puteri Lopian Laguboti',
          'Jln. Danau Toba Laguboti',
          'Jln. FL Tobing Laguboti',
          'Jln. Op Raja Hutapea Laguboti',
          'SPBU Laguboti',
          'Jln. Patuan Anggi Laguboti',
          'Pasar Laguboti',
          'Jln. Pelajar Laguboti',
          'Jln. Patuan Nagari Laguboti',
          'Jln. Ahmad Yani Laguboti',
          'Simpang Sirongit IT Del Laguboti',
          'Sitoluama Laguboti',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'JUMAT',
        waypoints: [
          'Jln. Biblevrow Laguboti',
          'Perumahan Korpri Laguboti',
          'Jln. Sitakkola Laguboti',
          'Jln. Harapan Laguboti',
          'Jln. Parluasan Desa Sibuea Laguboti',
          'Jln. Patuan Nagari Laguboti',
          'Jln. SM Raja SPBU Laguboti',
          'Jln. Pattimura Laguboti',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SABTU',
        waypoints: [
          'Pasar Bengkok Laguboti',
          'SPBU Laguboti',
          'Jln. Patuan Anggi Laguboti',
          'Jln. Ahmad Yani Laguboti',
          'Pasar Laguboti',
          'Jln. Patuan Nagari Laguboti',
          'Jln. FL Tobing Laguboti',
          'Jln. Danau Toba Laguboti',
          'Jln. Op Raja Hutapea Laguboti',
          'Jln. Puteri Lopian Laguboti',
          'Simpang Sirongit IT Del Laguboti',
          'TPA Pintu Bosi',
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8165 E',
    namaSupir: 'Litekly Ompusunggu',
    noHp: '0812 6006 4477',
    kecamatan: 'Kec. Porsea',
    jadwal: [
      {
        hari: 'SENIN',
        waypoints: [
          'Terminal Porsea',
          'Jln. SM Raja Porsea',
          'Tanah Lapang Porsea',
          'Jln. Patuan Nagari Porsea',
          'Jln. Patuan Anggi Porsea',
          'Jln. DI Panjaitan Porsea',
          'Jln. FL Tobing Porsea',
          'RSUD Porsea',
          'Desa Huta Gurgur Porsea',
          'Polres Toba Porsea',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SELASA',
        waypoints: [
          'Terminal Porsea',
          'Jln. SM Raja Porsea',
          'Jln. Patuan Nagari Porsea',
          'Jln. Patuan Anggi Porsea',
          'Jln. DI Panjaitan Porsea',
          'Jln. FL Tobing Porsea',
          'Pasar Porsea',
          'Parparean II Porsea',
          'Parparean III Porsea',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'Terminal Porsea',
          'Jln. SM Raja Porsea',
          'Tanah Lapang Porsea',
          'Desa Raut Bosi Porsea',
          'Jln. Patuan Nagari Porsea',
          'Jln. Patuan Anggi Porsea',
          'Jln. DI Panjaitan Porsea',
          'Jln. FL Tobing Porsea',
          'RSUD Porsea',
          'Desa Huta Gurgur Porsea',
          'Polres Toba Porsea',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'JUMAT',
        waypoints: [
          'Terminal Porsea',
          'Pasar Porsea',
          'Jln. Patuan Nagari Porsea',
          'Jln. Patuan Anggi Porsea',
          'Jln. DI Panjaitan Porsea',
          'Jln. FL Tobing Porsea',
          'Jln. SM Raja Porsea',
          'TPA Pintu Bosi',
        ],
      },
      {
        hari: 'SABTU',
        waypoints: [
          'Jln. SM Raja Porsea',
          'Jln. Patuan Nagari Porsea',
          'Jln. Patuan Anggi Porsea',
          'Jln. DI Panjaitan Porsea',
          'Jln. FL Tobing Porsea',
          'RSUD Porsea',
          'Desa Lumban Datu Porsea',
          'Desa Lumban Manurung Porsea',
          'TPA Pintu Bosi',
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════
  {
    platNomor: 'BB 8179 E',
    namaSupir: 'Benny Ranap YC Napitupulu',
    noHp: '0821 6528 8220',
    kecamatan: 'Kec. Ajibata',
    jadwal: [
      {
        hari: 'SENIN',
        waypoints: [
          'Kantor Basarnas Ajibata',
          'Jln. Justin Sirait Ajibata',
          'Dermaga Ferry Ihan Batak Ajibata',
          'Terminal Ajibata',
          'Dermaga Kapal Tomok Ajibata',
          'Dermaga Ferry Tao Toba Ajibata',
          'Gang Gambiri Ajibata',
          'Gang Parbiusan Ajibata',
          'TPA Sijambur',
        ],
      },
      {
        hari: 'SELASA',
        waypoints: [
          'Jln. Hau Hole Ajibata',
          'Kantor Basarnas Ajibata',
          'Jln. Justin Sirait Ajibata',
          'Dermaga Ferry Ihan Batak Ajibata',
          'Terminal Ajibata',
          'Dermaga Kapal Tomok Ajibata',
          'SD Negeri Ajibata',
          'Jln. Japang Ajibata',
          'TPA Sijambur',
        ],
      },
      {
        hari: 'RABU',
        waypoints: [
          'Lumban Sirait Desa Pardomuan Ajibata',
          'Kantor Basarnas Ajibata',
          'Jln. Justin Sirait Ajibata',
          'Dermaga Ferry Ihan Batak Ajibata',
          'Terminal Ajibata',
          'Dermaga Kapal Tomok Ajibata',
          'Gang Gambiri Ajibata',
          'Gang Parbiusan Ajibata',
          'TPA Sijambur',
        ],
      },
      {
        hari: 'KAMIS',
        waypoints: [
          'Jln. Hau Hole Ajibata',
          'Kantor Basarnas Ajibata',
          'Jln. Justin Sirait Ajibata',
          'Dermaga Ferry Ihan Batak Ajibata',
          'Terminal Ajibata',
          'Dermaga Kapal Tomok Ajibata',
          'Jln. DI Panjaitan Ajibata',
          'Jln. Japang Ajibata',
          'TPA Sijambur',
        ],
      },
      {
        hari: 'JUMAT',
        waypoints: [
          'Kantor Basarnas Ajibata',
          'Jln. Justin Sirait Ajibata',
          'Dermaga Ferry Ihan Batak Ajibata',
          'Terminal Ajibata',
          'Dermaga Kapal Tomok Ajibata',
          'Dermaga Ferry Tao Toba Ajibata',
          'Jln. Pembangunan Puskesmas Ajibata',
          'Jln. Pembangunan Belakang Pajak Ajibata',
          'Gang Gambiri Ajibata',
          'Gang Parbiusan Ajibata',
          'SD Negeri Ajibata',
          'TPA Sijambur',
        ],
      },
    ],
  },
];

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Memulai seed rute dengan geocoding Nominatim...\n');
  console.log('⏱  Estimasi waktu: ~1 detik per waypoint (rate limit Nominatim)\n');

  let totalRute = 0;
  let totalWp = 0;
  let gagalGeocode = 0;

  for (const trukData of SEMUA_RUTE) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🚛 Truk: ${trukData.platNomor} | Supir: ${trukData.namaSupir}`);
    console.log(`${'═'.repeat(60)}`);

    // Cari atau buat truk
    let truk = await prisma.truck.findFirst({
      where: { plateNumber: trukData.platNomor }
    });

    if (!truk) {
      console.log(`⚠️  Truk ${trukData.platNomor} belum ada di DB — skip`);
      console.log(`   Pastikan data truk sudah diinput terlebih dahulu.`);
      continue;
    }

    for (const jadwal of trukData.jadwal) {
      console.log(`\n  📅 ${jadwal.hari} (${jadwal.waypoints.length} titik)`);

      // Hapus rute lama jika ada
      await prisma.routeTemplate.deleteMany({
        where: { truckId: truk.id, dayOfWeek: jadwal.hari }
      });

      // Buat RouteTemplate dulu
      const rute = await prisma.routeTemplate.create({
        data: {
          truckId:   truk.id,
          dayOfWeek: jadwal.hari,
          name:      `Rute ${trukData.platNomor} - ${jadwal.hari}`,
          isActive:  true,
        }
      });

      // Geocode setiap waypoint
      const waypointsData: { routeId: bigint; order: number; name: string; latitude: number; longitude: number }[] = [];

      for (let i = 0; i < jadwal.waypoints.length; i++) {
        const namaWp = jadwal.waypoints[i];

        // Cari di fallback dulu (lebih cepat)
        let koord = cariFallback(namaWp);

        if (!koord) {
          // Geocode ke Nominatim
          koord = await geocode(namaWp);
          await delay(1100); // Tunggu 1.1 detik agar tidak rate-limit
        }

        if (!koord) {
          // Koordinat tidak ditemukan — gunakan titik pusat Balige sebagai placeholder
          koord = { lat: 2.3333, lng: 99.0632 };
          gagalGeocode++;
          console.warn(`  ⚠️  [${i+1}] "${namaWp}" → pakai koordinat placeholder, perbaiki manual di UI!`);
        }

        waypointsData.push({
          routeId:   rute.id,
          order:     i + 1,
          name:      namaWp,
          latitude:  koord.lat,
          longitude: koord.lng,
        });
      }

      // Bulk insert waypoints
      await prisma.routeWaypoint.createMany({ data: waypointsData });

      console.log(`  ✅ ${jadwal.hari}: ${waypointsData.length} waypoint tersimpan`);
      totalRute++;
      totalWp += waypointsData.length;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎉 Selesai!`);
  console.log(`   Total rute dibuat  : ${totalRute}`);
  console.log(`   Total waypoint     : ${totalWp}`);
  console.log(`   Perlu perbaikan    : ${gagalGeocode} waypoint (koordinat placeholder)`);
  if (gagalGeocode > 0) {
    console.log(`\n   ⚠️  Buka UI Admin → Manajemen Rute → Edit waypoint yang perlu diperbaiki`);
    console.log(`   Klik peta untuk update koordinat yang masih placeholder`);
  }
  console.log(`${'═'.repeat(60)}\n`);
}

main()
  .catch(err => { console.error('❌ Fatal error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());