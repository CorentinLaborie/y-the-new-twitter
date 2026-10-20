import { Suspense } from 'react';
import { LandingGate } from '@/components/landing/landing-gate';

/** "/" is the visitor landing (route table, product doc 11.1). The session is read at request time, inside Suspense. */
export default function LandingPage() {
  return (
    <Suspense fallback={null}>
      <LandingGate />
    </Suspense>
  );
}
