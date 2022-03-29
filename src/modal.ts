import { Calendar, EventApi } from "@fullcalendar/core";
import FullCalendarPlugin from "./main";
import { App, Modal, Notice, TFile } from "obsidian";
import * as React from "react";
import * as ReactDOM from "react-dom";
import {
	upsertLocalEvent,
	getFrontmatterFromEvent,
	getFrontmatterFromFile,
} from "./crud";

import { EditEvent } from "./components/EditEvent";
import { AddCalendarSource } from "./components/AddCalendarSource";
import { EventFrontmatter, CalendarSource } from "./types";
import { FULL_CALENDAR_VIEW_TYPE } from "./view";

export class EventModal extends Modal {
	plugin: FullCalendarPlugin;
	event: Partial<EventFrontmatter> | undefined;
	eventId: string | undefined;
	calendar: Calendar | null;

	constructor(
		app: App,
		plugin: FullCalendarPlugin,
		calendar: Calendar | null,
		event?: Partial<EventFrontmatter>,
		eventId?: string
	) {
		super(app);
		this.plugin = plugin;
		this.event = event;
		this.eventId = eventId;
		this.calendar = calendar;
	}

	async editInModal(event: EventApi | TFile) {
		let frontmatter = null;
		if (event instanceof EventApi) {
			frontmatter = await getFrontmatterFromEvent(
				this.app.vault,
				this.app.metadataCache,
				event
			);
			if (frontmatter) {
				this.event = frontmatter;
				this.eventId = event.id;
				this.open();
			} else {
				console.warn(
					"Full Calendar: No frontmatter to edit for selected event."
				);
			}
		} else if (event instanceof TFile) {
			frontmatter = getFrontmatterFromFile(this.app.metadataCache, event);
			this.event = frontmatter || { title: event.basename };
			this.eventId = event.path;
			this.open();
		}
	}

	async onOpen() {
		const { contentEl } = this;
		await this.plugin.loadSettings();

		ReactDOM.render(
			React.createElement(EditEvent, {
				initialEvent: this.event,
				submit: async (event, calendarIndex) => {
					const source = this.plugin.settings.calendarSources.filter(
						(s) => s.type === "local"
					)[calendarIndex];
					if (source.type !== "local") {
						new Notice(
							"Sorry, remote sync is currently read-only."
						);
						this.close();
						return;
					}
					const directory = source.directory;
					const success = await upsertLocalEvent(
						this.app.vault,
						directory,
						event,
						this.eventId
					);
					// await this.plugin.activateView();
					if (success) {
						this.close();
					} else {
						new Notice(
							"Multiple events with the same name on the same day are not yet supported." +
								"Please change the name of your event."
						);
					}
				},
				defaultCalendarIndex: this.plugin.settings.defaultCalendar,
				calendars: this.plugin.settings.calendarSources,
				open:
					this.eventId !== undefined
						? async () => {
								if (this.eventId) {
									let file =
										this.app.vault.getAbstractFileByPath(
											this.eventId
										);
									if (file instanceof TFile) {
										let leaf =
											this.app.workspace.getMostRecentLeaf();
										await leaf.openFile(file);
										this.close();
									}
								}
						  }
						: undefined,
				deleteEvent:
					this.eventId !== undefined
						? async () => {
								if (this.eventId) {
									let file =
										this.app.vault.getAbstractFileByPath(
											this.eventId
										);
									if (file instanceof TFile) {
										await this.app.vault.delete(file);
										this.close();
									}
								}
						  }
						: undefined,
			}),
			contentEl
		);
	}

	onClose() {
		const { contentEl } = this;
		ReactDOM.unmountComponentAtNode(contentEl);
	}
}

export class ReactModal<Props, Component> extends Modal {
	onOpenCallback: () => Promise<ReturnType<typeof React.createElement>>;

	constructor(
		app: App,
		onOpenCallback: () => Promise<ReturnType<typeof React.createElement>>
	) {
		super(app);
		this.onOpenCallback = onOpenCallback;
	}

	async onOpen() {
		const { contentEl } = this;
		ReactDOM.render(await this.onOpenCallback(), contentEl);
	}

	onClose() {
		const { contentEl } = this;
		ReactDOM.unmountComponentAtNode(contentEl);
	}
}
