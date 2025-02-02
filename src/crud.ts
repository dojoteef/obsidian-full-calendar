import { EventApi, EventInput, EventSourceInput } from "@fullcalendar/core";
import { MetadataCache, TFile, TFolder, Vault } from "obsidian";
import { getDate, getTime } from "./dateUtil";
import { modifyFrontmatter, parseFrontmatter } from "./frontmatter";
import {
	EventFrontmatter,
	LocalCalendarSource,
	validateFrontmatter,
} from "./types";

export async function getFileForEvent(
	vault: Vault,
	event: EventApi
): Promise<TFile | null> {
	let filename = event.id;
	let file = vault.getAbstractFileByPath(filename);
	if (file instanceof TFile) {
		return file;
	}
	return null;
}

export function getFrontmatterFromFile(
	cache: MetadataCache,
	file: TFile
): EventFrontmatter | null {
	return validateFrontmatter(cache.getFileCache(file)?.frontmatter);
}

export async function getFrontmatterFromEvent(
	vault: Vault,
	cache: MetadataCache,
	event: EventApi
): Promise<EventFrontmatter | null> {
	let file = await getFileForEvent(vault, event);
	if (!file) {
		return null;
	}
	return getFrontmatterFromFile(cache, file);
}

export function getEventInputFromFile(
	cache: MetadataCache,
	file: TFile
): EventInput | null {
	let frontmatter = getFrontmatterFromFile(cache, file);
	if (!frontmatter) return null;
	if (!frontmatter.title) {
		frontmatter.title = file.basename;
	}
	return parseFrontmatter(file.path, frontmatter);
}

async function createEvent(
	vault: Vault,
	event: EventFrontmatter,
	filename: string
): Promise<TFile | null> {
	if (vault.getAbstractFileByPath(filename)) {
		return null;
	}
	const file = await vault.create(filename, "");
	await modifyFrontmatter(vault, file, event);
	return file;
}

async function updateEvent(
	vault: Vault,
	event: EventFrontmatter,
	filename: string
): Promise<TFile | null> {
	let file = vault.getAbstractFileByPath(filename);
	if (file instanceof TFile) {
		await modifyFrontmatter(vault, file, event);
		return file;
	}

	return null;
}

export function dateEndpointsToFrontmatter(
	start: Date,
	end: Date,
	allDay: boolean
): Partial<EventFrontmatter> {
	const date = getDate(start);
	const endDate = getDate(end);
	return {
		type: "single",
		date,
		endDate: date !== endDate ? endDate : undefined,
		allDay,
		...(allDay
			? {}
			: {
					startTime: getTime(start),
					endTime: getTime(end),
			  }),
	};
}

export async function getEventInputFromPath(
	vault: Vault,
	cache: MetadataCache,
	path: string,
	recursive?: boolean
): Promise<EventInput[] | null> {
	const eventFolder = vault.getAbstractFileByPath(path);
	if (!(eventFolder instanceof TFolder)) {
		return null;
	}

	let events: EventInput[] = [];
	for (let file of eventFolder.children) {
		if (file instanceof TFile) {
			let event = getEventInputFromFile(cache, file);
			if (event) {
				events.push(event);
			}
		} else if (recursive) {
			const childEvents = await getEventInputFromPath(
				vault,
				cache,
				file.path,
				recursive
			);
			if (childEvents) {
				events.push(...childEvents);
			}
		}
	}
	return events;
}

export async function getEventSourceFromLocalSource(
	vault: Vault,
	cache: MetadataCache,
	calendarSource: LocalCalendarSource,
	recursive: boolean
): Promise<EventSourceInput | null> {
	if (!calendarSource.directory) {
		return null;
	}
	const events = await getEventInputFromPath(
		vault,
		cache,
		calendarSource.directory,
		recursive
	);
	if (!events) {
		return null;
	}

	return {
		events,
		textColor: getComputedStyle(document.body).getPropertyValue(
			"--text-on-accent"
		),
		color:
			calendarSource.color ||
			getComputedStyle(document.body).getPropertyValue(
				"--interactive-accent"
			),
	};
}

export function basenameFromEvent(event: EventFrontmatter): string {
	switch (event.type) {
		case "single":
		case undefined:
			return `${event.date} ${event.title}`;
		case "recurring":
			return `(Every ${event.daysOfWeek.join(",")}) ${event.title})`;
	}
}

export const getPathPrefix = (path: string): string =>
	path.split("/").slice(0, -1).join("/");

export async function upsertLocalEvent(
	vault: Vault,
	directory: string,
	event: EventFrontmatter,
	existingFilename?: string
): Promise<boolean> {
	let newFilename = `${directory}/${basenameFromEvent(event)}.md`;
	if (existingFilename) {
		const existingPrefix = getPathPrefix(existingFilename);
		// Files may be inside subdirectories, so don't remove that structure if it's still
		// inside the top directory.
		if (existingPrefix.startsWith(directory)) {
			newFilename = `${existingPrefix}/${basenameFromEvent(event)}.md`;
		}
		if (
			newFilename !== existingFilename &&
			vault.getAbstractFileByPath(newFilename) !== null
		) {
			// If we're changing the filename and a file with that name already
			// exists, return false to indicate failure.
			return false;
		}
		const file = await updateEvent(vault, event, existingFilename);
		// Only rename the file if the names differ to avoid a no-op.
		if (file && newFilename !== existingFilename) {
			await vault.rename(file, newFilename);
		}
		return true;
	} else {
		const file = await createEvent(vault, event, newFilename);
		return file !== null;
	}
}
