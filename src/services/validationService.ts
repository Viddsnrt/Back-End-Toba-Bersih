// src/services/validationService.ts
import FormData from 'form-data';
import fetch from 'node-fetch';

const ML_API_URL = process.env.ML_API_URL || 'https://ivan-sirait-paiii.hf.space';

export interface ValidationResult {
  status: 'success';
  prediction: {
    class: 0 | 1;
    label: 'Tidak Layak' | 'Layak Diangkut';
    confidence: number;
    probabilities: { 0: number; 1: number };
  };
  detection_count: number;
  features: {
    coverage_percent: number;
    object_count: number;
    height_ratio: number;
    distribution_score: number;
    bulky_flag: number;
    avg_confidence: number;
  };
  quality_info?: Record<string, number>;
}

// 🔥 Hasil ketika gambar tidak lolos quality check
export interface QualityRejection {
  status: 'rejected';
  rejection_stage: 'quality_check' | 'coverage_check';
  reason: string;   // Pesan dalam Bahasa Indonesia, langsung tampil ke user
  quality_details: Record<string, number>;
}

export type MLResult = ValidationResult | QualityRejection;

// 🔥 Custom error class untuk membedakan quality rejection vs error teknis
export class QualityCheckError extends Error {
  public readonly rejection: QualityRejection;

  constructor(rejection: QualityRejection) {
    super(rejection.reason);
    this.name = 'QualityCheckError';
    this.rejection = rejection;
  }
}

export async function validateWasteImage(
  imageBuffer: Buffer,
  originalname: string
): Promise<ValidationResult> {
  const formData = new FormData();
  formData.append('file', imageBuffer, {
    filename: originalname,
    contentType: 'image/jpeg',
  });

  const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${ML_API_URL}/validate`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
      signal: controller.signal, // ✅
    });

    const result = (await response.json()) as MLResult;

    if (response.status === 422 && result.status === 'rejected') {
      throw new QualityCheckError(result as QualityRejection);
    }

    if (!response.ok) {
      throw new Error(`ML API error: ${response.status} ${response.statusText}`);
    }

    return result as ValidationResult;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('ML server timeout (>15 detik) — dilanjutkan tanpa validasi');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}