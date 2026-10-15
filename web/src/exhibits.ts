import { FOSSIL_LOADING_LINES, LOADING_LINES } from './lore';

export type ExhibitId = 'graveyard' | 'fossils';

export interface ExhibitInfo {
  id: ExhibitId;
  numeral: string;
  title: string;
  lede: string;
  action: string;
  loadingLines: string[];
}

export const EXHIBITS: ExhibitInfo[] = [
  {
    id: 'graveyard',
    numeral: 'I',
    title: 'The File Graveyard',
    lede: "Paste any public Git repository. We'll dig up every file it ever deleted and give each one a proper burial.",
    action: 'Visit the graveyard',
    loadingLines: LOADING_LINES,
  },
  {
    id: 'fossils',
    numeral: 'II',
    title: 'Code Fossils',
    lede: "Paste any public Git repository. We'll date every line still alive and lay the code out like layers of rock, oldest at the bottom.",
    action: 'Start the dig',
    loadingLines: FOSSIL_LOADING_LINES,
  },
];

export const DEFAULT_EXHIBIT: ExhibitId = 'graveyard';

export const exhibitInfo = (id: ExhibitId) => EXHIBITS.find((e) => e.id === id)!;

export const parseExhibit = (value: string | null): ExhibitId =>
  EXHIBITS.some((e) => e.id === value) ? (value as ExhibitId) : DEFAULT_EXHIBIT;
