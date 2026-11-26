import type { Json, SearchSource, WorkshopContext } from '../starter/echo-workshop.js';

export interface CoreSnapshot {
    target: { core: string; run: string; zone: number };
    boundary: {
        command_revision: number;
        playback: { zone: number; run: string; sequence: number } | null;
        queue: { zone: number; run: string; revision: number };
    };
    queue_position: number | null;
    track_id: string | null;
    playback: {
        state: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped';
        track: { title: string; artist: string } | null;
        positionMs: number;
        durationMs: number;
        volume: number;
        volumeControlEnabled: boolean;
        error: string | null;
        queue: { revision: number };
    };
}
export interface CoreDescription {
    protocol: number;
    commands: string[];
    subscriptions: string[];
    /** Maximum number of tracks per queue.submit call. */
    maxQueueItems: number;
    queueCapacity: number;
    maxSourcePageSize: number;
}
export interface AppContributions {
    sources?: ({ id: string; title: string } & SearchSource)[];
    commands?: { id: string; title: string; run: Parameters<WorkshopContext['commands']['register']>[2] }[];
}
export interface AppRegistration {
    /** Rejects on an unexpected disconnect. The app can register again on the new Core. */
    closed: Promise<void>;
    close(): Promise<void>;
}
export interface DiscoverySnapshot {
    /** Only comparable within one running Core. */
    revision: number;
    sources: Awaited<ReturnType<WorkshopContext['sources']['list']>>;
    commands: Awaited<ReturnType<WorkshopContext['commands']['core']['list']>>;
}
export interface CoreClient {
    readonly zone: 1 | 2;
    /** Connect another control session to a different playback zone of the same Core. */
    forZone(zone: 1 | 2): CoreClient;
    /** Yields the initial directory, then the latest directory when a registration changes. */
    watchDiscovery(options?: { signal?: AbortSignal; reconnect?: boolean }): AsyncIterableIterator<DiscoverySnapshot>;
    provide(contributions: AppContributions): Promise<AppRegistration>;
    describe(): Promise<CoreDescription>;
    invoke(method: string, input?: Json): Promise<Json>;
    watch(options?: { signal?: AbortSignal }): AsyncIterable<CoreSnapshot>;
    sources: Pick<WorkshopContext['sources'], 'list' | 'browse' | 'search'>;
    queue: Omit<WorkshopContext['queue'], 'onChanged' | 'saved'> & {
        saved: Omit<WorkshopContext['queue']['saved'], 'onChanged'>;
    };
    playback: Omit<WorkshopContext['playback'], 'onChanged' | 'onTrackChanged'>;
    library: Pick<WorkshopContext['library'], 'query' | 'track' | 'summary' | 'album' | 'albumForTrack' | 'artist'
        | 'relatedAlbums' | 'albumVersions' | 'similarLocalTracks'
        | 'albums' | 'artists' | 'trackVersions' | 'editTrackVersions' | 'linkedTracks' | 'searchTracks' | 'playlistItems'>;
    audio: Omit<WorkshopContext['audio'], 'onAnalysis' | 'onSignalPathChanged'>;
    artwork: Pick<WorkshopContext['artwork'], 'track' | 'album' | 'artist' | 'current'>;
    history: WorkshopContext['history'];
    lyrics: Omit<WorkshopContext['lyrics'], 'registerProvider'>;
    sleepTimer: Omit<WorkshopContext['sleepTimer'], 'onTick'>;
    commands: WorkshopContext['commands']['core'];
    close(): void;
}
export function createCoreClient(options: {
    database: string;
    appId: string;
    zone?: 1 | 2;
    /** Path to echo-corectl. Defaults to ECHO_CORECTL, the matching SDK binary, or PATH. */
    executable?: string;
}): CoreClient;
