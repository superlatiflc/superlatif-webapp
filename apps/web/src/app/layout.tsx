import type { ReactNode } from "react";
import "@superlatif/ui/tokens.css";
import "@superlatif/ui/components.css";

export const metadata = {
  title: "Superlatif Web App",
  description: "Repository skeleton (GOV-001). No product surface is implemented yet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="slf-app-shell">{children}</body>
    </html>
  );
}
