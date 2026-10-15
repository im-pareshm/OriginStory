import express from 'express';
import { getFossils } from './fossils.js';
import { getGraveyard } from './graveyard.js';
import { normalizeRepoUrl, UserError } from './url.js';

const PORT = Number(process.env.PORT) || 3001;
const app = express();

/** An exhibit route: `?repo=<link>` in, the exhibit's JSON (or `{ error }`) out. */
const exhibit = (build) => async (req, res) => {
  try {
    const repo = normalizeRepoUrl(req.query.repo);
    res.json(await build(repo));
  } catch (err) {
    if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'The excavation hit bedrock. Something went wrong on our side.' });
  }
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/graveyard', exhibit(getGraveyard));
app.get('/api/fossils', exhibit(getFossils));

app.listen(PORT, () => {
  console.log(`Repo Museum API listening on http://localhost:${PORT}`);
});
