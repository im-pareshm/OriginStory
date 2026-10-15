import { Dialog } from './Dialog';
import { epitaph, fileName, formatDate, formatLifespan, lifespanMs, plural } from '../lore';
import type { CommitEvent, Grave } from '../types';

interface Props {
  grave: Grave;
  commitUrlBase: string | null;
  onClose: () => void;
}

export function GraveDetail({ grave, commitUrlBase, onClose }: Props) {
  const sameWords = grave.born && grave.lastWords && grave.born.hash === grave.lastWords.hash;

  return (
    <Dialog labelledBy="grave-title" onClose={onClose}>
      <p className="eyebrow">In loving memory of</p>
      <h2 id="grave-title">{fileName(grave.path)}</h2>
      <p className="detail-path">{grave.path}</p>
      {grave.formerNames.length > 0 && (
        <p className="detail-aka">Formerly known as {grave.formerNames.map(fileName).join(', ')}</p>
      )}
      <p className="detail-epitaph">“{epitaph(grave)}”</p>

      <dl className="facts">
        <Fact label="Born">{grave.born ? `${formatDate(grave.born.at)} by ${grave.born.author}` : 'Date unknown'}</Fact>
        <Fact label="Died">{`${formatDate(grave.died.at)}, deleted by ${grave.died.author}`}</Fact>
        <Fact label="Lived">{formatLifespan(lifespanMs(grave))}</Fact>
        <Fact label="Size at death">{grave.binary ? 'Binary file' : grave.lines === null ? 'Unknown' : plural(grave.lines, 'line')}</Fact>
        <Fact label="Commits">{plural(grave.touches, 'commit')}</Fact>
        <Fact label="Loved by">{grave.authors.length ? grave.authors.join(', ') : 'Unknown'}</Fact>
      </dl>

      {grave.lifeNumber > 1 && (
        <p className="detail-note">
          This was life number {grave.lifeNumber}. Something at this path had already been deleted before.
        </p>
      )}

      <div className="quotes">
        {grave.born && !sameWords && <Quote title="First words" event={grave.born} commitUrlBase={commitUrlBase} />}
        {grave.lastWords && (
          <Quote title={sameWords ? 'First and last words' : 'Last words'} event={grave.lastWords} commitUrlBase={commitUrlBase} />
        )}
        <Quote title="Cause of death" event={grave.died} commitUrlBase={commitUrlBase} />
      </div>
    </Dialog>
  );
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Quote({ title, event, commitUrlBase }: { title: string; event: CommitEvent; commitUrlBase: string | null }) {
  const shortHash = event.hash.slice(0, 7);
  return (
    <figure className="quote">
      <figcaption>{title}</figcaption>
      <blockquote>{event.message || '(no commit message)'}</blockquote>
      <p className="quote-meta">
        {event.author} · {formatDate(event.at)} ·{' '}
        {commitUrlBase ? (
          <a href={commitUrlBase + event.hash} target="_blank" rel="noreferrer">
            {shortHash}
          </a>
        ) : (
          <code>{shortHash}</code>
        )}
      </p>
    </figure>
  );
}
