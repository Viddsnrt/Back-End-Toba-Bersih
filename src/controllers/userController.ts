import { prisma, supabase } from "../config/db.js";
// GET USERS
export const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: "WARGA" },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error("GET USERS ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal ambil data" });
  }
};

// CREATE USER
export const createUser = async (req, res) => {
  try {
    const { fullName, email, phoneNumber, password, role, region } = req.body;

    // validasi sederhana
    if (!fullName || !email) {
      return res.status(400).json({
        success: false,
        message: "Nama dan email wajib diisi",
      });
    }

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash: password || "default123",
        phoneNumber: phoneNumber || "",
        role: role || "WARGA",
        region: region || "",
      },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal tambah user" });
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

    const user = await prisma.user.update({
      where: { id: BigInt(id) },
      data: {
        fullName,
        email,
        phoneNumber,
        region,
      },
    });

    res.json({ success: true, data: user });
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

    await prisma.user.delete({
      where: { id: BigInt(id) },
    });

    res.json({ success: true, message: "Berhasil dihapus" });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    res.status(500).json({ success: false, message: "Gagal delete" });
  }
};