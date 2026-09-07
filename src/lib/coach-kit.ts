/** Coach keep/drop rules. Never throw away a written 3+2 just because same=true. */

export function isHeardQuestion(last: string) {
  const t = last.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/[?？]/.test(t)) return true;
  return /^(wh(at|y|o|ere|en|ich)|how|do |does |did |is |are |can |could |would |will |should )/i.test(
    t,
  );
}

export function resolveCoachSame(input: {
  modelSame: unknown;
  move: "answer" | "join";
  lastHeard: string;
}) {
  if (input.move === "answer" || isHeardQuestion(input.lastHeard)) return false;
  return input.modelSame === true || input.modelSame === "true";
}

export function shouldAskCoach(input: {
  last: string;
  now?: number;
  minGapMs?: number;
  prev: { prompt: string; at: number } | null;
}) {
  const last = input.last.replace(/\s+/g, " ").trim();
  const words = last.split(/\s+/).filter(Boolean);
  const q = isHeardQuestion(last);
  if (words.length < 6 && !q) return false;
  const prev = input.prev;
  if (!prev) return true;
  const now = input.now ?? Date.now();
  if (prev.prompt === last && now - prev.at < 12000) return false;
  if (now - prev.at < (input.minGapMs ?? 3000)) return false;
  return true;
}

function optionKey(options: { en: string }[]) {
  return options
    .map((o) => o.en.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean)
    .join("\n");
}

export function shouldKeepCoachCard(input: {
  source: "auto" | "intent";
  lastHeard: string;
  now?: number;
  prev: { prompt: string; options: { en: string }[]; at: number } | null;
  options: { en: string }[];
}) {
  if (input.source === "intent") return true;
  if (!input.options.length) return false;
  const prev = input.prev;
  if (!prev) return true;
  const now = input.now ?? Date.now();
  if (prev.prompt === input.lastHeard && now - prev.at < 12000) return false;
  const a = optionKey(prev.options);
  const b = optionKey(input.options);
  return !(a && a === b);
}

export function shouldRescueCoach(input: {
  autoCoach: boolean;
  listening: boolean;
  inflight: boolean;
  lastCaptionAt: number | null;
  lastCoachOkAt: number;
  now?: number;
}) {
  if (!input.autoCoach || !input.listening || input.inflight) return false;
  if (input.lastCaptionAt == null) return false;
  const now = input.now ?? Date.now();
  if (now - input.lastCaptionAt > 20000) return false;
  const silentFor = input.lastCoachOkAt
    ? now - input.lastCoachOkAt
    : now - input.lastCaptionAt;
  return silentFor >= 16000;
}
