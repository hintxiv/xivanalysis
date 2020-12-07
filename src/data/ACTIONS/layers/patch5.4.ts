import {Layer} from 'data/layer'
import {ActionRoot} from '../root'

// tslint:disable:no-magic-numbers

export const patch540: Layer<ActionRoot> = {
	patch: '5.4',
	data: {
		// BRD 5.4 potency changes
		BURST_SHOT: {potency: 250},

		// NIN 5.4 potency changes
		SPINNING_EDGE: {potency: 230},
		GUST_SLASH: {combo: {
			from: 2240,
			potency: 340,
		}},
	},
}
