import { Suspense } from 'react';
import { LogViewer } from '@/components/LogViewer';

// LogViewer calls useSearchParams, which requires a Suspense boundary so that
// the static shell can be prerendered while the client hydrates search params.
export default function Home() {
  return (
    <Suspense fallback={<div className="flex-1 bg-zinc-950" />}>
      <LogViewer />
    </Suspense>
  );
}
