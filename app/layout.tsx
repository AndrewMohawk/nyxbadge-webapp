import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = host ? new URL(`${protocol}://${host}`) : undefined;
  const preview = metadataBase ? new URL("/og.png", metadataBase).toString() : "/og.png";

  return {
    metadataBase,
    title: "NYX Badge Control",
    description: "Program a CH583 LED badge directly from desktop Chrome or Edge using WebHID.",
    openGraph: {
      title: "NYX Badge Control",
      description: "No app. No account. No logs. Program your LED badge directly over USB.",
      images: [{ url: preview, width: 1731, height: 909, alt: "NYX Badge Control" }],
    },
    twitter: { card: "summary_large_image", title: "NYX Badge Control", description: "No app. No account. No logs.", images: [preview] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
