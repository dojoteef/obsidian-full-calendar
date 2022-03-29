import { MetadataCache, Vault } from "obsidian";
import { EventFrontmatter } from "src/types";
import { CalendarEvent } from "./Event";

export class ICSEvent extends CalendarEvent {
	id: string;

	static ID_PREFIX = "ics";

	constructor(
		cache: MetadataCache,
		vault: Vault,
		data: EventFrontmatter,
		id: string
	) {
		super(cache, vault, data);
		this.id = id;
	}

	get PREFIX(): string {
		return ICSEvent.ID_PREFIX;
	}

	get identifier(): string {
		return this.id;
	}
}
