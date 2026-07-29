export function formatCurrency(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `${amount.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ar-SA');
}
