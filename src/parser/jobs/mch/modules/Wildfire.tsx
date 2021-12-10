import {t} from '@lingui/macro'
import {Trans} from '@lingui/react'
import {ActionLink} from 'components/ui/DbLink'
import {RotationEvent} from 'components/ui/Rotation'
import {RotationTable} from 'components/ui/RotationTable'
import {Event, Events} from 'event'
import {Analyser} from 'parser/core/Analyser'
import {EventHook} from 'parser/core/Dispatcher'
import {filter} from 'parser/core/filter'
import {dependency} from 'parser/core/Injectable'
import {History, HistoryEntry} from 'parser/core/modules/ActionWindow/History'
import {Data} from 'parser/core/modules/Data'
import Suggestions, {SEVERITY, TieredSuggestion} from 'parser/core/modules/Suggestions'
import {Timeline} from 'parser/core/modules/Timeline'
import React from 'react'

// We always want 6 GCDs in WF
const EXPECTED_GCDS = 6

const SEVERITIES = {
	BAD_WILDFIRE: {
		1: SEVERITY.MINOR,
		2: SEVERITY.MEDIUM,
		3: SEVERITY.MAJOR,
	},
	FIZZLED_WILDFIRE: {
		1: SEVERITY.MEDIUM,
		2: SEVERITY.MAJOR,
	},
}

interface WildfireWindow {
	actionEvents: Array<Events['action']>
	stacks: number
	damage?: number
}

export class Wildfire extends Analyser {
	static override handle = 'wildfire'
	static override title = t('mch.wildfire.title')`Wildfire`

	@dependency private data!: Data
	@dependency private suggestions!: Suggestions
	@dependency private timeline!: Timeline

	private history = new History<WildfireWindow>(
		() => ({
			actionEvents: [],
			stacks: 0,
		})
	)

	private actionHook?: EventHook<Events['action']>

	private actionFilter = filter<Event>()
		.source(this.parser.actor.id)
		.type('action')

	override initialise() {
		this.addEventHook(filter<Event>()
			.source(this.parser.actor.id)
			.type('statusApply')
			.status(this.data.statuses.WILDFIRE.id)
		, this.onApply)

		this.addEventHook(filter<Event>()
			.source(this.parser.actor.id)
			.type('statusRemove')
			.status(this.data.statuses.WILDFIRE.id)
		, this.onRemove)

		this.addEventHook(filter<Event>()
			.source(this.parser.actor.id)
			.type('damage')
			.cause(this.data.matchCauseStatusId([this.data.statuses.WILDFIRE.id]))
		, this.onDamage)

		this.addEventHook('complete', this.onComplete)
	}

	private onApply(event: Events['statusApply']) {
		if (this.history.getCurrent() != null) {
			this.history.doIfOpen(current => current.stacks++)
			return
		}

		// First application of WF, start a new window
		this.history.openNew(event.timestamp)

		if (this.actionHook == null) {
			this.actionHook = this.addEventHook(this.actionFilter, this.onAction)
		}
	}

	private onDamage(event: Events['damage']) {
		this.history.doIfOpen(current => current.damage = event.targets[0].amount)
	}

	private onRemove(event: Events['statusRemove']) {
		this.history.closeCurrent(event.timestamp)

		if (this.actionHook != null) {
			this.removeEventHook(this.actionHook)
			this.actionHook = undefined
		}
	}

	private onAction(event: Events['action']) {
		this.history.doIfOpen(current => current.actionEvents.push(event))
	}

	private onComplete() {
		this.history.closeCurrent(this.parser.currentEpochTimestamp)

		const badWildfires = this.history.entries
			.filter(wildfire => wildfire.data.stacks < EXPECTED_GCDS)
			.length

		const fizzledWildfires = this.history.entries
			.filter(wildfire => wildfire.data.damage == null || wildfire.data.damage === 0)
			.length

		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.WILDFIRE.icon,
			content: <Trans id="mch.wildfire.suggestions.gcds.content">
				Try to ensure you have a Hypercharge prepared for every <ActionLink action="WILDFIRE"/> cast to maximize damage. Each GCD in a Wildfire window is worth 150 potency, so maximizing the GCD count with <ActionLink action="HEAT_BLAST"/> is important.
			</Trans>,
			tiers: SEVERITIES.BAD_WILDFIRE,
			value: badWildfires,
			why: <Trans id="mch.wildfire.suggestions.gcds.why">
				{badWildfires} of your Wildfire windows contained fewer than {EXPECTED_GCDS} GCDs.
			</Trans>,
		}))

		this.suggestions.add(new TieredSuggestion({
			icon: this.data.actions.WILDFIRE.icon,
			content: <Trans id="mch.wildfire.suggestions.fizzle.content">
				Be careful to time your <ActionLink action="WILDFIRE"/> windows so that the damage resolves during uptime, or detonate them early if necessary to at least get partial potency.
			</Trans>,
			tiers: SEVERITIES.FIZZLED_WILDFIRE,
			value: fizzledWildfires,
			why: <Trans id="mch.wildfire.suggestions.fizzle.why">
				{fizzledWildfires} of your Wildfire windows ghosted or resolved for 0 damage.
			</Trans>,
		}))
	}

	private getRotation(wildfire: HistoryEntry<WildfireWindow>): RotationEvent[] {
		let gcds = 0
		return wildfire.data.actionEvents.map(event => {
			const action = this.data.getAction(event.action)
			if (action?.onGcd) {
				gcds++
				if (gcds > wildfire.data.stacks) {
					// This GCD must have ghosted since it didn't generate a debuff stack
					return {action: event.action, warn: true}
				}
			}
			return {action: event.action}
		})
	}

	override output() {
		if (this.history.entries.length === 0) { return undefined }

		const gcdTarget = {
			header: <Trans id="mch.wildfire.rotation-table.header.gcd-count">GCDs</Trans>,
			accessor: 'gcds',
		}

		const damageNote = {
			header: <Trans id="mch.wildfire.rotation-table.header.damage">Damage</Trans>,
			accessor: 'damage',
		}

		const rotationData = this.history.entries.map(wildfire => ({
			start: wildfire.start - this.parser.pull.timestamp,
			end: (wildfire.end ?? wildfire.start) - this.parser.pull.timestamp,
			targetsData: {
				gcds: {
					actual: wildfire.data.stacks,
					expected: EXPECTED_GCDS,
				},
			},
			notesMap: {
				damage: wildfire.data.damage ?? 0,
			},
			rotation: this.getRotation(wildfire),
		}))

		return <RotationTable
			targets={[gcdTarget]}
			notes={[damageNote]}
			data={rotationData}
			onGoto={this.timeline.show}
		/>
	}
}
