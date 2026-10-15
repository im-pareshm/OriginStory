import { useCallback, useMemo, useState } from 'react';
import { formatLifespan, percent, plural } from '../../lore';
import { useCountUp } from '../../motion';
import { ageRange, bandLayers, strataStats } from '../../strata';
import type { Core, FossilsData } from '../../types';
import { CoreDetail } from './CoreDetail';
import { CoreSamples } from './CoreSamples';
import { FossilCard } from './FossilCard';
import { StrataWall } from './StrataWall';

const monthYear = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function Fossils({ data }: { data: FossilsData }) {
  const { repo, layers, cores, fossils, sample, generatedAt } = data;
  const periods = useMemo(() => bandLayers(layers), [layers]);
  const range = useMemo(() => ageRange(layers), [layers]);
  const stats = useMemo(() => strataStats(layers, generatedAt), [layers, generatedAt]);
  const [selected, setSelected] = useState<Core | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const tally = useCountUp(stats?.totalLines ?? 0);

  if (!stats) {
    return (
      <section className="fossils">
        <div className="empty">
          <p className="empty-title">No rock to read.</p>
          <p>This repository has no text files we could date. Maybe it's all images, or all generated.</p>
        </div>
      </section>
    );
  }

  const firstYear = new Date(stats.oldestAt).getUTCFullYear();
  const lastYear = new Date(range[1] - 1).getUTCFullYear();

  return (
    <section className="fossils">
      <div className="gate">
        <h2>
          <span className="tally">{tally.toLocaleString()}</span> {stats.totalLines === 1 ? 'line' : 'lines'} of{' '}
          <a href={repo.url} target="_blank" rel="noreferrer">
            {repo.name}
          </a>{' '}
          still standing
        </h2>
        <p className="gate-meta">
          Laid down {firstYear === lastYear ? `in ${firstYear}` : `from ${firstYear} to ${lastYear}`} · across{' '}
          {plural(sample.blamed, 'file')}
          {repo.branch && ` · ${repo.branch}`}
        </p>
        {!sample.complete && (
          <p className="notice">
            Big dig site: these layers come from a sample of {sample.blamed.toLocaleString()} of the{' '}
            {sample.eligible.toLocaleString()} files, chosen the same way on every visit.
          </p>
        )}
      </div>

      <div className="notables">
        <div className="notable">
          <span className="notable-title">Half-life</span>
          <span className="notable-body">
            Half of this code is older than <strong>{formatLifespan(generatedAt - stats.medianAt)}</strong>
          </span>
        </div>
        <div className="notable">
          <span className="notable-title">Bedrock</span>
          <span className="notable-body">
            The oldest surviving lines were written in <strong>{monthYear(stats.oldestAt)}</strong>
          </span>
        </div>
        <div className="notable">
          <span className="notable-title">Fresh topsoil</span>
          <span className="notable-body">
            <strong>{percent(stats.recentShare)}</strong> was written in the last 12 months
          </span>
        </div>
        {stats.ancientShare > 0 && (
          <div className="notable">
            <span className="notable-title">Ancient rock</span>
            <span className="notable-body">
              <strong>{percent(stats.ancientShare)}</strong> is more than five years old
            </span>
          </div>
        )}
      </div>

      <section className="dig-section" aria-labelledby="cliff-title">
        <h3 id="cliff-title">The cliff face</h3>
        <p className="section-lede">Every line still alive, by when it was written. The oldest rock is at the bottom; thicker layers hold more lines.</p>
        <StrataWall periods={periods} range={range} totalLines={stats.totalLines} />
      </section>

      {fossils.length > 0 && (
        <section className="dig-section" aria-labelledby="hunt-title">
          <h3 id="hunt-title">The fossil hunt</h3>
          <p className="section-lede">The oldest lines that have survived every rewrite since, one per file.</p>
          <div className="fossil-case">
            {fossils.map((fossil, i) => (
              <FossilCard key={fossil.path} fossil={fossil} range={range} now={generatedAt} commitUrlBase={repo.commitUrlBase} index={i} />
            ))}
          </div>
        </section>
      )}

      <section className="dig-section" aria-labelledby="cores-title">
        <h3 id="cores-title">Core samples</h3>
        <p className="section-lede">One core per file, its lines top to bottom, coloured by age. Pick one to see what it's made of.</p>
        <CoreSamples cores={cores} range={range} onOpen={setSelected} />
      </section>

      {selected && (
        <CoreDetail core={selected} range={range} now={generatedAt} commitUrlBase={repo.commitUrlBase} onClose={close} />
      )}
    </section>
  );
}
