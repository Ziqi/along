export type RecapStage = "essay" | "essay-retry" | "study";

export function recapStageView(stage: RecapStage | null) {
  if (stage === "study") {
    return { step: 2, of: 2, label: "导语已上纸，在写语言点" };
  }
  if (stage === "essay-retry") {
    return { step: 1, of: 2, label: "正文太薄，正在重写导语和章节" };
  }
  return { step: 1, of: 2, label: "在写导语和章节" };
}
