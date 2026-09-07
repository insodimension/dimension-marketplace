import { Composer, GoalComposerSurface, UsageLimitComposerSurface, useArgumentCompletions, useFileCompletions, useObservable, useSlashCommands } from "@fraym/ui";
import { useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
//#region src/index.tsx
/** Stable identity for the no-session case: `useObservable` is a
*  useSyncExternalStore wrapper, so a fresh fallback object per render would
*  unsubscribe/resubscribe on every render. */
var NO_SESSION = {
	subscribe: () => () => {},
	getSnapshot: () => null
};
/** Per-session draft persistence — the same BEHAVIOR as the reference's
*  session-scoped drafts: switch away mid-sentence, come back, the words are
*  still here. Module-level on purpose: it outlives the component, scoped by
*  `workspaceId\0sessionId`, and never leaves the page. */
var drafts = /* @__PURE__ */ new Map();
function IndependentComposer(props) {
	const { sessionRef, placeholder, actions, session, disabled, opening, continuation, leftSlot, rightSlot } = props;
	const draftKey = sessionRef ? `${sessionRef.workspaceId}\0${sessionRef.sessionId}` : "";
	const [draft, setDraft] = useState(() => drafts.get(draftKey) ?? "");
	const liveKeyRef = useRef(draftKey);
	liveKeyRef.current = draftKey;
	const draftRef = useRef(draft);
	draftRef.current = draft;
	const facts = useObservable(session ?? NO_SESSION) ?? null;
	const slashCommands = useSlashCommands(draft);
	const fileCompletionSource = useFileCompletions();
	const argumentCompletionSource = useArgumentCompletions();
	const setDraftPersisted = (text) => {
		setDraft(text);
		if (draftKey) if (text) drafts.set(draftKey, text);
		else drafts.delete(draftKey);
	};
	const blocked = disabled || !sessionRef || !actions || continuation.continued;
	const running = Boolean(facts?.isStreaming) || facts?.turnPhase === "streaming";
	const goal = facts?.goal ?? null;
	const send = async (text, attachments = []) => {
		if (!actions || blocked) return false;
		const images = attachments.map((a) => ({
			kind: "image",
			mimeType: a.mimeType,
			data: a.data,
			name: a.name
		}));
		return await actions.sendMessage(images.length > 0 ? {
			text,
			attachments: images
		} : text) ?? false;
	};
	const stop = () => {
		if (!actions) return;
		actions.interruptRunForQueuedMessage();
	};
	return /* @__PURE__ */ jsx(Composer, {
		value: draft,
		onChange: setDraftPersisted,
		onSubmit: (text, attachments) => {
			const sentKey = draftKey;
			(async () => {
				if (!await send(text, attachments)) return;
				if (drafts.get(sentKey) === text) drafts.delete(sentKey);
				if (liveKeyRef.current === sentKey && draftRef.current === text) setDraft("");
			})();
		},
		onStashSend: (text, attachments) => void send(text, attachments),
		onStop: stop,
		streaming: Boolean(running),
		disabled: blocked,
		connecting: opening && !continuation.continued,
		focusWhenEnabled: !continuation.continued,
		placeholder,
		showTips: true,
		leftSlot,
		rightSlot,
		slashCommands,
		fileCompletionSource,
		argumentCompletionSource,
		topSlot: /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(UsageLimitComposerSurface, {}), goal?.objective ? /* @__PURE__ */ jsx(GoalComposerSurface, {
			goal,
			disabled: blocked,
			onEditGoal: (objective) => send(`/goal set ${objective}`),
			onPauseGoal: () => send("/goal pause"),
			onResumeGoal: () => send("/goal resume"),
			onClearGoal: () => send("/goal drop")
		}) : null] })
	});
}
//#endregion
export { IndependentComposer as default };
