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
  briefZh: string;
  briefEn: string;
  move: "answer" | "join";
  options: CoachOption[];
  extras: CoachOption[];
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
  contextEn: string;
  contextZh: string;
  viewZh: string;
  viewEn: string;
  angles: EssayTerm[];
  facts: EssayTerm[];
  qZh: string;
  qEn: string;
  aZh: string;
  aEn: string;
  say: string;
  frames: EssayTerm[];
  terms: EssayTerm[];
  sources: EssayTerm[];
  latencyMs: number;
  at: number;
  draft?: boolean;
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

export type RecapStudy = {
  en: string;
  zh: string;
  use: string;
  useZh: string;
  example: string;
  exampleZh: string;
};

export type RecapTableRow = {
  left: string;
  leftZh: string;
  right: string;
  rightZh: string;
};

export type RecapTable = {
  leftHead: string;
  leftHeadZh: string;
  rightHead: string;
  rightHeadZh: string;
  rows: RecapTableRow[];
};

export type RecapSection = {
  heading: string;
  headingZh: string;
  body: string;
  bodyZh: string;
  table?: RecapTable | null;
};

export type RecapDeep = {
  title: string;
  contextEn: string;
  contextZh: string;
  viewEn: string;
  viewZh: string;
  facts: RecapPair[];
  angles: RecapPair[];
  aEn: string;
  aZh: string;
  terms: RecapPair[];
  frames: RecapPair[];
};

export type RecapCoach = {
  topic: string;
  topicZh: string;
  briefEn: string;
  briefZh: string;
  move: "answer" | "join";
  options: CoachOption[];
  extras: CoachOption[];
  deep: RecapDeep | null;
};

export type RecapOutline = {
  heading: string;
  bullets: string[];
};

export type ClassRecap = {
  title: string;
  lede: string;
  ledeZh: string;
  sections: RecapSection[];
  topics: RecapPair[];
  patterns: RecapStudy[];
  lines: RecapStudy[];
  words: RecapStudy[];
  collos: RecapStudy[];
  grammar: RecapStudy[];
  skills: RecapPair[];
  outline: RecapOutline[];
  takeaways: RecapPair[];
  marks: string[];
  coachPack: RecapCoach[];
  draft: boolean;
  latencyMs: number;
  at: number;
};

export type ClassSession = {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  updatedAt: number;
  notes: Jot[];
  recap: ClassRecap | null;
  transcript: { en: string; zh: string }[];
  coaches: CoachCard[];
  essays: Record<string, TopicEssay>;
  sourceId: string | null;
  sourceTitle: string | null;
  starred: boolean;
  starredAt: number | null;
};

export type Bay = null;
export type View = "live" | "recap";

export type MicState = "idle" | "arming" | "live" | "denied" | "unsupported";
