import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'onnxruntime-node',
    'ppu-paddle-ocr',
    'canvas',
    'sharp',
    'tesseract.js',
    'pdf-parse'
  ],
};

export default nextConfig;
