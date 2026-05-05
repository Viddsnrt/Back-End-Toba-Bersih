// Test script untuk cek validasi lokasi ketat
import axios from 'axios';

const testPosisi = async (namaTest, latitude, longitude) => {
  try {
    console.log(`\n🧪 Testing ${namaTest}: ${latitude}, ${longitude}`);

    const response = await axios.post('http://localhost:5000/api/laporan/create', {
      description: `Test ${namaTest}`,
      latitude: latitude,
      longitude: longitude,
      jenisSampah: "Tumpukan Sampah"
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log("✅ Laporan DITERIMA:", response.data.message);

  } catch (error) {
    if (error.response) {
      console.log("❌ Laporan DITOLAK:", error.response.data.message);
    } else {
      console.log("❌ Error:", error.message);
    }
  }
};

// Test posisi di dalam wilayah Laguboti (seharusnya diterima)
testPosisi("DI LAGUBOTI (Dalam Area)", "2.3333", "99.0667");

// Test posisi di dalam wilayah Balige (seharusnya diterima)
testPosisi("DI BALIGE (Dalam Area)", "2.3331", "99.0625");

// Test posisi di luar area (seharusnya ditolak)
testPosisi("DI LUAR AREA (Porsea)", "2.3860", "99.1476");

setTimeout(() => {
  console.log("\n✅ Selesai semua test!");
}, 3000);