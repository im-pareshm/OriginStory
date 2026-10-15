import express from 'express';
import { getGraveyard } from './graveyard.js';
import { normalizeRepoUrl, UserError } from './url.js';

const PORT = Number(process.env.PORT) || 3001;
const app = express();

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/graveyard', async (req, res) => {
  try {
    const repo = normalizeRepoUrl(req.query.repo);
    res.json(await getGraveyard(repo));
  } catch (err) {
    if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'The gravediggers hit bedrock. Something went wrong on our side.' });
  }
});

app.listen(PORT, () => {
  console.log(`Repo Museum API listening on http://localhost:${PORT}`);
});
