import React from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { QueueEngineView } from '@/components/queue/QueueEngineView';

export const metadata = {
  title: 'ZeroWait — Checkout Queue Engine',
  description: 'Intelligent checkout queue allocation and workload balancing station.',
};

export default function QueuePage() {
  return (
    <div className="min-h-screen bg-[#EAF4FF] text-[#0F2A43] flex flex-col font-sans">
      <AppHeader />
      <main className="flex-1">
        <QueueEngineView />
      </main>
    </div>
  );
}
