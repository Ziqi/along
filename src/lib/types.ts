export type Caption = {
  id: string;
  seq: number;
  at: number;
  en: string;
  zh: string;
  pending: boolean;
  error?: string;
};

export type CoachOption = {
  label: string;
  en: string;
  zh: string;
  keys: string[];
};

export type CoachCard = {
  id: string;
  topic: string;
  topicZh: string;
  move: "answer" | "join";
  options: CoachOption[];
  source: "auto" | "intent";
  prompt: string;
  latencyMs: number;
  at: number;
};

export type Jot = {
  id: string;
  en: string;
  zh: string;
  src: "hand" | "coach" | "deep";
  at: number;
  pending?: boolean;
};

export type EssayTerm = {
  en: string;
  zh: string;
};

export type TopicEssay = {
  title: string;
  viewZh: string;
  viewEn: string;
  qZh: string;
  qEn: string;
  aZh: string;
  aEn: string;
  say: string;
  terms: EssayTerm[];
  latencyMs: number;
  at: number;
};

export type AskTurn = {
  id: string;
  q: string;
  zh: string;
  en: string;
  latencyMs: number;
};

export type AskThread = {
  id: string;
  title: string;
  turns: AskTurn[];
};

export type TxTurn = {
  id: string;
  src: string;
  out: string;
  dir: "zh-en" | "en-zh";
};

export type TxPad = {
  id: string;
  title: string;
  turns: TxTurn[];
};

export type RecapPair = {
  en: string;
  zh: string;
};

export type RecapSection = {
  heading: string;
  body: string;
};

export type ClassRecap = {
  title: string;
  lede: string;
  sections: RecapSection[];
  topics: RecapPair[];
  patterns: RecapPair[];
  lines: RecapPair[];
  words: RecapPair[];
  latencyMs: number;
  at: number;
};

export type ClassSession = {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  notes: Jot[];
  recap: ClassRecap | null;
  transcript: { en: string; zh: string }[];
  sourceId: string | null;
  sourceTitle: string | null;
};

export type Bay = null | "notes";
export type View = "live" | "recap" | "notes";

export type MicState = "idle" | "arming" | "live" | "denied" | "unsupported";
