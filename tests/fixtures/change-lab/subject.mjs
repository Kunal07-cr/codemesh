export function add(left, right) { console.log("adding", left, right); return left + right; }
export async function reject() { throw new Error("Expected fixture failure"); }
export function unsupported() { return 1n; }
