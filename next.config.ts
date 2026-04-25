import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist references optional 'canvas' package (only needed for image rendering, not text extraction)
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
