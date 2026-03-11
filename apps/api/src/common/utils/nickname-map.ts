/**
 * Common English nickname ↔ full name mappings.
 * Each entry maps a nickname to its formal variant(s) and vice versa.
 */
const NICKNAME_PAIRS: [string, string[]][] = [
  ['william', ['bill', 'will', 'billy', 'willy', 'liam']],
  ['robert', ['bob', 'bobby', 'rob', 'robbie']],
  ['richard', ['rick', 'dick', 'rich', 'ricky']],
  ['james', ['jim', 'jimmy', 'jamie']],
  ['john', ['jack', 'johnny', 'jon']],
  ['michael', ['mike', 'mikey', 'mick']],
  ['thomas', ['tom', 'tommy']],
  ['charles', ['charlie', 'chuck', 'chas']],
  ['joseph', ['joe', 'joey']],
  ['edward', ['ed', 'eddie', 'ted', 'teddy', 'ned']],
  ['christopher', ['chris', 'kit']],
  ['daniel', ['dan', 'danny']],
  ['matthew', ['matt', 'matty']],
  ['andrew', ['andy', 'drew']],
  ['benjamin', ['ben', 'benny']],
  ['nicholas', ['nick', 'nicky']],
  ['alexander', ['alex', 'xander']],
  ['jonathan', ['jon', 'jonny']],
  ['patrick', ['pat', 'paddy']],
  ['samuel', ['sam', 'sammy']],
  ['timothy', ['tim', 'timmy']],
  ['stephen', ['steve', 'stevie']],
  ['steven', ['steve', 'stevie']],
  ['kenneth', ['ken', 'kenny']],
  ['gregory', ['greg', 'gregg']],
  ['lawrence', ['larry', 'lars']],
  ['raymond', ['ray']],
  ['anthony', ['tony']],
  ['phillip', ['phil']],
  ['donald', ['don', 'donny']],
  ['elizabeth', ['liz', 'lizzy', 'beth', 'betty', 'eliza']],
  ['katherine', ['kate', 'katie', 'kathy', 'kat']],
  ['catherine', ['kate', 'katie', 'cathy', 'cat']],
  ['jennifer', ['jen', 'jenny']],
  ['margaret', ['maggie', 'meg', 'peggy', 'marge']],
  ['rebecca', ['becca', 'becky']],
  ['jessica', ['jess', 'jessie']],
  ['amanda', ['mandy']],
  ['patricia', ['pat', 'patty', 'trish']],
  ['victoria', ['vicky', 'tori']],
  ['alexandra', ['alex', 'lexi']],
  ['christina', ['chris', 'tina', 'christy']],
  ['suzanne', ['sue', 'suzy']],
  ['deborah', ['deb', 'debbie']],
  ['barbara', ['barb', 'barbie']],
  ['dorothy', ['dot', 'dottie']],
  ['natalie', ['nat']],
  ['zachary', ['zach', 'zack']],
  ['nathan', ['nate']],
  ['theodore', ['theo', 'ted']],
  ['frederick', ['fred', 'freddie']],
];

// Build a lookup map: name → all variants (including itself)
const NICKNAME_MAP = new Map<string, Set<string>>();

for (const [formal, nicknames] of NICKNAME_PAIRS) {
  // Link formal → all nicknames
  const all = [formal, ...nicknames];
  for (const name of all) {
    if (!NICKNAME_MAP.has(name)) {
      NICKNAME_MAP.set(name, new Set());
    }
    for (const variant of all) {
      if (variant !== name) {
        NICKNAME_MAP.get(name)!.add(variant);
      }
    }
  }
}

/**
 * Given a first name, return all known nickname variants (lowercase).
 * Returns empty array if no nicknames found.
 */
export function resolveNicknames(name: string): string[] {
  const lower = name.toLowerCase().trim();
  const variants = NICKNAME_MAP.get(lower);
  return variants ? Array.from(variants) : [];
}

export { NICKNAME_MAP };
