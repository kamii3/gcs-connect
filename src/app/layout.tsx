import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'GCS CONNECT — Connect Freely. Communicate Securely.',
  description:
    'Enterprise-grade end-to-end encrypted messaging, voice, and video platform by Global Crest Solutions (GCS).',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-gcs-bg text-gcs-text overflow-hidden antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
