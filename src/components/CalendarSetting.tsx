import * as React from "react";
import { SetStateAction, useState } from "react";

import { CalendarSource } from "../types";

interface CalendarSettingsProps {
	options: string[];
	setting: Partial<CalendarSource>;
	defaultColor: string;
	onColorChange: (s: string) => void;
	onSourceChange: (s: string) => void;
	onTypeChange: (s: string) => void;
	onUsernameChange: (s: string) => void;
	onPasswordChange: (s: string) => void;
	deleteCalendar: () => void;
}

export const CalendarSettingRow = ({
	options,
	setting,
	defaultColor,
	onColorChange,
	onSourceChange,
	onTypeChange,
	onUsernameChange,
	onPasswordChange,
	deleteCalendar,
}: CalendarSettingsProps) => {
	const dirOptions = [...options];
	if (setting.type === "local" && setting.directory) {
		dirOptions.push(setting.directory);
	}
	dirOptions.sort();
	return (
		<div
			style={{
				display: "flex",
				// justifyContent: "space-between",
				width: "100%",
				marginBottom: "0.5rem",
			}}
		>
			<button
				type="button"
				onClick={deleteCalendar}
				style={{ maxWidth: "15%" }}
			>
				✕
			</button>
			{setting.type === "local" && (
				<select
					value={setting.directory || ""}
					onChange={(e) => onSourceChange(e.target.value)}
					style={{ maxWidth: "30%" }}
				>
					<option value="" disabled hidden>
						Choose a directory
					</option>
					{dirOptions.map((o, idx) => (
						<option key={idx} value={o}>
							{o}
						</option>
					))}
				</select>
			)}
			{(setting.type === "caldav" ||
				setting.type === "gcal" ||
				setting.type === "ical") && (
				<textarea
					style={{
						maxWidth: "30%",
						minWidth: "10%",
						fontSize: "8pt",
						lineHeight: 1,
						padding: 0,
					}}
					placeholder={
						setting.type === "gcal"
							? "Google Calendar ID (probably in the form LONG_ID@group.calendar.google.com)"
							: setting.type === "ical"
							? "URL for any .ics file"
							: setting.type === "caldav"
							? "URL for any CalDAV source"
							: "Unknown source type. Please submit a bug report!"
					}
					value={setting.url || ""}
					onChange={(e) => onSourceChange(e.target.value)}
				/>
			)}
			{setting.type === "caldav" && (
				<>
					<input
						type="text"
						style={{
							maxWidth: "30%",
							minWidth: "10%",
							fontSize: "8pt",
							lineHeight: 1,
							padding: 0,
						}}
						placeholder={"username"}
						value={setting.username || ""}
						onChange={(e) => onUsernameChange(e.target.value)}
					/>
					<input
						type="password"
						style={{
							maxWidth: "30%",
							minWidth: "10%",
							fontSize: "8pt",
							lineHeight: 1,
							padding: 0,
						}}
						placeholder={"password"}
						value={setting.password || ""}
						onChange={(e) => onPasswordChange(e.target.value)}
					/>
				</>
			)}
			<select
				style={{ maxWidth: "30%" }}
				value={setting.type || ""}
				onChange={(e) => onTypeChange(e.target.value)}
			>
				<option value="" disabled hidden>
					Calendar source
				</option>
				<option value={"local"}>Local calendar</option>
				<option value={"caldav"}>Remote Calendar (CalDAV)</option>
				<option value={"ical"}>Remote Calendar (.ics format)</option>
				<option value={"gcal"}>Google Calendar (Readonly)</option>
			</select>
			<input
				style={{ maxWidth: "25%", minWidth: "3rem" }}
				type="color"
				value={setting.color || defaultColor}
				onChange={(e) => onColorChange(e.target.value)}
			/>
		</div>
	);
};

interface FolderSettingProps {
	directories: string[];
	submit: (payload: CalendarSource[]) => void;
	initialSetting: CalendarSource[];
	defaultColor: string;
}
export const CalendarSettings = ({
	directories,
	initialSetting,
	defaultColor,
	submit,
}: FolderSettingProps) => {
	const [settings, setSettingState] =
		useState<Partial<CalendarSource>[]>(initialSetting);

	const setSettings = (state: SetStateAction<Partial<CalendarSource>[]>) => {
		setSettingState(state);
		setDirty(true);
	};

	const [dirty, setDirty] = useState(false);

	const usedDirectories = settings
		.map((s) => s.type === "local" && s.directory)
		.filter((s) => s);
	const options = directories.filter(
		(dir) => usedDirectories.indexOf(dir) === -1
	);

	return (
		<div style={{ width: "100%" }}>
			<button
				className="mod-cta"
				style={{
					marginBottom: "1rem",
				}}
				onClick={() => {
					setSettings((state) => [
						...state,
						{ type: "local", color: defaultColor },
					]);
				}}
			>
				Add Calendar
			</button>
			{settings.map((s, idx) => (
				<CalendarSettingRow
					key={idx}
					options={options}
					setting={s}
					onTypeChange={(newType) =>
						setSettings((state) => [
							...state.slice(0, idx),
							{
								...state[idx],
								type: newType as
									| "ical"
									| "local"
									| "gcal"
									| "caldav", // TODO: Try to DRY this out.
							},
							...state.slice(idx + 1),
						])
					}
					onSourceChange={(src) =>
						setSettings((state) => [
							...state.slice(0, idx),
							{
								...state[idx],
								...(state[idx].type === "local"
									? { directory: src }
									: { url: src }),
							},
							...state.slice(idx + 1),
						])
					}
					onUsernameChange={(uname) =>
						setSettings((state) => [
							...state.slice(0, idx),
							{
								...state[idx],
								username: uname,
							},
							...state.slice(idx + 1),
						])
					}
					onPasswordChange={(pwd) =>
						setSettings((state) => [
							...state.slice(0, idx),
							{
								...state[idx],
								password: pwd,
							},
							...state.slice(idx + 1),
						])
					}
					onColorChange={(color) =>
						setSettings((state) => [
							...state.slice(0, idx),
							{ ...state[idx], color },
							...state.slice(idx + 1),
						])
					}
					defaultColor={defaultColor}
					deleteCalendar={() =>
						setSettings((state) => [
							...state.slice(0, idx),
							...state.slice(idx + 1),
						])
					}
				/>
			))}
			<div
				style={{
					display: "flex",
					paddingTop: "1em",
					justifyContent: "space-between",
				}}
			>
				{dirty && (
					<button
						onClick={() => {
							submit(
								settings
									.filter(
										(elt) =>
											elt.color !== undefined &&
											elt.type !== undefined &&
											((elt.type === "local" &&
												elt.directory !== undefined) ||
												(elt.type === "gcal" &&
													elt.url !== undefined) ||
												(elt.type === "ical" &&
													elt.url !== undefined) ||
												(elt.type === "caldav" &&
													elt.url !== undefined &&
													elt.username !==
														undefined &&
													elt.password !== undefined))
									)
									.map((elt) => elt as CalendarSource)
							);
							setDirty(false);
						}}
						style={{
							backgroundColor: dirty
								? "var(--interactive-accent)"
								: undefined,
							color: dirty ? "var(--text-on-accent)" : undefined,
						}}
					>
						{dirty ? "Save" : "Settings Saved"}
					</button>
				)}
			</div>
		</div>
	);
};
