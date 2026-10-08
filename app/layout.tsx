import type { Metadata } from "next";
import "./globals.css";

const title = "Scientific Research Map | Konstantinos C. Makris";
const description =
  "Explore the geographical reach and scientific publications of Professor Konstantinos C. Makris.";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    locale: "en_GB",
    siteName: "Makris Research Map",
  },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
