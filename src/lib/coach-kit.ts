/** Coach keep/drop rules. Never throw away a written 3+2 just because same=true. */

export function isHeardQuestion(last: string) {
  const t = last.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/[?？]/.test(t)) return true;
  return /^(wh(at|y|o|ere|en|ich)|how|do|does|did|is|are|can|could|would|will|should)(\s|$)/i.test(
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
  if (!input.options.length) return false;
  const prev = input.prev;
  if (!prev) return true;
  const a = optionKey(prev.options);
  const b = optionKey(input.options);
  if (a && a === b) return false;
  if (input.source === "intent") return true;
  const now = input.now ?? Date.now();
  if (prev.prompt === input.lastHeard && now - prev.at < 12000) return false;
  return true;
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

export type CoachUiPhase =
  | "paused"
  | "writing"
  | "retrying"
  | "failed"
  | "ready"
  | "following"
  | "idle";

export function coachUiPhase(input: {
  autoCoach: boolean;
  pending: boolean;
  error: string | null;
  hasCard: boolean;
  hasCaptions: boolean;
}): CoachUiPhase {
  if (input.pending && input.error) return "retrying";
  if (input.pending) return "writing";
  if (input.error) return "failed";
  if (!input.autoCoach) return "paused";
  if (input.hasCard) return "ready";
  if (input.hasCaptions) return "following";
  return "idle";
}

export function coachHeaderLabel(phase: CoachUiPhase) {
  if (phase === "paused") return "已停写";
  if (phase === "writing") return "在写";
  if (phase === "retrying") return "正在重写";
  if (phase === "failed") return "没写出来";
  if (phase === "ready") return "跟上了";
  if (phase === "following") return "跟听中";
  return "待命";
}

export function coachEmptyCopy(
  phase: CoachUiPhase,
  mode: "interactive" | "audit" | "listen",
) {
  if (phase === "writing") {
    if (mode === "listen") return "正在写这一拍：这句、剖析、背景。";
    if (mode === "audit")
      return "正在写。旁听会写成「若要开口」：同意、对比、例子；问句则直接答、补一层、举个例。";
    return "正在写：同意、对比、例子；问句则直接答、补一层、举个例。";
  }
  if (phase === "retrying") return "正在再写一遍。";
  if (phase === "paused") return "已停写。点跟听再写。已经写好的卡还在。";
  if (phase === "failed") return "没写出来。点重写再试。";
  if (phase === "following") {
    if (mode === "listen") return "已经在听。落下完整一句，就写这句、剖析、背景。";
    if (mode === "audit") return "已经在听。落下完整一句，就写成「若要开口」。";
    return "已经在听。落下完整一句，就写三条开口。";
  }
  if (mode === "listen") return "只听。落下值得留的一句，就写这句、剖析、这一拍的背景。点上方主题可跳回。";
  if (mode === "audit")
    return "旁听。你若要接，给同意、对比、例子。问句则直接答、补一层、举个例。";
  return "互动。讨论给同意、对比、例子。问句给直接答、补一层、举个例。";
}

export function humanCoachError(err: string, phase: "retrying" | "failed" = "failed") {
  const t = err.trim();
  const retrying = phase === "retrying";
  if (!t || t === "timeout" || t === "deadline") {
    return retrying ? "这轮慢了，正在重写" : "这轮慢了，点重写再试。";
  }
  if (t === "AI 暂不可用" || /xAI 错误 40[13]/.test(t)) {
    return "教练没接到模型，点重写再试。";
  }
  if (/429/.test(t)) {
    return retrying ? "写得太勤了，正在重写" : "写得太勤了，过几秒再点重写。";
  }
  if (t === "empty") return "再听一句完整的，我再写。";
  return t;
}

/** Failed write while 停写: keep 重写, but say what 跟听 still does. */
export function coachFailHint(autoCoach: boolean) {
  if (autoCoach) return null;
  return "跟听已停。要这一拍，点重写；要继续跟，点跟听。";
}

/** Timeouts and thin cards can retry. A missing model cannot. */
export function isRetryableCoachError(err: string) {
  const t = err.trim();
  if (!t) return true;
  if (t === "AI 暂不可用" || t === "empty") return false;
  if (/没接到模型/.test(t)) return false;
  if (/xAI 错误 40[13]/.test(t)) return false;
  return true;
}
