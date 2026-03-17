export function parseNaturalAmount(input: string): number | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();

  const numMatch = cleaned.replace(/[$,]/g, '').match(/^(\d+(?:\.\d{1,2})?)$/);
  if (numMatch) return Math.round(parseFloat(numMatch[1]) * 100);

  const dollarMatch = cleaned.match(/^(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)$/);
  if (dollarMatch) return Math.round(parseFloat(dollarMatch[1]) * 100);

  const wordNumbers: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  };

  const words = cleaned.replace(/[-]/g, ' ').replace(/\s*(dollars?|bucks?)\s*/g, '').trim().split(/\s+/);
  let total = 0;
  let current = 0;
  for (const w of words) {
    const val = wordNumbers[w];
    if (val === undefined) return null;
    if (val === 100) {
      current = (current || 1) * 100;
    } else {
      current += val;
    }
  }
  total += current;
  if (total > 0) return total * 100;

  const kMatch = cleaned.replace(/[$]/g, '').match(/^(\d+(?:\.\d+)?)\s*k$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000 * 100);

  return null;
}

export function parseNaturalDate(input: string): string | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();
  const now = new Date();

  if (cleaned === 'today') return toDateStr(now);
  if (cleaned === 'yesterday') return toDateStr(addDays(now, -1));
  if (cleaned === 'tomorrow') return toDateStr(addDays(now, 1));

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const lastMatch = cleaned.match(/^last\s+(\w+)$/);
  if (lastMatch) {
    const dayIdx = dayNames.indexOf(lastMatch[1]);
    if (dayIdx !== -1) {
      const diff = (now.getDay() - dayIdx + 7) % 7 || 7;
      return toDateStr(addDays(now, -diff));
    }
    if (lastMatch[1] === 'week') return toDateStr(addDays(now, -7));
    if (lastMatch[1] === 'month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return toDateStr(d);
    }
  }

  const nextMatch = cleaned.match(/^next\s+(\w+)$/);
  if (nextMatch) {
    const dayIdx = dayNames.indexOf(nextMatch[1]);
    if (dayIdx !== -1) {
      const diff = (dayIdx - now.getDay() + 7) % 7 || 7;
      return toDateStr(addDays(now, diff));
    }
  }

  const months: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  const monthMatch = cleaned.match(/^(\w+)\s+(\d{1,2})(?:,?\s*(\d{4}|\d{2}))?$/);
  if (monthMatch && months[monthMatch[1]] !== undefined) {
    let year = monthMatch[3] ? parseInt(monthMatch[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    return toDateStr(new Date(year, months[monthMatch[1]], parseInt(monthMatch[2])));
  }

  return null;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}
