import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

export function formatMissionTime(startedAt: number | null, now: number) {
  if (!startedAt) return "T+ 00:00:00";
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `T+ ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

export function formatClock(ts: number) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatDayTime(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function stampTitle(startedAt: number, topic?: string | null) {
  const stamp = formatDayTime(startedAt);
  const name = String(topic ?? "")
    .replace(stamp, "")
    .replace(/[·•|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 52);
  return name ? `${name} · ${stamp}` : stamp;
}

export function canAutoTitle(current: string, startedAt: number) {
  const stamp = formatDayTime(startedAt);
  const t = current.trim();
  return !t || t === stamp || t.endsWith(stamp);
}

export { extractJsonObject } from "./json-object";

export function topicKey(t: string) {
  return t
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}
