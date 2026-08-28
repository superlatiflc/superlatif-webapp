import type { ReactNode } from "react";

export const metadata = {
  title: "Superlatif Web App",
  description: "Repository skeleton (GOV-001). No product surface is implemented yet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
