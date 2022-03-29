import "./overrides.css";
import {
	ItemView,
	Notice,
	request,
	TFile,
	TFolder,
	WorkspaceLeaf,
} from "obsidian";
import { Calendar, EventSourceInput } from "@fullcalendar/core";
import { IcalExpander } from "vendor/fullcalendar-ical/ical-expander/IcalExpander";
import * as ReactDOM from "react-dom";
import { createElement } from "react";

import * as dav from "dav";
import * as transport from "./transport";
import { renderCalendar } from "./calendar";
import FullCalendarPlugin from "./main";
import { EventModal } from "./modal";
import {
	upsertLocalEvent,
	dateEndpointsToFrontmatter,
	getEventInputFromFile,
	getEventSourceFromLocalSource,
	getFileForEvent,
	getPathPrefix,
} from "./crud";
import {
	CalendarSource,
	GoogleCalendarSource,
	ICalSource,
	CalDAVSource,
	LocalCalendarSource,
	PLUGIN_SLUG,
} from "./types";
import { eventApiToFrontmatter } from "./frontmatter";
import {
	expandICalEvents,
	makeICalExpander,
} from "vendor/fullcalendar-ical/icalendar";
import { addCalendarButton } from "./settings";

export const FULL_CALENDAR_VIEW_TYPE = "full-calendar-view";

export class CalendarView extends ItemView {
	calendar: Calendar | null;
	plugin: FullCalendarPlugin;
	cacheCallback: (file: TFile) => void;
	constructor(leaf: WorkspaceLeaf, plugin: FullCalendarPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.calendar = null;
		this.cacheCallback = this.onCacheUpdate.bind(this);
	}

	getViewType() {
		return FULL_CALENDAR_VIEW_TYPE;
	}

	getDisplayText() {
		return "Calendar";
	}

	onCacheUpdate(file: TFile) {
		const calendar = this.plugin.settings.calendarSources.find(
			(c) => c.type === "local" && file.path.startsWith(c.directory)
		);

		let calendarEvent = this.calendar?.getEventById(file.path);
		let newEventData = getEventInputFromFile(this.app.metadataCache, file);
		if (calendar && newEventData !== null) {
			if (calendarEvent) {
				calendarEvent.remove();
			}
			this.calendar?.addEvent({
				color:
					calendar.color ||
					getComputedStyle(document.body).getPropertyValue(
						"--interactive-accent"
					),
				textColor: getComputedStyle(document.body).getPropertyValue(
					"--text-on-accent"
				),
				...newEventData,
			});
		}
	}

	async onOpen() {
		await this.plugin.loadSettings();
		const sources = (
			(
				await Promise.all(
					this.plugin.settings.calendarSources
						.filter((s) => s.type === "local")
						.map((source) =>
							getEventSourceFromLocalSource(
								this.app.vault,
								this.app.metadataCache,
								source as LocalCalendarSource, // Cast necessary because Array.filter doesn't narrow the type on a tagged union.
								this.plugin.settings.recursiveLocal
							)
						)
				)
			)
				// Filter does not narrow types :(
				.filter((s) => s !== null) as EventSourceInput[]
		).concat(
			this.plugin.settings.calendarSources
				.filter((s) => s.type === "gcal")
				.map((gcalSource) => ({
					editable: false,
					googleCalendarId: (gcalSource as GoogleCalendarSource).url,
					textColor: getComputedStyle(document.body).getPropertyValue(
						"--text-on-accent"
					),
					color:
						gcalSource.color ||
						getComputedStyle(document.body).getPropertyValue(
							"--interactive-accent"
						),
				}))
		);

		const container = this.containerEl.children[1];
		container.empty();
		let calendarEl = container.createEl("div");

		if (
			!sources ||
			(sources.length === 0 &&
				this.plugin.settings.calendarSources.filter(
					(s) => s.type === "ical" || s.type === "caldav" || s.type === "icloud"
				).length === 0)
		) {
			calendarEl.style.height = "100%";
			const nocal = calendarEl.createDiv();
			nocal.style.height = "100%";
			nocal.style.display = "flex";
			nocal.style.alignItems = "center";
			nocal.style.justifyContent = "center";
			const notice = nocal.createDiv();
			notice.createEl("h1").textContent = "No calendar available";
			notice.createEl("p").textContent =
				"Thanks for downloading Full Calendar! Create a calendar below to begin.";

			const container = notice.createDiv();
			container.style.position = "fixed";
			addCalendarButton(
				this.app,
				this.plugin,
				container,
				async (source: CalendarSource) => {
					const { calendarSources } = this.plugin.settings;
					calendarSources.push(source);
					await this.plugin.saveSettings();
					await this.plugin.activateView();
				}
			);
			return;
		}

		this.calendar = renderCalendar(calendarEl, sources, {
			eventClick: async (info) => {
				if (
					info.jsEvent.getModifierState("Control") ||
					info.jsEvent.getModifierState("Meta")
				) {
					let file = this.app.vault.getAbstractFileByPath(
						info.event.id
					);
					if (file instanceof TFile) {
						let leaf = this.app.workspace.getMostRecentLeaf();
						await leaf.openFile(file);
					}
				} else {
					new EventModal(
						this.app,
						this.plugin,
						this.calendar
					).editInModal(info.event);
				}
			},
			select: async (start, end, allDay) => {
				const partialEvent = dateEndpointsToFrontmatter(
					start,
					end,
					allDay
				);
				let modal = new EventModal(
					this.app,
					this.plugin,
					this.calendar,
					partialEvent
				);
				modal.open();
			},
			modifyEvent: async (event) => {
				const file = await getFileForEvent(this.app.vault, event);
				if (!file) {
					return false;
				}
				const success = await upsertLocalEvent(
					this.app.vault,
					getPathPrefix(event.id),
					eventApiToFrontmatter(event),
					event.id
				);
				if (!success) {
					new Notice(
						"Multiple events with the same name on the same date are not yet supported. Please rename your event before moving it."
					);
				}
				return success;
			},

			eventMouseEnter: (info) => {
				const path = info.event.id;
				this.app.workspace.trigger("hover-link", {
					event: info.jsEvent,
					source: PLUGIN_SLUG,
					hoverParent: calendarEl,
					targetEl: info.jsEvent.target,
					linktext: path,
					sourcePath: path,
				});
			},
		});

		this.plugin.settings.calendarSources
			.filter((s) => s.type === "ical")
			.map(async (s): Promise<EventSourceInput> => {
				let url = (s as ICalSource).url;
				if (url.startsWith("webcal")) {
					url = "https" + url.slice("webcal".length);
				}
				let expander: IcalExpander | null = null;
				const getExpander = async (): Promise<IcalExpander | null> => {
					if (expander !== null) {
						return expander;
					}
					try {
						let text = await request({
							url: url,
							method: "GET",
						});
						expander = makeICalExpander(text);
						return expander;
					} catch (e) {
						new Notice(
							`There was an error loading a calendar. Check the console for full details.`
						);
						console.error(`Error loading calendar from ${url}`);
						console.error(e);
						return null;
					}
				};
				return {
					events: async function ({ start, end }) {
						const ical = await getExpander();
						if (ical === null) {
							throw new Error("Could not get calendar.");
						}
						const events = expandICalEvents(ical, {
							start,
							end,
						});
						return events;
					},
					editable: false,
					textColor: getComputedStyle(document.body).getPropertyValue(
						"--text-on-accent"
					),
					color:
						s.color ||
						getComputedStyle(document.body).getPropertyValue(
							"--interactive-accent"
						),
				};
			})
			.forEach((prom) => {
				prom.then((source) => this.calendar?.addEventSource(source));
			});

		this.plugin.settings.calendarSources
			.filter((s) => s.type === "caldav" || s.type === "icloud")
			.map(async (s): Promise<EventSourceInput> => {
				let davSource = (s as CalDAVSource);
				let expanders: IcalExpander[] = [];
				const getExpanders = async (): Promise<IcalExpander[]> => {
					if (expanders.length) {
						return expanders;
					}
					try {
						let xhr = new transport.Basic(
							new dav.Credentials({
								username: davSource.username,
								password: davSource.password
							})
						);
						let account = await dav.createAccount({
							xhr: xhr,
							server: davSource.url,
							loadObjects: true,
							loadCollections: true
						})

						expanders = account?.calendars.flatMap((calendar) =>
							calendar?.objects.flatMap((vevent) =>
								vevent?.calendarData ? makeICalExpander(vevent.calendarData) : null
							)
						).filter((expander): expander is IcalExpander => !!expander);
						return expanders;
					} catch (e) {
						new Notice(
							`There was an error loading a calendar. Check the console for full details.`
						);
						console.error(`Error loading calendar from ${davSource.url}`);
						console.error(e);
						return expanders;
					}

				};
				return {
					events: async function ({ start, end }) {
						const icals = await getExpanders();
						if (icals.length === 0) {
							throw new Error("Could not get calendar.");
						}
						const events = icals.flatMap((ical) =>
							expandICalEvents(ical, {
								start,
								end,
							})
						);
						return events;
					},
					editable: false,
					textColor: getComputedStyle(document.body).getPropertyValue(
						"--text-on-accent"
					),
					color:
						s.color ||
						getComputedStyle(document.body).getPropertyValue(
							"--interactive-accent"
						),
				};
			})
			.forEach((prom) => {
				prom.then((source) => this.calendar?.addEventSource(source));
			});

		this.registerEvent(
			this.app.metadataCache.on("changed", this.cacheCallback)
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile) {
					let id = file.path;
					const event = this.calendar?.getEventById(id);
					if (event) {
						event.remove();
					}
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const oldEvent = this.calendar?.getEventById(oldPath);
				if (oldEvent) {
					oldEvent.remove();
				}
				// Rename doesn't change any of the metadata so we also need to trigger
				// that same callback.
				if (file instanceof TFile) {
					this.onCacheUpdate(file);
				}
			})
		);
	}

	onResize(): void {
		if (this.calendar) {
			this.calendar.render();
		}
	}

	async onClose() {
		if (this.calendar) {
			this.calendar.destroy();
			this.calendar = null;
		}
	}
}
