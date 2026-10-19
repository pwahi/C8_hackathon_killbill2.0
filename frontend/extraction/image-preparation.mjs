// Prepare a temporary browser canvas; never modify or persist the source file.
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(3, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * Math.max(1, scale));
    canvas.height = Math.round(bitmap.height * Math.max(1, scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = "grayscale(1) contrast(1.25)";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}
