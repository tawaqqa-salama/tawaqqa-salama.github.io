const ONES = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

const HUNDREDS = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];

function joinParts(parts: string[]): string {
  return parts.filter(Boolean).join(' و');
}

function twoDigits(n: number): string {
  if (n <= 0) return '';
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  if (!one) return TENS[ten];
  return `${ONES[one]} و${TENS[ten]}`;
}

function threeDigits(n: number): string {
  if (n <= 0) return '';
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return joinParts([HUNDREDS[hundred], twoDigits(rest)]);
}

function scaleWord(n: number, singular: string, dual: string, plural: string): string {
  if (n === 1) return singular;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return `${threeDigits(n)} ${plural}`;
  return `${threeDigits(n)} ${singular}`;
}

function convertInteger(n: number): string {
  if (n === 0) return 'صفر';
  if (n < 0) return `سالب ${convertInteger(Math.abs(n))}`;

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const remainder = n % 1000;

  if (millions) parts.push(scaleWord(millions, 'مليون', 'مليونان', 'ملايين'));
  if (thousands) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(`${threeDigits(thousands)} آلاف`);
    else parts.push(`${threeDigits(thousands)} ألف`);
  }
  if (remainder) parts.push(threeDigits(remainder));

  return joinParts(parts);
}

/** تفقيط المبلغ بالريال السعودي (مثال: أحد عشر ألف وخمسمائة ريال فقط) */
export function amountToArabicWords(amount: number): string {
  const safe = Math.round((Number(amount) || 0) * 100) / 100;
  const riyals = Math.floor(safe);
  const halalas = Math.round((safe - riyals) * 100);

  let text = `${convertInteger(riyals)} ريال`;
  if (halalas > 0) {
    text += ` و${convertInteger(halalas)} هللة`;
  }
  return `${text} فقط`;
}
