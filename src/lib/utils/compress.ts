import imageCompression from 'browser-image-compression';

const TARGET_SIZE_MB = 0.5;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  size: number;
}

export async function compressImage(file: File | Blob): Promise<CompressedImage> {
  const sourceFile = file instanceof File ? file : new File([file], 'capture.jpg', { type: 'image/jpeg' });

  const compressed = await imageCompression(sourceFile, {
    maxSizeMB: TARGET_SIZE_MB,
    maxWidthOrHeight: 2048,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.85,
  });

  const { width, height } = await readDimensions(compressed);
  return { blob: compressed, width, height, size: compressed.size };
}

function readDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
