import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'sharp',
    'tesseract.js',
    'pdf-parse',
    'pdf-lib',
    'pdfjs-dist',
    'better-sqlite3',
    'canvas',
    'ppu-paddle-ocr',
  ],
};

export default nextConfig;
