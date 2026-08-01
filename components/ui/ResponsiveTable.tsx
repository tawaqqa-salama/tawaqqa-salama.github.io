'use client';

import type { ReactNode } from 'react';

/** يغلف الجداول بتمرير أفقي آمن على الجوال ويمنع كسر التخطيط */
export default function ResponsiveTable({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`responsive-table-wrap ${className}`.trim()}>
      <div className="responsive-table-scroll">{children}</div>
    </div>
  );
}
