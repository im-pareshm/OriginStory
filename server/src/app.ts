import express, { type Express, type Request, type Response } from 'express';
import type { ApiError } from './api-types.ts';
import { getFossils } from './fossils.ts';
import { getGraveyard } from './graveyard.ts';
import { type NormalizedRepo, normalizeRepoUrl, UserError } from './url.ts';

/** Builds one exhibit for a repo. */
export type ExhibitBuilder = (repo: NormalizedRepo) => Promise<unknown>;

export interface Exhibits {
  graveyard: ExhibitBuilder;
  fossils: ExhibitBuilder;
}

/**
 * The Express app, without `listen()`. `exhibits` maps each route to the function that
 * builds it; tests pass fakes so they can check routing and error handling offline.
 */
export function createApp({ graveyard = getGraveyard, fossils = getFossils }: Partial<Exhibits> = {}): Express {
  const app = express();

  /** An exhibit route: `?repo=<link>` in, the exhibit's JSON (or `{ error }`) out. */
  const exhibit = (build: ExhibitBuilder) => async (req: Request, res: Response<unknown | ApiError>) => {
    try {
      const repo = normalizeRepoUrl(req.query.repo);
      res.json(await build(repo));
    } catch (err) {
      if (err instanceof UserError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: 'The excavation hit bedrock. Something went wrong on our side.' });
    }
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/graveyard', exhibit(graveyard));
  app.get('/api/fossils', exhibit(fossils));
  return app;
}
