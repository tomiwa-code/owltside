import { describe, expect, it } from 'vitest';
import { NIGERIAN_STATES } from './nigeria-states';

describe('Nigerian state options', () => {
	it('contains the 36 unique states and excludes the FCT', () => {
		expect(NIGERIAN_STATES).toHaveLength(36);
		expect(new Set(NIGERIAN_STATES).size).toBe(36);
		expect(NIGERIAN_STATES).toContain('Lagos');
		expect(NIGERIAN_STATES).toContain('Zamfara');
		expect(NIGERIAN_STATES).not.toContain('Federal Capital Territory');
	});
});
