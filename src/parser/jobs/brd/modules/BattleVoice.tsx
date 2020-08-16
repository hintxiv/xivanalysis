import {MessageDescriptor} from '@lingui/core'
import {t} from '@lingui/macro'
import {Trans} from '@lingui/react'
import React, {Fragment} from 'react'
import {Button, Table} from 'semantic-ui-react'

import {ActionLink} from 'components/ui/DbLink'
import ACTIONS from 'data/ACTIONS'
import STATUSES from 'data/STATUSES'
import {CastEvent, BuffEvent} from 'fflogs'
import Module, {dependency} from 'parser/core/Module'
import GlobalCooldown from 'parser/core/modules/GlobalCooldown'
import {NormalisedApplyBuffEvent} from 'parser/core/modules/NormalisedEvents'
import Suggestions, {SEVERITY, TieredSuggestion} from 'parser/core/modules/Suggestions'
import {Timeline} from 'parser/core/modules/Timeline'
import Combatants from 'parser/core/modules/Combatants'
import {Data} from 'parser/core/modules/Data'

interface BattleVoiceWindow {
	cast: CastEvent,
	playersHitIDs: Set<number>,
}

export default class BattleVoice extends Module {
	static handle = 'battlevoice'
	static title = t('brd.battlevoice.title')`Battle Voice`
	static debug = true

	@dependency private combatants!: Combatants
	@dependency private data!: Data
	@dependency private timeline!: Timeline

	protected icon = ACTIONS.BATTLE_VOICE.icon

	private currentShout?: BattleVoiceWindow
	private badShouts: BattleVoiceWindow[] = []
	private partyCount: number = 0

	private closeWindow(window: BattleVoiceWindow) {
		if (window.playersHitIDs.size < this.partyCount) {
			this.badShouts.push(window)
		}

		this.debug('expected: ', this.partyCount)
		this.debug('actual: ', window.playersHitIDs.size)

		this.debug(this.combatants.getEntities())
	}

	protected init() {
		this.addEventHook('cast', {by: 'player', abilityId: ACTIONS.BATTLE_VOICE.id}, this.onShout)
		this.addEventHook('normalisedapplybuff', {by: 'player', abilityId: STATUSES.BATTLE_VOICE.id}, this.onApply)
	}

	private onShout(event: CastEvent) {
		if (this.currentShout) {
			this.closeWindow(this.currentShout)
		}

		this.currentShout = {
			cast: event,
			playersHitIDs: new Set(),
		}
	}

	private onApply(event: NormalisedApplyBuffEvent) {
		if (!event.sourceID) { return }

		this.partyCount = Object.values(this.combatants.getEntities())
			.filter(c => this.combatants.isActorPlayer(c.info.id))
			.length - 1

		if (this.currentShout && event.sourceID === this.parser.player.id) {
			const playersHit = event.confirmedEvents
				.map(hit => hit.targetID)
				.filter(id => this.parser.fightFriendlies.findIndex(f => f.id === id) >= 0)
			playersHit.forEach(id => this.currentShout!.playersHitIDs.add(id!))
		}
	}

	output() {
		if (this.currentShout) {
			this.closeWindow(this.currentShout)
		}

		if (this.badShouts.length === 0) { return null }

		return <Table collapsing unstackable>
			<Table.Header>
				<Table.Row>
					<Table.HeaderCell collapsing>
						<strong><Trans id="brd.battlevoice.table.header.time">Time</Trans></strong>
					</Table.HeaderCell>
					<Table.HeaderCell collapsing>
						<strong><Trans id="brd.battlevoice.table.header.hit">Players Hit</Trans></strong>
					</Table.HeaderCell>
				</Table.Row>
			</Table.Header>
			<Table.Body>
			{
				this.badShouts.map((window) => {
					const timestamp = window.cast.timestamp
					return <Table.Row key={window.cast.timestamp}>
						<Table.Cell textAlign="center">
							<Button
								circular
								compact
								size="mini"
								icon="time"
								onClick={() => this.timeline.show(timestamp - this.parser.eventTimeOffset, timestamp - this.parser.eventTimeOffset + STATUSES.BATTLE_VOICE.duration)}
							/>
							<span>{this.parser.formatTimestamp(timestamp)}</span>
						</Table.Cell>
						<Table.Cell textAlign="center">
							<>{window.playersHitIDs.size}/{this.partyCount}</>
						</Table.Cell>
					</Table.Row>
				})
			}
			</Table.Body>
		</Table>
	}
}
