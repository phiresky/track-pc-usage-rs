import { TagRuleGroup, ApiTypesTS, ApiResponse, ProgressReport } from "./server"

type ApiTypes = { [T in ApiTypesTS["type"]]: ApiTypesTS & { type: T } }

const backend =
	new URLSearchParams(location.search).get("server") ||
	new URL("/api", location.href).toString()

export function progressEvents(
	subscriber: (event: ProgressReport[]) => void,
): EventSource {
	const eventSource = new EventSource(backend + "/progress-events")
	eventSource.addEventListener("message", (event) => {
		subscriber(JSON.parse(event.data))
	})
	return eventSource
}
async function handleError(resp: Response): Promise<never> {
	const text = await resp.text()
	let data: { message: string } | null = null
	try {
		data = JSON.parse(text)
	} catch (e) {
		//
	}
	if (data && data.message) {
		throw Error(`Error from server: ${data.message}`)
	}
	console.error(
		"could not fetch data from",
		resp.url.toString(),
		":",
		resp.status,
		text,
	)
	throw Error(
		`could not fetch data from ${resp.url.toString()}: ${
			resp.status
		}: ${text}`,
	)
}
export async function getTimeRange(info: {
	before: Date
	after: Date
	tag?: string
}): Promise<ApiTypes["time_range"]["response"]> {
	const url = new URL(
		backend +
			"/time-range?" +
			new URLSearchParams(JSON.parse(JSON.stringify(info))).toString(),
	)
	const resp = await fetch(url.toString())
	if (!resp.ok) {
		return await handleError(resp)
	}
	const { data } = (await resp.json()) as ApiResponse<
		ApiTypes["time_range"]["response"]
	>
	return data
}

export async function getKnownTags(): Promise<
	ApiTypes["get_known_tags"]["response"]
> {
	const url = new URL(
		backend +
			"/get-known-tags?" +
			new URLSearchParams(JSON.parse(JSON.stringify({}))).toString(),
	)
	const resp = await fetch(url.toString())
	if (!resp.ok) {
		return await handleError(resp)
	}
	const { data } = (await resp.json()) as ApiResponse<
		ApiTypes["get_known_tags"]["response"]
	>
	return data
}

export async function getSingleEvent(info: {
	id: string
}): Promise<ApiTypes["single_event"]["response"]> {
	const url = new URL(backend + "/single-event")
	url.searchParams.set("id", info.id)
	const resp = await fetch(url.toString())
	if (!resp.ok) {
		return await handleError(resp)
	}
	const { data } = (await resp.json()) as ApiResponse<
		ApiTypes["single_event"]["response"]
	>
	return data
}

export async function getTagRules(): Promise<
	ApiTypes["rule_groups"]["response"]
> {
	const url = new URL(backend + "/rule-groups")
	const resp = await fetch(url.toString())
	if (!resp.ok) {
		return await handleError(resp)
	}
	const { data } = (await resp.json()) as ApiResponse<
		ApiTypes["rule_groups"]["response"]
	>
	return data
}

export async function saveTagRules(groups: TagRuleGroup[]): Promise<void> {
	const url = new URL(backend + "/rule-groups")
	const resp = await fetch(url.toString(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(groups),
	})
	if (!resp.ok) {
		return await handleError(resp)
	}
	const { data } = (await resp.json()) as { data: void }
	return data
}
