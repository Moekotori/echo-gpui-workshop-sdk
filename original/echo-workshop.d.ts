import type { AudioSignalPath, Json, SourceCollectionPlayback, StreamTrack, TrackVersions, VersionTrack, WorkshopArtwork, WorkshopPage } from '../starter/echo-workshop';

type Awaitable<T> = T | Promise<T>;

export interface WebRequest {
    url: string;
    referer?: string;
    requestGroup?: string;
    credentials?: 'omit';
}

export interface ArchiveRequest {
    format: 'osu';
    filename: string;
    url: string;
    referer?: string;
    credentials?: 'omit';
}

export interface MediaImportState {
    phase: 'idle' | 'choosing' | 'downloading' | 'importing' | 'done' | 'cancelled' | 'error';
    directory: string | null;
    filename?: string;
    receivedBytes?: number;
    totalBytes?: number | null;
    importedCount?: number;
    error?: string | null;
}

interface TrustedMethods {
    'credentials.get': [{ key: string }, string | null];
    'credentials.set': [{ key: string; value: string }, null];
    'credentials.remove': [{ key: string }, null];
    'sandbox.evaluate': [{ origin: string; code: string }, Json];
    'sandbox.destroy': [void, null];
    'web.configure': [{ loginUrl: string; title?: string; downloadPorts?: number[] }, { ready: true; version: 1 }];
    'web.open': [void, { loginOpen: boolean }];
    'web.close': [void, null];
    'web.state': [void, { loginOpen: boolean; credentialsError: string | null }];
    'web.fetchText': [WebRequest, string];
    'web.fetchJson': [WebRequest, Json];
    'web.cancelRequests': [{ requestGroup?: string }, null];
    'web.logout': [void, null];
    'mediaImport.state': [void, MediaImportState];
    'mediaImport.chooseDirectory': [void, MediaImportState];
    'mediaImport.lookup': [{ filenames: string[]; includeDownloaded?: boolean }, { filename: string; trackId: string | null }[]];
    'mediaImport.start': [ArchiveRequest, MediaImportState];
    'mediaImport.cancel': [void, MediaImportState];
}

export interface OriginalTrustedContext {
    pluginId: string;
    pluginName: string;
    contentRoot: string;
    revision: string;
    hostInvoke<K extends keyof TrustedMethods>(method: K, ...args: TrustedMethods[K][0] extends void ? [] : [TrustedMethods[K][0]]): Promise<TrustedMethods[K][1]>;
}

export interface OriginalPlaybackStatus {
    state: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended';
    currentTrackId: string | null;
    positionSeconds: number;
    durationSeconds: number;
    volume: number;
    playbackRate: number;
    shuffleEnabled: boolean;
    repeatMode: 'off' | 'one' | 'all';
}

export interface OriginalNetworkResponse {
    status: number;
    ok: boolean;
    url: string;
    headers: Record<string, string>;
    body?: string;
    bodyBase64?: string;
}

export interface OriginalTrackContext {
    id: string;
    title: string;
    artist?: string;
    album?: string | null;
    durationSeconds: number;
}

export interface OriginalSourceTrack {
    providerTrackId: string;
    title: string;
    artist?: string;
    album?: string;
    durationSeconds?: number;
    coverUrl?: string | null;
    kind?: 'track' | 'collection';
    playable?: boolean;
    itemCount?: number;
}

export type OriginalResolvedSource = Omit<StreamTrack, 'title' | 'duration' | 'cover'> & {
    title?: string;
    durationSeconds?: number;
    coverUrl?: string | null;
};

export interface OriginalSourcePage {
    tracks: OriginalSourceTrack[];
    hasMore?: boolean;
    total?: number;
}

type SourceRequest = { page: number; pageSize: number; signal: AbortSignal };
type OriginalSourceHandlers = {
    search(request: SourceRequest & { query: string }): Awaitable<OriginalSourcePage>;
    browse?(request: SourceRequest & { query: string }): Awaitable<OriginalSourcePage>;
    listCollection?(request: SourceRequest & { collectionId: string }): Awaitable<OriginalSourcePage>;
    resolve?(request: { providerTrackId: string; needArtwork?: boolean; signal: AbortSignal }): Awaitable<OriginalResolvedSource>;
};

export interface OriginalEcho {
    host: {
        getCapabilities(): Promise<{ apiVersion: 2; features: Record<string, FeatureAvailability>; events: string[] }>;
        getFeatureAvailability(id: string): Promise<FeatureAvailability>;
    };
    commands: {
        register(id: string, descriptor: { title: string }, handler: (track?: OriginalTrackContext) => Awaitable<Json | void>): void;
    };
    sources: {
        registerProvider(id: string, descriptor: { title: string }, handlers: OriginalSourceHandlers): void;
        playCollection(providerId: string, collectionId: string, options?: { startTrackId?: string }): Promise<SourceCollectionPlayback>;
        cancelCollection(): Promise<SourceCollectionPlayback>;
        collectionStatus(): Promise<SourceCollectionPlayback>;
    };
    lyrics: {
        registerProvider(id: string, descriptor: { title: string }, handler: (
            input: { track: OriginalTrackContext & { source?: string; sourceId?: string }; lookup: { exact?: boolean; timeoutMs?: number } },
            context: { providerId: string; signal: AbortSignal },
        ) => Awaitable<{ candidates: Json[] }>): void;
    };
    trusted: {
        invoke(method: string, input?: Json): Promise<Json>;
    };
    storage: {
        isSecure(key: string): Promise<boolean>;
        get(key: string): Promise<Json | undefined>;
        set(key: string, value: Json): Promise<void>;
        remove(key: string): Promise<void>;
    };
    network: {
        get(url: string): Promise<OriginalNetworkResponse>;
        request(options: {
            url: string;
            requestId?: string;
            method?: 'GET' | 'HEAD' | 'POST';
            headers?: Record<string, string>;
            body?: string;
        }): Promise<OriginalNetworkResponse>;
        cancel(requestId: string): Promise<void>;
    };
    ui: {
        /** Request a refresh of an active declared native panel. */
        invalidatePage(id: string): void;
        openPanel(id: string): Promise<void>;
        notify(message: string): Promise<void>;
        onDispose(listener: () => Awaitable<void>): () => void;
    };
    playback: {
        getStatus(): Promise<OriginalPlaybackStatus>;
        play(): Promise<unknown>;
        pause(): Promise<unknown>;
        seek(positionSeconds: number): Promise<unknown>;
    };
    /** GPUI compatibility extensions. Discover availability via host.getCapabilities(). */
    library: {
        getArtistArtwork(id: string): Promise<WorkshopArtwork | null>;
        getTrackVersions(id: string): Promise<TrackVersions>;
        getLinkedTracks(id: string): Promise<VersionTrack[]>;
    };
    audio: {
        output: {
            getSignalPath(): Promise<AudioSignalPath>;
            onSignalPathChanged(listener: (path: AudioSignalPath) => Awaitable<void>): () => void;
        };
    };
    queue: { playTrack(trackId: string): Promise<unknown> };
    events: {
        on(event: 'playback:status', listener: (status: OriginalPlaybackStatus) => void): () => void;
        on(event: 'audio:signal-path:changed', listener: (path: AudioSignalPath) => Awaitable<void>): () => void;
    };
    files: {
        export(input: { suggestedName: string; mimeType: 'image/png'; dataBase64: string }): Promise<{ saved: boolean }>;
    };
    presence: {
        steam: {
            getStatus(): Promise<{ available: boolean; allowed: boolean; mode: 'off' | 'basic' | 'detailed' | 'stalker' }>;
            setTemporaryStatus(status: { text: string; includeTrack: boolean; expiresAt: number | null }): Promise<void>;
            clearTemporaryStatus(): Promise<void>;
        };
    };
}

export interface FeatureAvailability {
    supported: boolean;
    granted: boolean;
    available: boolean;
    reason: string | null;
}

export interface OriginalNativePages {
    open(panelId: string, signal: AbortSignal): Awaitable<WorkshopPage>;
    action(input: { data: Json; fields: Record<string, string> }, signal: AbortSignal): Awaitable<WorkshopPage>;
    close?(panelId: string): Awaitable<void>;
    dispose?(): Awaitable<void>;
}

export type ActivateOriginalNativePages = (api: OriginalEcho) => Awaitable<OriginalNativePages>;
