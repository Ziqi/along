import { isStudyCard } from "@/lib/class-mode";
import type { RecapCoach } from "@/lib/types";
import { MarkText } from "./handout-blocks";

/** One coach card as it appears in the handout appendix, with its search if any. */
export function CoachPackCard({ card, terms }: { card: RecapCoach; terms?: string[] }) {
  return (
    <article className="flex flex-col gap-3 border border-line bg-elevated px-4 py-4">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted">{isStudyCard(card) ? "剖析" : card.move === "answer" ? "回答" : "开口"}</p>
        <h3 className="text-lg font-medium tracking-tight">{card.topic}</h3>
        {card.topicZh ? <p className="text-sm text-muted">{card.topicZh}</p> : null}
      </header>
      {card.briefEn ? (
        <p className="text-base text-fg text-pretty">
          <MarkText text={card.briefEn} terms={terms} />
        </p>
      ) : null}
      {card.briefZh ? <p className="text-sm text-muted">{card.briefZh}</p> : null}
      {card.options.length ? (
        <ol className="list-decimal space-y-2 pl-5">
          {card.options.map((o) => (
            <li key={o.en} className="pl-1">
              {/* Labels that are just the number would double the list marker. */}
              {o.label && !/^\d+[.、]?$/.test(o.label.trim()) ? <p className="text-sm text-dim">{o.label}</p> : null}
              <p className="text-base">
                <MarkText text={o.en} terms={terms} />
              </p>
              {o.zh ? <p className="text-sm text-muted">{o.zh}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {card.extras.length ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-sm text-dim">延展</p>
          {card.extras.map((o) => (
            <div key={o.en}>
              <p className="text-base">
                <MarkText text={o.en} terms={terms} />
              </p>
              {o.zh ? <p className="text-sm text-muted">{o.zh}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {card.deep ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted">检索</p>
          <h4 className="text-base font-medium">{card.deep.title}</h4>
          {card.deep.viewEn ? (
            <p className="text-base text-pretty">
              <MarkText text={card.deep.viewEn} terms={terms} />
            </p>
          ) : null}
          {card.deep.viewZh ? <p className="text-sm text-muted">{card.deep.viewZh}</p> : null}
          {card.deep.facts.length ? (
            <ol className="list-decimal space-y-1 pl-5">
              {card.deep.facts.map((f) => (
                <li key={f.en} className="text-sm">
                  {f.en}
                  {f.zh ? <span className="block text-muted">{f.zh}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
          {card.deep.aEn ? (
            <p className="text-base text-pretty">
              <MarkText text={card.deep.aEn} terms={terms} />
            </p>
          ) : null}
          {card.deep.aZh ? <p className="text-sm text-muted">{card.deep.aZh}</p> : null}
          {card.deep.terms.length ? (
            <ul className="flex flex-col gap-1">
              {card.deep.terms.map((t) => (
                <li key={t.en} className="text-sm">
                  <span className="font-medium">{t.en}</span>
                  {t.zh ? <span className="text-muted"> · {t.zh}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
