import type { Metadata } from 'next';
import { Urbanist } from 'next/font/google';
import './globals.css';

const urbanist = Urbanist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-urbanist',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ZeroWait — Intelligent Supermarket Checkout & Queue Management',
  description:
    'High-throughput supermarket queue allocation engine and smart shopping cart checkout system.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={urbanist.variable}>
      <body className="font-sans antialiased bg-[#EAF4FF] text-[#0F2A43] min-h-screen">
        {children}
      </body>
    </html>
  );
}
