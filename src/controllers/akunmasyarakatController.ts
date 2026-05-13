import { prisma, supabase } from "../config/db.js";
import * as XLSX from 'xlsx';

// Fungsi untuk mengenerate email default
const generateEmail = (fullName: string) => {
  if (!fullName) return "";
  // Hapus spasi, ubah ke lowercase, tambah @gmail.com
  const name = fullName.toLowerCase().replace(/\s+/g, "");
  return `${name}@gmail.com`;
};

// Fungsi validasi email
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Fungsi validasi nomor telepon
const isValidPhoneNumber = (phone: string): boolean => {
  // Hanya boleh berisi angka, spasi, +, -, (, ), dan *
  const phoneRegex = /^[\d\s+\-()*]+$/;
  return phoneRegex.test(phone) && phone.replace(/\s+/g, '').length >= 10;
};

// Helper function untuk sanitasi user response
const sanitizeUser = (user) => {
  const { passwordHash, ...userWithoutPassword } = user;
  return {
    ...userWithoutPassword,
    id: user.id.toString(), // Konversi BigInt ke string
    region: user.region || "", // Default empty string
  };
};

// GET USERS
export const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: "WARGA" },
      orderBy: { createdAt: "desc" },
    });

    const sanitizedUsers = users.map(sanitizeUser);

    res.json({ success: true, data: sanitizedUsers });
  } catch (error) {
    console.error("GET USERS ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal ambil data" });
  }
};

// CREATE USER
export const createUser = async (req, res) => {
  try {
    const { fullName, email, phoneNumber, password, role, region } = req.body;

    console.log("Request body:", req.body);

    // Validasi
    if (!fullName) {
      return res.status(400).json({
        success: false,
        message: "Nama lengkap wajib diisi",
      });
    }

    // Generate email jika kosong
    const finalEmail = email || generateEmail(fullName);

    // Validasi format email jika tidak kosong
    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid. Contoh: email@contoh.com",
      });
    }

    // Validasi format nomor telepon jika ada
    if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "Nomor telepon hanya boleh berisi angka dan simbol + - ( )",
      });
    }

    // Cek email duplikat
    const existingUser = await prisma.user.findUnique({
      where: { email: finalEmail }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar di sistem. Silakan gunakan email lain.",
      });
    }

    const user = await prisma.user.create({
      data: {
        fullName,
        email: finalEmail,
        passwordHash: password || "Warga123!",
        phoneNumber: phoneNumber || null,
        role: role || "WARGA",
        isActive: true,
        region: region || "", // Tambahkan field region jika ada di schema
      },
    });

    res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Gagal tambah user", 
      error: error.message 
    });
  }
};

// BULK CREATE USERS (Import Excel)
export const bulkCreateUsers = async (req, res) => {
  try {
    const { users } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Data users tidak valid atau kosong",
      });
    }

    if (users.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Maksimal 500 user per import",
      });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Proses setiap user secara berurutan untuk validasi email unik
    for (const userData of users) {
      const { fullName, email, phoneNumber, password, region } = userData;

      try {
        // Validasi per baris
        if (!fullName) {
          results.push({
            email: email || "unknown",
            status: "error",
            message: "Nama lengkap wajib diisi",
          });
          errorCount++;
          continue;
        }

        // Validasi format email jika tidak kosong
        if (email && !isValidEmail(email)) {
          results.push({
            email,
            status: "error",
            message: "Format email tidak valid. Contoh: email@contoh.com",
          });
          errorCount++;
          continue;
        }

        // Validasi format nomor telepon jika ada
        if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
          results.push({
            email: email || "unknown",
            status: "error",
            message: "Nomor telepon hanya boleh berisi angka dan simbol + - ( )",
          });
          errorCount++;
          continue;
        }

        // Generate email jika kosong
        const finalEmail = email || generateEmail(fullName);

        // Cek email duplikat di database
        const existingUser = await prisma.user.findUnique({
          where: { email: finalEmail },
        });

        if (existingUser) {
          results.push({
            email: finalEmail,
            status: "error",
            message: "Email sudah terdaftar di sistem. Silakan gunakan email lain.",
          });
          errorCount++;
          continue;
        }

        // Buat user baru
        await prisma.user.create({
          data: {
            fullName,
            email: finalEmail,
            passwordHash: password || "Warga123!",
            phoneNumber: phoneNumber || null,
            role: "WARGA",
            isActive: true,
            region: region || "",
          },
        });

        results.push({
          email: finalEmail,
          status: "success",
          message: "Berhasil didaftarkan",
        });
        successCount++;
      } catch (err) {
        console.error(`Bulk create error for ${email}:`, err);
        results.push({
          email: email || "unknown",
          status: "error",
          message: err.message || "Gagal mendaftarkan user",
        });
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: `Import selesai: ${successCount} berhasil, ${errorCount} gagal`,
      summary: {
        total: users.length,
        success: successCount,
        error: errorCount,
      },
      results,
    });
  } catch (error) {
    console.error("BULK CREATE ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Gagal melakukan import data",
      error: error.message,
    });
  }
};

// UPDATE USER
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phoneNumber, region, password } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID tidak valid",
      });
    }

    // Cek apakah user ada
    const existingUserCheck = await prisma.user.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existingUserCheck) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    // Cek email duplikat (kecuali user sendiri)
    if (email) {
      const emailUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: { id: BigInt(id) }
        }
      });

      if (emailUser) {
        return res.status(400).json({
          success: false,
          message: "Email sudah terdaftar oleh user lain",
        });
      }
    }

    // Prepare update data
    const updateData = {
      fullName: fullName || existingUserCheck.fullName,
      email: email || existingUserCheck.email,
      phoneNumber: phoneNumber !== undefined ? phoneNumber : existingUserCheck.phoneNumber,
      region: region !== undefined ? region : existingUserCheck.region,
    };

    // If password provided, update it
    if (password && password.trim()) {
      updateData.passwordHash = password.trim();
    }

    const user = await prisma.user.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    console.error("UPDATE ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Gagal update user",
      error: error.message 
    });
  }
};

// DELETE USER
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID tidak valid",
      });
    }

    // Cek apakah user ada
    const existingUser = await prisma.user.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const deletedUser = await prisma.user.delete({
      where: { id: BigInt(id) },
    });

    res.json({ 
      success: true, 
      data: sanitizeUser(deletedUser), 
      message: "Akun berhasil dihapus" 
    });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Gagal hapus user",
      error: error.message
    });
  }
};

// EXPORT USERS
export const exportUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: "WARGA" },
      orderBy: { createdAt: "desc" },
    });

    const exportData = users.map(user => ({
      "Nama Lengkap": user.fullName,
      "Email": user.email,
      "Nomor Telepon": user.phoneNumber || "",
      "Wilayah": user.region || "",
      "Status": user.isActive ? "Aktif" : "Nonaktif",
      "Tanggal Dibuat": user.createdAt.toLocaleDateString("id-ID"),
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    ws["!cols"] = [
      { wch: 20 }, // Nama Lengkap
      { wch: 30 }, // Email
      { wch: 15 }, // Nomor Telepon
      { wch: 20 }, // Wilayah
      { wch: 10 }, // Status
      { wch: 15 }, // Tanggal Dibuat
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Akun Masyarakat");

    // Send response
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=akun_masyarakat_${new Date().toISOString().split("T")[0]}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);
  } catch (error) {
    console.error("EXPORT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Gagal export data",
      error: error.message
    });
  }
}