// An INDEPENDENT composer, assembled from published parts and the store.
//
// Parts from @fraym/ui: Composer (the field assembly — editor, mention pills,
// attachments, slash menu, chips, voice mic + dictation, send/stop row),
// ComposerTips, GoalComposerSurface + UsageLimitComposerSurface (top surfaces),
// and the slim-channel completion adapters (useSlashCommands /
// useFileCompletions / useArgumentCompletions — capabilities in, never a
// driver). Imports from our section implementations: NOTHING.
//
// THE STORE ANSWER: send -> actions.sendMessage (the ONE behavior path — the
// host executor resolves the live provider registry first, so this composer
// gets the same optimistic echo, queue awareness and steer-ghost as the
// shipped one). stop -> actions.interruptRunForQueuedMessage. state ->
// useObservable(session), the folded facts (isStreaming, goal). No driver.
//
// What is OURS here is the SECTION wiring — draft persistence, the send
// mapping, the surfaces' placement — exactly the part a marketplace author
// owns. The field, the tips, the surfaces and the voice subsystem are the
// published parts the reference also composes, so parity is structural.
import {
	Composer,
	GoalComposerSurface,
	useArgumentCompletions,
	useFileCompletions,
	useObservable,
	useSlashCommands,
	UsageLimitComposerSurface,
} from "@fraym/ui";
import { type ReactNode, useRef, useState } from "react";

/** The prop shape this composer uses, declared structurally — a marketplace
 *  author has no path into the host's internal contract modules, and none is
 *  needed: the host passes these fields, types are erased at build. */
interface ComposerProps {
	readonly sessionRef: { readonly workspaceId: string; readonly sessionId: string } | null | undefined;
	readonly placeholder: string;
	readonly actions?:
		| {
				readonly sendMessage: (input: unknown) => Promise<boolean | void>;
				readonly interruptRunForQueuedMessage: () => Promise<void>;
		  }
		| null;
	readonly session?: { subscribe: (fn: () => void) => () => void; getSnapshot: () => unknown } | null;
	readonly disabled: boolean;
	readonly opening: boolean;
	readonly continuation: { readonly continued: boolean };
	readonly leftSlot?: ReactNode;
	readonly rightSlot?: ReactNode;
}

type ComposerSectionProps = ComposerProps;

/** Stable identity for the no-session case: `useObservable` is a
 *  useSyncExternalStore wrapper, so a fresh fallback object per render would
 *  unsubscribe/resubscribe on every render. */
const NO_SESSION = { subscribe: () => () => {}, getSnapshot: () => null };

/** Per-session draft persistence — the same BEHAVIOR as the reference's
 *  session-scoped drafts: switch away mid-sentence, come back, the words are
 *  still here. Module-level on purpose: it outlives the component, scoped by
 *  `workspaceId\0sessionId`, and never leaves the page. */
const drafts = new Map<string, string>();

export default function IndependentComposer(props: ComposerSectionProps) {
	const { sessionRef, placeholder, actions, session, disabled, opening, continuation, leftSlot, rightSlot } = props;
	const draftKey = sessionRef ? `${sessionRef.workspaceId}\0${sessionRef.sessionId}` : "";
	const [draft, setDraft] = useState(() => drafts.get(draftKey) ?? "");
	// The key and the text this component is CURRENTLY bound to, readable from an
	// async acknowledgement. A send resolves when the turn settles, by which point
	// the user may have switched sessions or typed something newer — the module
	// `drafts` map is keyed so it is always the right session's copy, but local
	// state must only be touched while this component still shows that session
	// AND still holds the exact text that was sent.
	const liveKeyRef = useRef(draftKey);
	liveKeyRef.current = draftKey;
	const draftRef = useRef(draft);
	draftRef.current = draft;
	const facts = (useObservable(session ?? NO_SESSION) ?? null) as {
		readonly isStreaming?: boolean;
		readonly turnPhase?: "streaming" | "settled";
		readonly goal?: unknown;
	} | null;
	const slashCommands = useSlashCommands(draft);
	const fileCompletionSource = useFileCompletions();
	const argumentCompletionSource = useArgumentCompletions();

	const setDraftPersisted = (text: string) => {
		setDraft(text);
		if (draftKey) {
			if (text) drafts.set(draftKey, text);
			else drafts.delete(draftKey);
		}
	};

	const blocked = disabled || !sessionRef || !actions || continuation.continued;
	const running = Boolean(facts?.isStreaming) || facts?.turnPhase === "streaming";
	const goal = (facts?.goal ?? null) as { readonly objective?: string } | null | undefined;

	const send = async (
		text: string,
		attachments: readonly { readonly data: string; readonly mimeType: string; readonly name?: string }[] = [],
	): Promise<boolean> => {
		if (!actions || blocked) return false;
		// NO `running` guard: `actions.sendMessage` is the ONE behavior path and
		// the HOST resolves queue-vs-send (a send while streaming QUEUES, the
		// same as the reference — the shipped composer has no streaming guard
		// either; `streaming` is presentation feeding the stop button). Blocking
		// on `running` vaporized the composed text — the draft was already
		// cleared, so the words were gone with no symptom. Found by the thread
		// phase's queue-while-streaming test. The null/blocked guard STAYS:
		// composer-core's sendStash fires onStashSend with no disabled gate, so
		// a stash send with null actions would be an unguarded TypeError.
		// Composer.submitValue hands (text, attachments) and then clears the
		// pills — dropping the second argument silently discarded every pasted
		// image behind an "[Image #N]" marker. Map them to the wire shape the
		// reference's sendComposed produces.
		const images = attachments.map(a => ({ kind: "image", mimeType: a.mimeType, data: a.data, name: a.name }));
		// RETURN the host's delivery verdict. The comment above records this
		// file's own history of vaporizing composed text; the FAILURE path had
		// the same hole, because `onSubmit` clears the draft and this call threw
		// the answer away. Observed on a real device 2026-09-07: typed offline,
		// submitted, and the words were gone within ONE second — not in the
		// composer, not in the transcript, nowhere. `?? false` because a host
		// older than this contract resolves `undefined`, and "no answer" must
		// count as undelivered rather than as a silent success.
		return (await actions.sendMessage(images.length > 0 ? { text, attachments: images } : text)) ?? false;
	};
	const stop = () => {
		if (!actions) return;
		void actions.interruptRunForQueuedMessage();
	};

	return (
		<Composer
			value={draft}
			onChange={setDraftPersisted}
			onSubmit={(text, attachments) => {
				// Bind the key BEFORE anything awaits: the acknowledgement below must
				// act on the session that was being composed INTO, never whichever one
				// is on screen when a late answer arrives.
				const sentKey = draftKey;
				// DO NOT clear the draft here. Until the host acknowledges delivery
				// this IS the only copy of the user's words, and clear-then-restore
				// cannot work: with the wire down `sendMessage` never resolves at all,
				// so there is no verdict to restore on. Measured on a device
				// (2026-09-07, board mtrghytjnr2mrx) — typed offline, submitted, and
				// the text was gone in under a second with nothing ever coming back.
				//
				// Leaving it costs nothing visually: `Composer.submitValue` clears its
				// attachment pills itself but deliberately leaves the TEXT to this
				// controlled `value`, so the words simply stay on screen until they
				// are known to have left. An unsent message you can still see is the
				// honest state; an empty field is a lie about where your words went.
				void (async () => {
					if (!(await send(text, attachments))) return;
					// Delivered. Now it is safe to drop the copy — and only if the user
					// has not typed something newer while it was in flight.
					if (drafts.get(sentKey) === text) drafts.delete(sentKey);
					if (liveKeyRef.current === sentKey && draftRef.current === text) setDraft("");
				})();
			}}
			onStashSend={(text, attachments) => void send(text, attachments)}
			onStop={stop}
			streaming={Boolean(running)}
			disabled={blocked}
			connecting={opening && !continuation.continued}
			focusWhenEnabled={!continuation.continued}
			placeholder={placeholder}
			showTips
			leftSlot={leftSlot}
			rightSlot={rightSlot}
			slashCommands={slashCommands}
			fileCompletionSource={fileCompletionSource}
			argumentCompletionSource={argumentCompletionSource}
			topSlot={
				<>
					<UsageLimitComposerSurface />
					{goal?.objective ? (
						<GoalComposerSurface
							goal={goal as never}
							disabled={blocked}
							onEditGoal={objective => send(`/goal set ${objective}`)}
							onPauseGoal={() => send("/goal pause")}
							onResumeGoal={() => send("/goal resume")}
							onClearGoal={() => send("/goal drop")}
						/>
					) : null}
				</>
			}
		/>
	);
}
