import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import fs from 'fs';
import path from 'path';

// Membaca file JSON Kunci Rahasia
const serviceAccountPath = path.resolve('./firebase-service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// Menyalakan mesin Firebase Admin dengan gaya modular baru
initializeApp({
  credential: cert(serviceAccount),
});

// Fungsi Pemicu Push Notification
export const sendPushNotification = async (fcmToken: string, title: string, body: string) => {
  try {
    // Gunakan getMessaging() versi terbaru
    await getMessaging().send({
      token: fcmToken,
      notification: {
        title: title,
        body: body,
      },
    });
    console.log(`✅ [Firebase] Push Notif terkirim ke token: ${fcmToken.substring(0, 15)}...`);
  } catch (error) {
    console.error(`❌ [Firebase] Gagal kirim notif:`, error);
  }
};