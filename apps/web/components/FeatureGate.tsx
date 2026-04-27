'use client';

// Web version: no DB download gate. Always render children.
export default function FeatureGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
