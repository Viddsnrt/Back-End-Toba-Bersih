import dotenv from "dotenv";
dotenv.config();

import { sendEmail } from "./src/utils/sendEmail.ts";

async function run() {
  await sendEmail(
    "emailtujuan@gmail.com",
    "Test Email DLH Toba",
    "Halo ini test email 🚀"
  );
}

run();