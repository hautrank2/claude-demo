import "./globals.css";

export const metadata = { title: "Claude demos" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
