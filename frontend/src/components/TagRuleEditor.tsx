import { observer, useLocalObservable } from "mobx-react"
import { fromPromise } from "mobx-utils"
import * as React from "react"
import { TagRule, TagRuleGroup, TagRuleWithMeta } from "../server"
import { Page } from "./Page"
import * as api from "../api"
import { observable, runInAction } from "mobx"
import { generateId } from "../util"
import { useState } from "react"
import { RegexEditor } from "./RegexEditor"

export function TagRuleEditorPage(): React.ReactElement {
	return (
		<Page>
			<TagRuleEditor />
		</Page>
	)
}

async function upload(g: TagRuleGroup) {
	await api.saveTagRules([g])
}

const TagRuleEditor: React.FC = observer(() => {
	const store = useLocalObservable(() => ({
		data: fromPromise(api.getTagRules().then((e) => observable(e))),
	}))

	return (
		<div className="centerbody">
			{store.data.case({
				rejected(v) {
					return <>Error loading: {String(v)}</>
				},
				pending() {
					return <>Loading...</>
				},
				fulfilled(v) {
					return (
						<>
							<button
								onClick={(_) =>
									v.unshift({
										global_id: generateId(),
										data: {
											version: "V1",
											data: {
												description: "",
												editable: true,
												name:
													prompt(
														"Group Name",
														"Untitled Group",
													) || "Untitled Group",
												rules: [],
											},
										},
									})
								}
							>
								Create New Group
							</button>
							{v.map((g) => (
								<TagRuleGroupEditor
									key={g.global_id}
									group={g}
									save={() => upload(g)}
								/>
							))}
						</>
					)
				},
			})}
		</div>
	)
})

const TagRuleGroupEditor: React.FC<{
	group: TagRuleGroup
	save: () => void
}> = observer(({ group, save }) => {
	if (group.data.version !== "V1")
		throw Error("unexpected group data version")
	const g = group.data.data
	const [dirty, setDirty] = useState(false)
	return (
		<details className="rule-group">
			<summary>
				<h2>
					Group <em>{g.name}</em> {!g.editable && <>(Not editable)</>}
					{dirty && <button onClick={save}>Save changes</button>}
				</h2>
			</summary>
			<div className="rule-group-detail">
				Description: {g.description}
				<h3>Rules:</h3>
				{g.rules.map((r, i) => (
					<RuleEditor
						key={i}
						index={i}
						rule={r}
						editable={g.editable}
						dirty={() => setDirty(true)}
					/>
				))}
				{g.editable && (
					<button
						onClick={(_) =>
							g.rules.push({
								enabled: true,
								rule: {
									type: "TagRegex",
									regexes: ["^...$"],
									new_tag: "",
								},
							})
						}
					>
						Add Rule
					</button>
				)}
			</div>
		</details>
	)
})

type RuleMoppies = { [T in TagRule["type"]]: TagRule & { type: T } }

const ruleEditors: {
	[k in keyof RuleMoppies]: React.FC<{
		rule: RuleMoppies[k]
		editable: boolean
	}>
} = {
	TagRegex(p) {
		return (
			<div className="tag-regex-rule">
				If{" "}
				{p.rule.regexes.length > 1
					? "all of the following match"
					: "the following matches"}{" "}
				:
				{p.rule.regexes.map((r, i) => (
					<RegexEditor
						key={r}
						editable={p.editable}
						value={r}
						onChange={(r) =>
							runInAction(() => (p.rule.regexes[i] = r))
						}
					/>
				))}
				Then add new tag: {p.rule.new_tag}
			</div>
		)
	},
	InternalFetcher(p) {
		return <em>[internal fetcher {p.rule.fetcher}]</em>
	},
	ExternalFetcher(p) {
		return <em>[external caching fetcher {p.rule.fetcher}]</em>
	},
}
for (const [k, v] of Object.entries(ruleEditors))
	ruleEditors[k] = observer(v) as any

const RuleEditor: React.FC<{
	index: number
	rule: TagRuleWithMeta
	editable: boolean
	dirty: () => void
}> = observer(({ dirty, index, rule, editable }) => {
	return (
		<div className="rule-editor">
			<h4>
				<label className="clickable">
					<input
						type="checkbox"
						checked={rule.enabled}
						onChange={(e) =>
							runInAction(() => {
								rule.enabled = e.currentTarget.checked
								dirty()
							})
						}
					/>{" "}
					Rule {index + 1}
					{rule.enabled ? "" : " (disabled)"}
				</label>
			</h4>
			{React.createElement(ruleEditors[rule.rule.type] as any, {
				rule: rule.rule,
				editable,
			})}
		</div>
	)
})
