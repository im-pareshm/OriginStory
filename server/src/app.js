import express from 'express';
import { getFossils } from './fossils.js';
import { getGraveyard } from './graveyard.js';
import { normalizeRepoUrl, UserError } from './url.js';

/**
 * The Express app, without `listen()`. `exhibits` maps each route to the function that
 * builds it; tests pass fakes so they can check routing and error handling offline.
 */
export function createApp({ graveyard = getGraveyard, fossils = getFossils } = {}) {
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
  app.get('/api/graveyard', exhibit(graveyard));
  app.get('/api/fossils', exhibit(fossils));
  return app;
}
