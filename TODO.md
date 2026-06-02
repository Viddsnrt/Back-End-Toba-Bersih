# TODO - ManageEdukasi

## Backend
- [ ] Update `prisma/schema.prisma` tambah model `Edukasi`
- [ ] Jalankan migrasi + generate Prisma
- [ ] Isi `src/routes/edukasiRoutes.ts` (CRUD edukasi)
- [ ] Isi `src/controllers/edukasiController.ts` (CRUD edukasi via Prisma)
- [ ] Update upload agar terima `video/*` juga (bucket `galeri`)
  - [ ] `src/routes/uploadRoutes.ts`
  - [ ] `src/controllers/uploadcontroller.ts`
- [ ] Pastikan `src/index.ts` register route `/api/edukasi`

## Frontend Admin
- [ ] Isi `Web-Toba-Bersih/app/admin/components/ManageEdukasi.tsx` (CRUD + upload file)
- [ ] Integrasi menu di `Web-Toba-Bersih/app/admin/page.tsx` case `edukasi`
- [ ] Pastikan Sidebar `/admin/edukasi` sudah benar (sudah ada, hanya verifikasi activeMenu mapping)

## Testing
- [ ] Jalankan backend
- [ ] Test upload image/video + CRUD edukasi
- [ ] Jalankan build/lint frontend

