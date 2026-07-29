'use client';

import { ACCOUNT_TYPES } from '@/lib/constants/accounting';
import type { ChartOfAccount } from '@/lib/types/accounting';

interface AccountTreeProps {
  tree: (ChartOfAccount & { children: ChartOfAccount[] })[];
  onAddChild?: (parent: ChartOfAccount) => void;
}

export default function AccountTree({ tree, onAddChild }: AccountTreeProps) {
  return (
    <div className="space-y-2">
      {tree.map((node) => (
        <AccountNode key={node.id} node={node} depth={0} onAddChild={onAddChild} />
      ))}
    </div>
  );
}

function AccountNode({
  node,
  depth,
  onAddChild,
}: {
  node: ChartOfAccount & { children: ChartOfAccount[] };
  depth: number;
  onAddChild?: (parent: ChartOfAccount) => void;
}) {
  const typeMeta = ACCOUNT_TYPES.find((type) => type.id === node.account_type);

  return (
    <div>
      <div
        className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-white hover:bg-gray-50"
        style={{ marginRight: depth * 20 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm text-blue-600 shrink-0">{node.code}</span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 truncate">{node.name}</p>
            <p className="text-xs text-gray-500">{typeMeta?.label || node.account_type}</p>
          </div>
        </div>
        {onAddChild && (
          <button
            type="button"
            onClick={() => onAddChild(node)}
            className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 shrink-0"
          >
            + حساب فرعي
          </button>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((child) => (
              <AccountNode key={child.id} node={child as ChartOfAccount & { children: ChartOfAccount[] }} depth={depth + 1} onAddChild={onAddChild} />
            ))}
        </div>
      )}
    </div>
  );
}
