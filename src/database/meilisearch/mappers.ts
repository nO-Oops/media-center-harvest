import { randomUUID } from "crypto";
import { Media, Person, Episode } from "../../models/media";
import {
  MovieDocument,
  ShowTvDocument,
  EpisodeDocument,
  PersonDocument,
} from "../../models/documents";

/** Convertit un Media de type movie/documentary vers un MovieDocument. */
export function mediaToMovieDocument(media: Media): MovieDocument {
  return {
    id: media.id,
    indexName: "movies",
    type: media.kind,
    title: media.title,
    title_fr: media.title_fr ?? "",
    overview: media.overview,
    overview_fr: media.overview_fr ?? "",
    year: media.year ?? null,
    genres: media.genres,
    posterUrls: media.posterUrls,
    backdropUrls: media.backdropUrls,
    cast: media.cast,
    director: media.director ?? "",
    crew: media.crew,
    rating: media.rating,
    tmdb_id: media.tmdbId ?? null,
    imdb_id: media.imdbId ?? null,
    spoken_languages: media.spokenLanguages,
    runtime: media.runtime ?? null,
    video_links: media.videoLinks,
  };
}

/** Convertit un Media de type series vers un ShowTvDocument. */
export function mediaToShowTvDocument(media: Media): ShowTvDocument {
  return {
    id: media.id,
    indexName: "showtv",
    type: media.kind,
    title: media.title,
    overview: media.overview,
    genres: media.genres,
    air_date: media.year ? String(media.year) : null,
    vote_average: media.rating,
    vote_count: 0,
    networks: (media.networks ?? []).join(", "),
    season_number: media.numberOfSeasons ?? 0,
    tmdb_id: media.tmdbId ?? null,
    imdb_id: media.imdbId ?? null,
  };
}

/** Convertit un Episode vers un EpisodeDocument. */
export function episodeToDocument(episode: Episode): EpisodeDocument {
  return {
    id: episode.id,
    indexName: "episodes",
    showtv_id: episode.showId,
    name: episode.name,
    overview: episode.overview,
    air_date: episode.airDate ?? null,
    episode_number: episode.episodeNumber,
    season_number: episode.seasonNumber,
    runtime: episode.runtime ?? null,
    vote_average: 0,
    still_path: episode.thumbnailUrl ?? null,
  };
}

/**
 * Dérive les personnes liées à un média à partir de ses champs `cast`,
 * `director` et `crew`.
 *
 * Utilisée à l'indexation pour créer automatiquement les documents de l'index
 * `persons` (acteurs, réalisateur, équipe) associés à chaque média.
 *
 * Les identifiants sont des **uuid v4** : Meilisearch utilise `id` pour les
 * upserts. Pour un média issu de TMDB, l'uuid est généré une seule fois par le
 * mappeur et partagé entre le membre de cast et son document de l'index
 * `persons` (via `media.personIds`). L'unicité au sein d'une exécution est
 * garantie par le dédoublonnage par nom+rôle (`seen`) ; la déduplication
 * inter-exécutions repose sur d'autres mécanismes (clé stable dans l'orchestrateur
 * pour les médias, agrégation par nom+rôle dans `mergePersons` pour les personnes).
 */
export function personsFromMedia(media: Media): Person[] {
  const mediaId = media.id;
  const persons: Person[] = [];
  const seen = new Set<string>();

  const add = (name: string, type: Person["type"], id?: string): void => {
    const clean = name.trim();
    if (!clean || seen.has(clean)) {
      return;
    }
    seen.add(clean);
    // Réutilise l'uuid v4 généré par le mappeur TMDB quand il est disponible,
    // afin que l'`id` du membre de cast corresponde à l'`id` de son document
    // dans l'index `persons`. Sinon, on génère un uuid v4 aléatoire.
    const personId = id ?? randomUUID();
    persons.push({
      id: personId,
      name: clean,
      type,
      biography: "",
      profileUrl: "",
      knownForMediaIds: [mediaId],
    });
  };

  // Acteurs (cast) : réutilisation des uuid v4 partagés via `media.personIds`.
  for (const member of media.cast) {
    const key = member.name.trim().toLowerCase();
    add(member.name, "actor", media.personIds?.get(key));
  }
  // Réalisateur (film / documentaire / série).
  if (media.director) {
    add(media.director, "director");
  }
  // Équipe technique : chaque membre est indexé comme une personne à part
  // entière, avec un type déduit de son poste (scénariste, producteur…).
  // Le réalisateur est exclu ici car déjà traité ci-dessus.
  for (const { name, job, id } of media.crew) {
    const clean = name.trim();
    if (!clean || clean.toLowerCase() === media.director?.trim().toLowerCase()) {
      continue;
    }
    add(clean, crewJobToType(job), id);
  }

  return persons;
}

/**
 * Dédit le type de personne d'un poste technique TMDB.
 *
 * - « Director » → director
 * - « Writer / Screenplay / Original Writer / Dialogue / Story » → writer
 * - « Producer » (et variantes) → creator
 * - tout autre poste → other
 */
function crewJobToType(job: string): Person["type"] {
  const j = job.trim().toLowerCase();
  if (j.includes("director")) return "director";
  if (
    j.includes("writer") ||
    j.includes("screenplay") ||
    j.includes("dialogue") ||
    j.includes("story")
  ) {
    return "writer";
  }
  if (j.includes("producer")) {
    return "creator";
  }
  return "other";
}

/** Convertit une Person vers une PersonDocument. */
export function personToDocument(person: Person): PersonDocument {
  return {
    id: person.id,
    indexName: "persons",
    name: person.name,
    type: person.type,
    biography: person.biography,
    profileUrl: person.profileUrl,
    knownForMediaIds: person.knownForMediaIds,
    birthday: person.birthday ?? null,
    deathday: person.deathday ?? null,
    gender: person.gender ?? null,
    place_of_birth: person.place_of_birth ?? null,
    popularity: person.popularity ?? null,
    knownForDepartment: person.knownForDepartment ?? null,
  };
}
