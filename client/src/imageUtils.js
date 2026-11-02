// Shrink photos in the browser before upload: screenshots and phone photos are often
// several MB, and the server (Netlify functions) accepts about 4.5 MB per request.
const MAX_DIM = 1600;

export async function compressImage(file, { maxDim = MAX_DIM, quality = 0.85 } = {}) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export const compressAll = (files) => Promise.all([...files].map((f) => compressImage(f)));
