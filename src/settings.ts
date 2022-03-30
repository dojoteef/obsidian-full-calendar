import FullCalendarPlugin from "./main";
import { App, DropdownComponent, Notice, PluginSettingTab, Setting, TFolder, Vault } from "obsidian";
import { partialCalendarSource, CalendarSource, FCError } from "./types";
import { CalendarSettings } from "./components/CalendarSetting";
import { AddCalendarSource } from "./components/AddCalendarSource";
import { RemoteSource } from "./models/EventSource";
import * as ReactDOM from "react-dom";
import { createElement, useState } from "react";
import { ReactModal } from "./modal";

export interface FullCalendarSettings {
	calendarSources: CalendarSource[];
	defaultCalendar: number;
	recursiveLocal: boolean;
}

export const DEFAULT_SETTINGS: FullCalendarSettings = {
	calendarSources: [],
	defaultCalendar: 0,
	recursiveLocal: false,
};

export function addCalendarButton(
	app: App,
	plugin: FullCalendarPlugin,
	containerEl: HTMLElement,
	submitCallback: (setting: CalendarSource) => void,
	listUsedDirectories?: () => string[]
) {
	let dropdown: DropdownComponent;
	const directories = app.vault
		.getAllLoadedFiles()
		.filter((f) => f instanceof TFolder)
		.map((f) => f.path);

	return new Setting(containerEl)
		.setName("Calendars")
		.setDesc("Add calendar")
		.addDropdown((d) =>
			dropdown = d
			.addOptions({
				local: "Local",
				icloud: "iCloud",
				caldav: "CalDAV",
				gcal: "Google (Readonly)",
				ical: "Remote (.ics format)",
			})
		)
		.addExtraButton((button) => {
			button.setTooltip("Add Calendar");
			button.setIcon("plus-with-circle");
			button.onClick(() => {
				let modal = new ReactModal(
					app,
					async () => {
						await plugin.loadSettings();
						const usedDirectories = (listUsedDirectories ? listUsedDirectories : () =>
							plugin.settings.calendarSources
								.map((s) => s.type === "local" && s.directory)
								.filter((s): s is string => !!s)
						)();

						return createElement(AddCalendarSource, {
							source: partialCalendarSource(
								dropdown.getValue() as CalendarSource["type"]
							),
							directories: directories.filter(
								(dir) => usedDirectories.indexOf(dir) === -1
							),
                            submit: async (source: CalendarSource) => {
                                if (source.type === "caldav" || source.type === "icloud") {
                                    let sources = await new RemoteSource(source).importCalendars();
                                    if (sources instanceof FCError) {
                                        new Notice(sources.message);
                                    } else {
                                        sources.forEach((source) => submitCallback(source));
                                    }
                                } else {
                                    submitCallback(source);
                                }
								modal.close();
							}
						});
					}
				);
				modal.open();
			});
		});
}

export class FullCalendarSettingTab extends PluginSettingTab {
	plugin: FullCalendarPlugin;

	constructor(app: App, plugin: FullCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Events settings" });

		new Setting(containerEl)
			.setName("Recursive event folders")
			.setDesc("Search through sub-folders for events")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.recursiveLocal);
				toggle.onChange(async (val) => {
					this.plugin.settings.recursiveLocal = val;
					await this.plugin.saveSettings();
				});
			});

		addCalendarButton(
			this.app,
			this.plugin,
			containerEl,
			async (source: CalendarSource) => {
				sourceList.addSource(source);
			},
			() => sourceList.state.sources
				.map((s) => s.type === "local" && s.directory)
				.filter((s): s is string => !!s)
		);

		const sourcesDiv = containerEl.createDiv();
		sourcesDiv.style.display = "block";
		let sourceList = ReactDOM.render(
			createElement(CalendarSettings, {
				sources: this.plugin.settings.calendarSources,
				submit: async (settings: CalendarSource[]) => {
					this.plugin.settings.calendarSources = settings;
					await this.plugin.saveSettings();
				},
			}),
			sourcesDiv
		);
	}
}
