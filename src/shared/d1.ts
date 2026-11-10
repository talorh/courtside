/** Targeted writes must change exactly one row; anything else is a bug or a race, so fail loudly. */
export function assertChanged(result: D1Result, what: string): void {
	const changes = result.meta.changes;
	if (changes !== 1) throw new Error(`Expected to change 1 ${what}, changed ${changes}`);
}
