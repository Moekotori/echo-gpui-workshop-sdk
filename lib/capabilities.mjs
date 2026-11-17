import { readFile } from 'node:fs/promises';

export async function capabilities() {
    try {
        return JSON.parse(await readFile(new URL('../capabilities.json', import.meta.url), 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const { readCapabilities } = await import('../../../scripts/workshop-capabilities.mjs');
    return readCapabilities();
}

export function checkRequirements(requires, host) {
    if (!requires || typeof requires !== 'object' || Array.isArray(requires)) {
        throw new Error('gpui.requires must be an object.');
    }
    for (const [kind, required] of Object.entries(requires)) {
        if (kind !== 'commands' && kind !== 'events') throw new Error(`Unknown gpui.requires field: ${kind}`);
        if (!Array.isArray(required) || required.some(name => typeof name !== 'string')) {
            throw new Error(`gpui.requires.${kind} must be an array of names.`);
        }
        const missing = required.filter(name => !host[kind].includes(name));
        if (missing.length) throw new Error(`SDK host is missing required ${kind}: ${missing.join(', ')}`);
    }
}

export function compareOriginal(catalog, host) {
    if (catalog?.apiVersion !== 2 || !catalog.actions || typeof catalog.actions !== 'object'
        || Array.isArray(catalog.actions)) {
        throw new Error('Expected the original SDK API 2 capability-catalog.json.');
    }
    const actions = Object.keys(catalog.actions).sort();
    const dispatch = new Set(host.original.hostActions);
    const matchedActions = actions.filter(action => dispatch.has(action));
    const outsideHostDispatch = actions.filter(action => !dispatch.has(action));
    return { catalogActions: actions.length, matchedActions, outsideHostDispatch };
}
