import { prisma, supabase } from "../config/db.js";
// GET USERS
export const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: "WARGA" },
      orderBy: { createdAt: "desc" },
    });

    // Hapus password hash dari semua response untuk keamanan
    const usersWithoutPasswords = users.map(user => {
      const { passwordHash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    // Tambahkan region ke setiap user (untuk frontend)
    const usersWithRegion = usersWithoutPasswords.map(user => ({
      ...user,
      region: "" // Region bisa diambil dari tempat lain jika tersimpan
    }));

    res.json({ success: true, data: usersWithRegion });
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

    // validasi sederhana
    if (!fullName || !email) {
      return res.status(400).json({
        success: false,
        message: "Nama dan email wajib diisi",
      });
    }

    // Cek apakah email sudah ada
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash: password || "123456", // Menggunakan password default sesuai frontend
        phoneNumber: phoneNumber || null, // Menggunakan null untuk field optional
        role: role || "WARGA",
        isActive: true,
      },
    });

    // Hapus password hash dari response untuk keamanan
    const { passwordHash, ...userWithoutPassword } = user;

    // Tambahkan region ke response (untuk frontend)
    const userWithRegion = {
      ...userWithoutPassword,
      region: "" // Region bisa diambil dari tempat lain jika tersimpan
    };

    res.json({ success: true, data: userWithRegion });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal tambah user", error: error.message });
  }
};

// UPDATE USER
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phoneNumber, region } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID tidak valid",
      });
    }

    // Cek apakah email sudah ada di user lain
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: BigInt(id) }
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    const user = await prisma.user.update({
      where: { id: BigInt(id) },
      data: {
        fullName,
        email,
        phoneNumber: phoneNumber || null,
      },
    });

    // Hapus password hash dari response untuk keamanan
    const { passwordHash, ...userWithoutPassword } = user;

    // Tambahkan region ke response (untuk frontend)
    const userWithRegion = {
      ...userWithoutPassword,
      region: "" // Region bisa diambil dari tempat lain jika tersimpan
    };

    res.json({ success: true, data: userWithRegion });
  } catch (error) {
    console.error("UPDATE ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal update" });
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

    const deletedUser = await prisma.user.delete({
      where: { id: BigInt(id) },
    });

    // Hapus password hash dari response untuk keamanan
    const { passwordHash, ...userWithoutPassword } = deletedUser;

    // Tambahkan region ke response (untuk frontend)
    const userWithRegion = {
      ...userWithoutPassword,
      region: "" // Region bisa diambil dari tempat lain jika tersimpan
    };

    res.json({ success: true, data: userWithRegion, message: "Berhasil dihapus" });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal delete" });
  }
}; 