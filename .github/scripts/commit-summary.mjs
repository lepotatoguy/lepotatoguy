// Turn a commit subject into a short, generic task line. Deterministic; no network.
export const MAX_TASK_LENGTH = 48;
export const DEFAULT_PRIVATE_TASK = 'Working';
const ELLIPSIS = '…';
// Connectives that read as dangling before an ellipsis.
const TRAILING_WORDS = /(?:\s+(?:a|an|and|as|at|by|for|from|in|into|of|on|or|so|the|to|when|with))+$/i;
const MAX_PREFIX_PASSES = 5;

// Conventional-commit types: a lead for public subjects, a fixed label for private ones.
const TYPES = {
  fix: ['Fixing', 'Fixing bugs'],
  feat: ['Building', 'Building features'],
  docs: ['Writing docs for', 'Writing docs'],
  refactor: ['Refactoring', 'Refactoring code'],
  test: ['Testing', 'Testing'],
  perf: ['Speeding up', 'Improving performance'],
  chore: ['Maintaining', 'Maintaining'],
  ci: ['Maintaining', 'Maintaining'],
  build: ['Maintaining', 'Maintaining'],
  style: ['Tidying', 'Tidying code'],
  revert: ['Reverting', 'Reverting changes'],
};
// Imperative verbs that read better as their own gerund than behind a type lead.
// Words that are often nouns in a subject (map, log, report) are left out on purpose.
const VERBS = new Set(('accept add adopt align allow apply attach avoid bump cache cap change check clarify clean collapse compute '
  + 'connect convert correct create debug deduplicate define delete deprecate describe detect disable display '
  + 'document draw drop emit enable enforce ensure expand explain export expose extend extract fetch fill finish '
  + 'fix format generate guard handle harden hide highlight ignore implement import improve include initialize '
  + 'install introduce keep launch limit link load make mark match mention migrate move normalize optimize parse '
  + 'persist pin polish populate prefer prepare preserve prevent promote provide prune publish redact reduce '
  + 'refactor refine refresh reject relax remove rename render reorder repair replace require reset resolve '
  + 'respect restore restrict retain retry reuse revert reword rework rewrite run sanitize save scan select send '
  + 'serialize set ship shorten show shrink simplify skip sort split stabilize start stop stream strip support '
  + 'surface swap sync teach test tidy tighten translate trim tune tweak unblock unify unwrap update upgrade use '
  + 'validate verify warn widen wire wrap write').split(' '));
const DOUBLED = new Set(['cap', 'drop', 'emit', 'pin', 'run', 'scan', 'set', 'ship', 'skip', 'stop', 'strip', 'swap', 'trim', 'wrap']);

const CONVENTIONAL = /^([a-z]+)(?:\([^)]*\))?!?:\s*/i;
// Task ids such as "M5.3:", "ABC-12:" or "Issue #1396:"; a dash separator needs a space.
const TASK_ID = /^(?:(?:[Ii]ssue|[Tt]icket|[Tt]ask)\s*#\d+|[A-Z][A-Z0-9]*-?\d+(?:\.\d+)*|#\d+)(?::|\s+-)\s*/;
const TAG = /^\[[^\]]*\]\s*/;
const REFS = [
  /\s*\((?:#\d+[,\s]*)+\)/g, // (#553) (#1530)
  /\s*\b(?:closes|fixes|resolves|refs?|see)\s+#\d+/gi,
  /\s*\b(?:PR|pull request)\s*#\d+/gi,
  /\s*\[skip ci\]/gi,
  /\s*#\d+\s*$/,
];
// XML 1.0 forbids most control characters; entities are escaped at render time.
const CONTROL = /[\u0000-\u001F\u007F]/g;

const firstLine = (message) => String(message ?? '').split(/\r?\n/, 1)[0].replace(CONTROL, '').trim();

function conventionalType(line) {
  const type = line.match(CONVENTIONAL)?.[1]?.toLowerCase();
  return type && Object.hasOwn(TYPES, type) ? type : null;
}

// Strip type, scope, task id and tag prefixes in any order, e.g. "fix: M5.3: ...".
function stripPrefixes(line) {
  let text = line;
  for (let pass = 0; pass < MAX_PREFIX_PASSES; pass++) {
    const next = (conventionalType(text) ? text.replace(CONVENTIONAL, '') : text).replace(TASK_ID, '').replace(TAG, '');
    if (next === text) break;
    text = next;
  }
  return text;
}

function cleanSubject(line) {
  const stripped = REFS.reduce((text, pattern) => text.replace(pattern, ''), stripPrefixes(line));
  return stripped.replace(/\s+/g, ' ').replace(/[\s.,;:!?-]+$/, '').trim();
}

// Map "fixed", "adds", "simplified" back to a known base verb.
function baseVerb(word) {
  const lower = word.toLowerCase();
  const forms = [lower, lower.replace(/ied$/, 'y'), lower.replace(/(.)\1ed$/, '$1'), lower.replace(/ed$/, ''),
    lower.replace(/d$/, ''), lower.replace(/ies$/, 'y'), lower.replace(/es$/, ''), lower.replace(/s$/, '')];
  return forms.find((form) => VERBS.has(form)) || null;
}

function gerund(verb) {
  if (DOUBLED.has(verb)) return `${verb}${verb.at(-1)}ing`;
  if (verb.endsWith('ie')) return `${verb.slice(0, -2)}ying`;
  if (verb.endsWith('e') && !/(?:ee|ye|oe)$/.test(verb)) return `${verb.slice(0, -1)}ing`;
  return `${verb}ing`;
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Cut on a word boundary; a single overlong word is cut hard.
export function truncateWords(text, max = MAX_TASK_LENGTH) {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = chars.slice(0, max - 1).join('');
  const space = head.lastIndexOf(' ');
  const words = space > 0 ? head.slice(0, space).replace(TRAILING_WORDS, '') : head;
  const cut = words.replace(/[\s.,;:!?-]+$/, '');
  return `${cut}${ELLIPSIS}`;
}

// Public repositories: a cleaned, human version of the subject line.
export function summarizeCommit(message) {
  const line = firstLine(message);
  const type = conventionalType(line);
  const subject = cleanSubject(line);
  if (!subject) return type ? TYPES[type][1] : DEFAULT_PRIVATE_TASK;
  const [first, ...rest] = subject.split(' ');
  const verb = baseVerb(first);
  if (verb) return truncateWords([capitalize(gerund(verb)), ...rest].join(' '));
  if (type) return truncateWords(`${TYPES[type][0]} ${subject}`);
  return truncateWords(capitalize(subject));
}

// Private repositories: only the commit type category, never message text.
export function privateTaskLabel(message) {
  const type = conventionalType(firstLine(message));
  return type ? TYPES[type][1] : DEFAULT_PRIVATE_TASK;
}
