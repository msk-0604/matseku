import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "リペアコール",
    short_name: "リペアコール",
    description: "マツエクサロン向け 再来店自動化サービス",
    start_url: "/app/customers",
    scope: "/app",
    display: "standalone",
    background_color: "#faf8f9",
    theme_color: "#c22f69",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
