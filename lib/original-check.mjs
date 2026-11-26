import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';
import { TextDecoder } from 'node:util';

const manifestLimit = 256 * 1024;
const packageLimit = 8 * 1024 * 1024;
const idPattern = /^[A-Za-z0-9._-]{1,80}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const lower = value => typeof value === 'string' ? value.toLowerCase() : null;
const list = value => Array.isArray(value) ? value : [];
const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

function portablePath(value, extension) {
    if (typeof value !== 'string') return null;
    const path = value.trim();
    if (path.startsWith('./') || path.endsWith('/') || !path.toLowerCase().endsWith(extension)) return null;
    const parts = path.split('/');
    if (parts.length > 40 || Buffer.byteLength(path) > 1024) return null;
    const reserved = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9¹²³])$/i;
    if (parts.some(part => !part || part === '.' || part === '..'
        || reserved.test(part.split('.')[0].trimEnd()) || /[. ]$/.test(part) || /[\\\\:"<>|*?]/.test(part)
        || Array.from(part).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) return null;
    return path;
}

async function readBounded(file, maximum) {
    const facts = await stat(file);
    if (!facts.isFile() || facts.size > maximum) throw new Error('Source file exceeds the package limit or is unavailable.');
    const bytes = await readFile(file);
    if (bytes.length > maximum) throw new Error('Source file exceeds the package limit.');
    return bytes;
}

async function packageEntry(outerPath, item) {
    const entry = portablePath(item.content?.entry, '.echo');
    if (!entry) throw new Error('Expected a package-relative .echo entry in content.entry.');
    const root = await realpath(dirname(outerPath));
    const file = await realpath(resolve(root, entry));
    const part = relative(root, file);
    if (!part || isAbsolute(part) || part.split(sep)[0] === '..') throw new Error('Package entry points outside its folder.');
    return { entry, bytes: await readBounded(file, packageLimit) };
}

export async function inspectOriginal(path, host, { actions = [], events = [] } = {}) {
    const issues = [];
    const add = (level, code, field, message) => issues.push({ level, code, field, message });
    const error = (code, field, message) => add('error', code, field, message);
    const warn = (code, field, message) => add('warning', code, field, message);
    let manifest = decode(await readBounded(path, path.toLowerCase().endsWith('.echo') ? packageLimit : manifestLimit));
    let kind = 'manifest';
    let envelope = null;
    let item = null;

    if (manifest?.type === 'echo-workshop-item') {
        item = manifest;
        kind = 'workshop-item';
        if (item.schemaVersion !== 1 || item.content?.kind !== 'plugin-package' || item.gpui) {
            throw new Error('Expected an original Workshop plugin item with a .echo entry.');
        }
        if (item.compatibility?.pluginApiVersion !== host.original.apiVersion) {
            error('api-version', 'compatibility.pluginApiVersion', 'GPUI supports original plugin API 2.');
        }
        for (const field of ['dependencies', 'conflicts']) {
            if (item[field] !== undefined && (!Array.isArray(item[field]) || item[field].length)) {
                error('unsupported-item-field', field, 'Package dependencies and conflicts are not supported by this host.');
            }
        }
        const { entry, bytes } = await packageEntry(path, item);
        const matches = list(item.files).filter(file => typeof file?.path === 'string' && file.path.trim().toLowerCase() === entry.toLowerCase());
        const digest = createHash('sha256').update(bytes).digest('hex');
        if (matches.length !== 1 || matches[0].size !== bytes.length || lower(matches[0].sha256) !== digest) {
            error('entry-integrity', 'files', 'Expected one entry with the correct file size and SHA-256.');
        }
        envelope = decode(bytes);
    } else if (manifest?.type === 'echo-plugin-package' || path.toLowerCase().endsWith('.echo')) {
        kind = 'echo-package';
        envelope = manifest;
    }

    if (envelope) {
        if (envelope.type !== 'echo-plugin-package' || envelope.version !== 1 || !object(envelope.manifest)) {
            throw new Error('Expected an original echo-plugin-package envelope version 1.');
        }
        manifest = envelope.manifest;
        const paths = new Set();
        if (!Array.isArray(envelope.files)) error('invalid-files', 'files', 'Expected embedded source files.');
        for (const file of list(envelope.files)) {
            const rawPath = typeof file?.path === "string" ? file.path.trim().toLowerCase() : "";
            const key = rawPath.startsWith("./") ? rawPath.slice(2) : rawPath;
            if (!portablePath(key, '') || paths.has(key) || typeof file.content !== 'string') {
                error('invalid-file', 'files', 'Each embedded source needs a unique path and text content.');
            } else {
                paths.add(key);
            }
        }
        for (const field of ['entry', 'trustedEntry', 'gpuiPageEntry']) {
            if (typeof manifest[field] === 'string' && !paths.has(manifest[field].trim().toLowerCase())) {
                error('missing-entry', field, 'The declared source file is absent from the package.');
            }
        }
    }

    if (!object(manifest) || !Object.hasOwn(manifest, 'apiVersion')) {
        throw new Error('Expected an original API 2 plugin manifest, .echo package, or Workshop item.');
    }
    if (manifest.apiVersion !== host.original.apiVersion) error('api-version', 'apiVersion', 'GPUI supports original plugin API 2.');
    if (typeof manifest.id !== 'string' || !idPattern.test(manifest.id)) error('invalid-id', 'id', 'Use 1–80 ASCII identifier characters.');
    if (typeof manifest.version !== 'string' || !manifest.version.trim()) error('invalid-version', 'version', 'Set a nonempty version.');
    if (item && (lower(item.id) !== lower(manifest.id) || item.version !== manifest.version)) {
        error('manifest-mismatch', 'manifest', 'The item and embedded manifest must agree on ID and version.');
    }
    if (!portablePath(manifest.entry, '.js')) error('invalid-entry', 'entry', 'Set a package-relative .js entry.');
    const permissions = new Set();
    if (manifest.permissions !== undefined && !Array.isArray(manifest.permissions)) {
        error('invalid-permissions', 'permissions', 'Expected a list of permission names.');
    }
    for (const permission of list(manifest.permissions)) {
        if (typeof permission !== 'string') {
            error('invalid-permissions', 'permissions', 'Expected string permission names.');
            continue;
        }
        if (permissions.has(permission)) error('duplicate-permission', permission, 'Declare each permission once.');
        permissions.add(permission);
        const restricted = Object.hasOwn(host.original.restrictedPermissionPackages, permission)
            ? host.original.restrictedPermissionPackages[permission] : null;
        if (restricted) {
            if (!restricted.includes(lower(manifest.id))) {
                error('restricted-permission', permission, 'This permission is limited to named GPUI packages.');
            } else {
                warn('restricted-permission', permission, 'The installed host still checks the original package identity.');
            }
        } else if (!host.original.acceptedPermissions.includes(permission)) {
            error('unknown-permission', permission, 'This permission is unavailable in the SDK host snapshot.');
        }
    }

    if (item?.networkHosts !== undefined) {
        const hosts = list(item.networkHosts);
        const { standard, trustedSource } = host.original.networkHostLimits;
        const limit = permissions.has('system:full') && permissions.has('sources:provide')
            ? trustedSource : standard;
        if (!Array.isArray(item.networkHosts) || hosts.length > limit) {
            error('network-host-limit', 'networkHosts', 'Expected a list with at most ' + limit + ' hostnames.');
        }
        if (hosts.length && !permissions.has('network:request')) {
            error('missing-permission', 'networkHosts', 'Declare network:request to use a network host list.');
        }
        for (const host of hosts) {
            const name = typeof host === 'string' ? host.trim() : '';
            const ascii = name && !/[\s:/@?#%]/u.test(name) && domainToASCII(name);
            if (!ascii || !ascii.includes('.') || isIP(ascii) || name.length > 253
                || ascii.split('.').some(label => !/^[a-z0-9-]{1,63}$/i.test(label))) {
                error('invalid-network-host', 'networkHosts', 'Use concrete domain names without schemes, ports, or wildcards.');
                break;
            }
        }
    }

    if (Object.hasOwn(manifest, 'trustedEntry') !== permissions.has('system:full')
        || (Object.hasOwn(manifest, 'trustedEntry') && !portablePath(manifest.trustedEntry, '.mjs'))) {
        error('trusted-entry', 'trustedEntry', 'A package-relative .mjs trusted entry and system:full must be declared together.');
    }
    for (const field of ['panel', 'extensionImports']) {
        if (Object.hasOwn(manifest, field)) error('unsupported-manifest-field', field, 'This manifest field is unavailable in the GPUI loader.');
    }
    if (Object.hasOwn(manifest, 'trustedRuntime') && !['persistent', 'on-demand'].includes(manifest.trustedRuntime)) {
        error('unsupported-trusted-runtime', 'trustedRuntime', 'Use persistent or on-demand for the trusted runtime.');
    }
    if (Object.hasOwn(manifest, 'gpuiPageEntry') && (!permissions.has('system:full') || !portablePath(manifest.gpuiPageEntry, '.mjs'))) {
        error('native-page-entry', 'gpuiPageEntry', 'Use a package-relative .mjs entry and grant system:full.');
    }
    if (Object.hasOwn(manifest, 'credentials') && (!permissions.has('system:full') || !permissions.has('fs:plugin')
        || !Array.isArray(manifest.credentials?.keys) || manifest.credentials.keys.length > 8
        || manifest.credentials.keys.some(key => typeof key !== 'string' || !idPattern.test(key)))) {
        error('package-credentials', 'credentials', 'Declare up to eight credential keys with system:full and fs:plugin.');
    }

    const contributes = manifest.contributes;
    if (!object(contributes)) {
        error('invalid-contributions', 'contributes', 'Expected a contributions object.');
    } else {
        const grants = { sourceProviders: 'sources:provide', lyricsProviders: 'lyrics:provide' };
        const limits = host.original.packageLimits;
        for (const [field, entries] of Object.entries(contributes)) {
            if (field === 'panels' && !manifest.gpuiPageEntry
                && !Object.values(host.original.builtInPackages).includes(lower(manifest.id))) {
                warn('native-page-entry-missing', 'contributes.panels', 'Provide gpuiPageEntry to render panels on the native host.');
            }
            if (!Object.hasOwn(limits, field)) {
                error('unsupported-contribution', 'contributes.' + field, 'This contribution type is unavailable in the GPUI loader.');
                continue;
            }
            if (!Array.isArray(entries) || entries.length > limits[field]) {
                error('contribution-limit', 'contributes.' + field, 'Expected a list with at most ' + limits[field] + ' entries.');
                continue;
            }
            if (entries.length && Object.hasOwn(grants, field) && !permissions.has(grants[field])) {
                error('missing-permission', 'contributes.' + field, 'Declare ' + grants[field] + ' in permissions.');
            }
            if (field === 'settings' && entries.length && lower(manifest.id) === host.original.builtInPackages.ototabi) {
                warn('package-settings', 'contributes.settings', 'This built-in package uses its native settings.');
                continue;
            }
            if (field === 'settings' && entries.length && (!permissions.has('fs:plugin') || !list(contributes.lyricsProviders).length)) {
                error('settings-scope', 'contributes.settings', 'General legacy settings require a lyric provider and fs:plugin.');
            }
            const ids = new Set();
            for (const [index, entry] of entries.entries()) {
                const at = 'contributes.' + field + '[' + index + ']';
                if (typeof entry?.id !== 'string' || !idPattern.test(entry.id) || ids.has(entry.id)
                    || typeof entry.title !== 'string' || !entry.title.trim() || Buffer.byteLength(entry.title.trim()) > 512) {
                    error('invalid-contribution', at, 'Each contribution needs a unique ID and title.');
                }
                ids.add(entry?.id);
                if (field === 'commands' && (entry?.confirm != null
                    || (entry?.parameters !== undefined && (!Array.isArray(entry.parameters) || entry.parameters.length))
                    || (entry?.exported !== undefined && entry.exported !== false) || entry?.timeoutMs != null)) {
                    error('unsupported-command-option', at, 'Command forms, confirmation, export, and custom timeouts are unavailable.');
                }
                if (['playerBarActions', 'trackContextMenus'].includes(field)
                    && (!list(contributes.commands).some(command => command.id === entry?.commandId)
                        || (entry?.selection != null && entry.selection !== 'single'))) {
                    error('invalid-surface-action', at, 'Reference a declared command and use single selection.');
                }
                if (field === 'settings' && (entry?.type !== 'boolean' || typeof entry.defaultValue !== 'boolean')) {
                    error('unsupported-setting', at, 'Only Boolean settings with a default value are supported.');
                }
            }
        }
        if (!['commands', 'sourceProviders', 'lyricsProviders'].some(field => list(contributes[field]).length)
            && !permissions.has('system:full')) {
            error('empty-contributions', 'contributes', 'Declare a command or provider, or supply a trusted runtime.');
        }
    }

    for (const [names, registry, label] of [
        [actions, host.original.actionPermissions, 'action'],
        [events, host.original.eventPermissions, 'event'],
    ]) {
        for (const name of new Set(names)) {
            if (!Object.hasOwn(registry, name)) {
                warn('unlisted-' + label, name, 'This name is outside the generated GPUI ' + label + ' registry.');
                continue;
            }
            const missing = registry[name].filter(permission => !permissions.has(permission));
            if (missing.length) error('missing-permission', name, 'Declare ' + missing.join(', ') + ' in permissions.');
        }
    }

    return { kind, id: typeof manifest.id === 'string' ? manifest.id : null, apiVersion: manifest.apiVersion,
        ok: !issues.some(issue => issue.level === 'error'), issues };
}
