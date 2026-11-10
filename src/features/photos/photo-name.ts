import { CLUB } from "../../club.ts";
import { slug } from "../games/game-format.ts";
import type { Team } from "../teams/team.ts";
import type { Photo } from "./photos-repository.ts";

/** A photo's file name, as it downloads and as Images keeps it: the team, the day it was taken, and its number. */
export const photoFileName = (team: Pick<Team, "code">, photo: Pick<Photo, "id" | "takenAt">) =>
	`${slug(CLUB.nickname)}-${slug(team.code)}-${photo.takenAt.slice(0, 10)}-photo-${photo.id}.jpg`;

/** Several photos downloaded together, named for the day they were downloaded ('YYYY-MM-DD', local). */
export const photosZipName = (team: Pick<Team, "code">, day: string) => `${slug(CLUB.nickname)}-${slug(team.code)}-photos-${day}.zip`;
