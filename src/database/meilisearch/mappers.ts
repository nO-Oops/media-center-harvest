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
    cast: media.cast,
    director: media.director ?? "",
    crew: media.crew,
    rating: media.rating,
    posterUrls: media.posterUrls,
    backdropUrls: media.backdropUrls,
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
 * Les identifiants sont des **uuid v4** aléatoires : une même personne liée au
 * même média produira un `id` différent à chaque exécution, garantissant
 * l'unicité des documents de l'index `persons`.
 */
export function personsFromMedia(media: Media): Person[] {
  const mediaId = media.id;
  const persons: Person[] = [];
  const seen = new Set<string>();

  const add = (name: string, type: Person["type"]): void => {
    const clean = name.trim();
    if (!clean || seen.has(clean)) {
      return;
    }
    seen.add(clean);
    const id = randomUUID();
    persons.push({
      id,
      name: clean,
      type,
      biography: "",
      profileUrl: "",
      knownForMediaIds: [mediaId],
    });
  };

  // Acteurs (cast).
  for (const name of media.cast) {
    add(name, "actor");
  }
  // Réalisateur (film / documentaire / série).
  if (media.director) {
    add(media.director, "director");
  }
  // Équipe technique (réalisateur exclu, déjà traité : scénaristes, producteur…).
  for (const name of media.crew) {
    if (name.trim() === media.director?.trim()) {
      continue;
    }
    add(name, "writer");
  }

  return persons;
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
