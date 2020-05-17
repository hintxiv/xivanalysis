/**
 * @author Yumiya
 */
import ACTIONS from 'data/ACTIONS'
import {CooldownDowntime} from 'parser/core/modules/CooldownDowntime'

export default class OGCDDowntime extends CooldownDowntime {
	trackedCds = [
		{
			cooldowns: [ACTIONS.BARRAGE],
			firstUseOffset: 12000,
		},
		{
			cooldowns: [ACTIONS.RAGING_STRIKES],
			firstUseOffset: -1000,
		},
		{
			cooldowns: [ACTIONS.SIDEWINDER],
			firstUseOffset: 12000,
		},
	]

	checklistTarget = 100
}
