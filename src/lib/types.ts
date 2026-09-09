export type Caption = {
  id: string;
  seq: number;
  at: number;
  en: string;
  zh: string;
  pending: boolean;
  error?: string;
  /** The recognizer said the utterance ended here: nothing will be joined onto this line. */
  done?: boolean;
};

export type CoachOption = {
  label: string;
  en: string;
  zh: string;
  keys: string[];
};

import type { ClassMode } from "./class-mode";

export type { ClassMode };

export type CoachCard = {
  id: string;
  topic: string;
  topicZh: string;
  briefZh: string;
  briefEn: string;
  move: "answer" | "join";
  mode?: ClassMode;
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
  /** hand = typed; coach / deep = kept from a card; say = 「我想说」 line. */
  src: "hand" | "coach" | "deep" | "say";
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
  /** The card this row was packed from, and when it came; missing on packs written before 脉络. */
  cardId?: string;
  at?: number;
  topic: string;
  topicZh: string;
  briefEn: string;
  briefZh: string;
  move: "answer" | "join";
  mode?: ClassMode;
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

/**
 * One stretch of the class on one topic — the unit of the 课程脉络. Cut from
 * the coach's per-beat topics (a topic change, or eight minutes) without a
 * model; written up (heading, claims) by one Flash call when it closes.
 */
export type ClassSegment = {
  id: string;
  startAt: number;
  /** Null while this is the stretch being heard now. */
  endAt: number | null;
  heading: string;
  headingZh: string;
  /** What the teacher argued in this stretch, 1–3 items; empty until written up. */
  claims: RecapPair[];
  /** Things the teacher told the class to do, when any were said. */
  todo: RecapPair[];
  /** Coach cards that fell inside this stretch, in order. */
  cardIds: string[];
  /** Caption `seq` range covered, inclusive; `seqTo` grows while open. */
  seqFrom: number;
  seqTo: number;
};

export type ClassSession = {
  id: string;
  /** Shape version; see `SESSION_SCHEMA_VERSION`. Missing on rows written before it existed. */
  schemaVersion?: number;
  title: string;
  classMode?: ClassMode;
  startedAt: number;
  endedAt: number | null;
  updatedAt: number;
  notes: Jot[];
  recap: ClassRecap | null;
  transcript: { en: string; zh: string }[];
  coaches: CoachCard[];
  essays: Record<string, TopicEssay>;
  /** The class by topic, in order. Rows written before schema 2 have none. */
  segments: ClassSegment[];
  sourceId: string | null;
  sourceTitle: string | null;
  starred: boolean;
  starredAt: number | null;
};

export type MicState = "idle" | "arming" | "live" | "denied" | "unsupported";
