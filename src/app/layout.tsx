import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '../components/ui/Toast';

export const metadata: Metadata = {
  title: 'GCS CONNECT — Connect Freely. Communicate Securely.',
  description:
    'Enterprise-grade end-to-end encrypted messaging, voice, and video platform by Global Crest Solutions (GCS).',
  icons: {
    icon: '/favicon.ico',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GCS CONNECT',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#121816',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-gcs-bg text-gcs-text overflow-hidden antialiased selection:bg-gcs-emerald/30 selection:text-gcs-mint">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
