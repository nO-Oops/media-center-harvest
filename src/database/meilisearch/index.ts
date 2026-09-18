export { createMeilisearchClient, pingClient } from './client';
export {
  INDEX_NAMES,
  MOVIES_SETTINGS,
  SHOWTV_SETTINGS,
  EPISODES_SETTINGS,
  PERSONS_SETTINGS,
  ensureAllIndexes,
} from './indexes';
export { MeilisearchIndexer } from './indexer';
export type { MeilisearchDocument } from './indexer';
export {
  mediaToMovieDocument,
  mediaToShowTvDocument,
  episodeToDocument,
  personToDocument,
} from './mappers';
