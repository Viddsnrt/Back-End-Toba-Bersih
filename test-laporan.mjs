// Test script untuk cek validasi laporan
import axios from 'axios';

const testLaporan = async () => {
  try {
    console.log("🧪 Testing laporan dengan koordinat Laguboti...");

    const response = await axios.post('http://localhost:5000/api/laporan/create', {
      userId: "1", // Opsional
      description: "Test laporan dari Laguboti",
      latitude: "2.3333",
      longitude: "99.0667",
      jenisSampah: "Tumpukan Sampah"
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log("✅ Laporan diterima:", response.data);

  } catch (error) {
    if (error.response) {
      console.log("❌ Laporan ditolak:", error.response.data);
    } else {
      console.log("❌ Error:", error.message);
    }
  }
};

testLaporan();