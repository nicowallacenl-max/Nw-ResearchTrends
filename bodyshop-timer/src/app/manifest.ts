import type { MetadataRoute } from "next";

// Installs as a full-screen landscape app that opens straight to the wall board.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bodyshop Job Timer",
    short_name: "Job Board",
    description: "Wall board for clocking time against quote lines",
    start_url: "/board",
    scope: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0c0a09",
    theme_color: "#0c0a09",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
