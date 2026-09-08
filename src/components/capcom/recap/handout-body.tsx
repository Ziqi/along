import { isStudyAppendix, recapAppendixCopy } from "@/lib/class-mode";
import type { RecapStage } from "@/lib/recap-stage";
import type { ClassRecap, ClassSession } from "@/lib/types";
import { CoachPackCard } from "./coach-pack-card";
import { ContrastTable, EditText, MarkText, PairList, PairOl, ProseBlocks } from "./handout-blocks";
import { useHandoutMarks } from "./handout-marks";
import { LiveTape } from "./live-tape";
import { NotesEditor } from "./notes-editor";
import { RecapProgress } from "./recap-progress";
import { StudyCards } from "./study-cards";

/**
 * The paper below the title: essay, language points, appendix, notes, tape.
 * `editing` swaps the prose for textareas that save on blur.
 */
export function HandoutBody({
  session,
  editing,
  pending,
  stage,
  error,
  liveLines,
  onPatch,
}: {
  session: ClassSession;
  editing: boolean;
  pending: boolean;
  stage: RecapStage | null;
  error: string | null;
  /** Captions of the class being heard, when this is that class. */
  liveLines: { en: string; zh: string }[] | null;
  onPatch: (patch: Partial<ClassRecap>) => void;
}) {
  const recap = session.recap ?? null;
  const sections = recap?.sections ?? [];
  const patterns = recap?.patterns ?? [];
  const lines = recap?.lines ?? [];
  const words = recap?.words ?? [];
  const collos = recap?.collos ?? [];
  const grammar = recap?.grammar ?? [];
  const skills = recap?.skills ?? [];
  const topics = recap?.topics ?? [];
  const outline = recap?.outline ?? [];
  const takeaways = recap?.takeaways ?? [];
  const coachPack = recap?.coachPack ?? [];
  const appendix = recapAppendixCopy(isStudyAppendix(session.classMode, coachPack));
  const living = !session.endedAt;
  const marks = useHandoutMarks(recap);

  return (
    <>
      {error ? <p className="border border-line bg-elevated px-4 py-3 text-sm text-abort">{error} 点上面「整理本堂」。</p> : null}
      {pending ? <RecapProgress stage={stage} /> : null}
      {!pending && recap?.draft && !recap.lede && !sections.length ? (
        <p className="text-base leading-relaxed text-muted">目录不是讲义。正文失败会自动再写。不要停在这一页当完成稿。</p>
      ) : null}

      {recap?.lede || sections.length || takeaways.length ? <p className="text-sm text-muted">本堂内容</p> : null}

      {recap?.lede || editing ? (
        <section className="flex flex-col gap-2">
          {editing ? (
            <>
              <EditText value={recap?.lede ?? ""} rows={4} className="text-lg leading-8 text-fg" onSave={(lede) => onPatch({ lede })} />
              <EditText
                value={recap?.ledeZh ?? ""}
                rows={3}
                className="text-sm leading-relaxed text-muted"
                onSave={(ledeZh) => onPatch({ ledeZh })}
              />
            </>
          ) : recap?.lede ? (
            <>
              <p className="text-lg leading-8 text-fg text-pretty">
                <MarkText text={recap.lede} terms={marks} />
              </p>
              {recap.ledeZh ? <p className="text-sm leading-relaxed text-muted text-pretty">{recap.ledeZh}</p> : null}
            </>
          ) : null}
        </section>
      ) : null}

      {takeaways.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-medium tracking-tight">要点</h2>
          <PairOl items={takeaways} terms={marks} />
        </section>
      ) : null}

      {sections.map((sec, i) => (
        <section key={`${sec.heading}-${i}`} className="flex flex-col gap-2">
          {editing ? (
            <>
              <EditText
                value={sec.heading}
                rows={1}
                className="text-xl font-medium tracking-tight"
                onSave={(heading) => onPatch({ sections: sections.map((s, n) => (n === i ? { ...s, heading } : s)) })}
              />
              <EditText
                value={sec.headingZh}
                rows={1}
                className="text-sm text-muted"
                onSave={(headingZh) => onPatch({ sections: sections.map((s, n) => (n === i ? { ...s, headingZh } : s)) })}
              />
              <EditText
                value={sec.body}
                rows={Math.min(10, Math.max(4, sec.body.split("\n").length + 1))}
                className="text-base leading-8 text-fg"
                onSave={(body) => onPatch({ sections: sections.map((s, n) => (n === i ? { ...s, body } : s)) })}
              />
              <EditText
                value={sec.bodyZh}
                rows={4}
                className="text-sm leading-relaxed text-muted"
                onSave={(bodyZh) => onPatch({ sections: sections.map((s, n) => (n === i ? { ...s, bodyZh } : s)) })}
              />
              {sec.table ? <ContrastTable table={sec.table} /> : null}
            </>
          ) : (
            <>
              <h2 className="text-xl font-medium tracking-tight text-balance">
                {i + 1}. {sec.heading}
              </h2>
              {sec.headingZh ? <p className="text-sm text-muted">{sec.headingZh}</p> : null}
              <ProseBlocks text={sec.body} terms={marks} />
              {sec.table ? <ContrastTable table={sec.table} /> : null}
              {sec.bodyZh ? <ProseBlocks text={sec.bodyZh} muted /> : null}
            </>
          )}
        </section>
      ))}

      {outline.length && !sections.length ? (
        <p className="text-base leading-relaxed text-muted">只有目录，还没有讲义正文。点上面「整理本堂」再写一遍。</p>
      ) : living && !recap && !pending ? (
        <p className="text-base leading-relaxed text-muted">听进几句之后，提纲会落在这里。现在也可以先补一条随手记。</p>
      ) : null}

      {topics.length && !sections.length ? <PairList kicker="主题" items={topics} /> : null}

      {words.length || collos.length || patterns.length || grammar.length || lines.length || skills.length ? (
        <section className="flex flex-col gap-8 border-t border-line pt-8">
          <div>
            <p className="text-sm text-muted">语言点</p>
            <h2 className="mt-2 text-xl font-medium tracking-tight">语言点</h2>
            <p className="mt-1 text-sm text-muted">从这一堂里抽出的词、搭配、句式。每条都能指回刚听过的说法，并带用法和例句。</p>
          </div>
          <StudyCards kicker="单词" items={words} editing={editing} onChange={(next) => onPatch({ words: next })} />
          <StudyCards kicker="搭配" items={collos} editing={editing} onChange={(next) => onPatch({ collos: next })} />
          <StudyCards kicker="句式" items={patterns} editing={editing} onChange={(next) => onPatch({ patterns: next })} />
          <StudyCards kicker="语法" items={grammar} editing={editing} onChange={(next) => onPatch({ grammar: next })} />
          <StudyCards kicker="好例句" items={lines} editing={editing} onChange={(next) => onPatch({ lines: next })} />
          {skills.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-medium tracking-tight">{appendix.skills}</h3>
              <PairOl items={skills} terms={marks} />
            </div>
          ) : null}
        </section>
      ) : null}

      {coachPack.length ? (
        <section className="flex flex-col gap-8 border-t border-line pt-8">
          <div>
            <p className="text-sm text-muted">{appendix.part}</p>
            <h2 className="mt-2 text-xl font-medium tracking-tight">{appendix.heading}</h2>
            <p className="mt-1 text-sm text-muted">{appendix.blurb}</p>
          </div>
          {coachPack.map((card, i) => (
            <CoachPackCard key={`${card.topic}-${i}`} card={card} terms={marks} />
          ))}
        </section>
      ) : null}

      <NotesEditor session={session} />

      <LiveTape lines={liveLines && liveLines.length ? liveLines : session.transcript} />
    </>
  );
}
