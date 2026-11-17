export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Awaitable<T> = T | Promise<T>;
type Descriptor = { title: string };

export interface WorkshopRequest {
    method: string;
    input: Json;
    signal: AbortSignal;
}

export interface WorkshopAction {
    label: string;
    method: string;
    input?: Json;
}

export interface WorkshopPage {
    title: string;
    description?: string;
    fields?: { id: string; label: string; value?: string; secret?: boolean }[];
    actions?: WorkshopAction[];
    rows?: { title: string; detail?: string; actions?: WorkshopAction[] }[];
}

export interface TrackReference {
    providerTrackId: string;
    title: string;
    artist?: string;
}

export interface StreamTrack {
    title: string;
    url: string;
    artist?: string;
    album?: string;
    duration?: number;
    cover?: string;
    lyrics?: string;
    bearer?: string;
}

export interface SearchSource {
    search(request: { query: string; page: number; pageSize: number; signal: AbortSignal }):
        Awaitable<{ tracks: TrackReference[]; hasMore?: boolean }>;
    resolve(request: { providerTrackId: string; signal: AbortSignal }): Awaitable<StreamTrack>;
}

interface TagLookup {
    track: { id: string; title: string; artist: string; album: string; albumArtist: string; duration: number };
    provider: { pluginId: string; providerId: string };
    signal: AbortSignal;
}

interface TagCandidate {
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    genre?: string;
    source?: string;
    description?: string;
    imageUrl?: string;
    year?: number;
    trackNo?: number;
    discNo?: number;
    bpm?: number;
    confidence?: number;
}

type TagProvider = (request: TagLookup) => Awaitable<{ candidates: TagCandidate[] }>;

interface TagRegistry {
    registerProvider(id: string, handler: TagProvider): () => void;
    registerProvider(id: string, descriptor: Descriptor, handler: TagProvider): () => void;
}

interface HostDescription {
    protocol: number;
    commands: string[];
    events: string[];
    maxQueueItems: number;
    queueCapacity: number;
}

interface CommandDescriptor extends Descriptor {
    pluginId: string;
    commandId: string;
}

export type CatalogSource = 'Local' | 'Legacy';
export type CatalogCategory = 'Songs' | 'Albums' | 'Artists' | 'Playlists' | 'Liked' | 'LikedAlbums';
export type CatalogKind = 'Track' | 'Album' | 'Artist' | 'Playlist';
export interface CatalogQuery {
    source?: CatalogSource;
    page?: number;
    search?: string;
    category?: CatalogCategory;
    parent?: { id: string; kind: CatalogKind; title: string };
    options?: { [key: string]: Json };
}
export type CatalogPageOptions = Pick<CatalogQuery, 'source' | 'page' | 'search'>;
export interface CatalogEntry {
    id: string;
    title: string;
    subtitle: string;
    kind: CatalogKind;
    duration: number;
    playable: boolean;
    liked: boolean;
    count: number;
    album: string | null;
    album_artist: string | null;
}
export interface CatalogPage {
    entries: CatalogEntry[];
    page: number;
    hasNext: boolean;
    total: number | null;
}
export type PlaylistPatch =
    | { title: string; description?: string }
    | { title?: string; description: string };
export type PlaylistRecoveryEntry = {
    id: string;
    title: string;
    count: number;
    createdAt: string;
} & (
    | { kind: 'playlist'; action: 'delete' }
    | { kind: 'items'; action: 'remove' | 'move' | 'clean' | 'relink' }
    | { kind: 'cloud'; action: 'cloud-overwrite' | 'cloud-delete' }
);
export interface PlaylistItemTrack {
    id: string;
    mediaType: 'local' | 'remote';
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    trackNo: number | null;
    discNo: number | null;
    year: number | null;
    genre: string | null;
    durationSeconds: number;
    codec: string | null;
    sampleRate: number | null;
    bitDepth: number | null;
    bitrate: number | null;
    coverUrl: string | null;
    unavailable: boolean;
}
export interface PlaylistItem {
    id: string;
    playlistId: string;
    /** Zero-based position in the playlist's stored order. */
    position: number;
    title: string;
    artist: string;
    unavailable: boolean;
    track: PlaylistItemTrack | null;
}
export interface PlaylistItemPage {
    items: PlaylistItem[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
}
export interface PlaylistSummary {
    id: string;
    title: string;
    description: string;
    itemCount: number;
    smart: boolean;
    sort: { key: string; descending: boolean } | null;
}
export interface PlaylistSummaryPage {
    items: PlaylistSummary[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
}
export interface GenreQuery extends CatalogPageOptions {
    parent?: string;
    pageSize?: number;
    chinese?: boolean;
    sort?: 'most_tracks' | 'fewest_tracks' | 'name_ascending' | 'name_descending';
}
export interface GenreEntry {
    id: string;
    name: string;
    trackCount: number;
    albumCount: number;
}
export interface GenrePage extends WorkshopPageResult<GenreEntry> {
    total: number;
    summary: GenreEntry | null;
}
export type BrowseFacet = 'year' | 'decade' | 'genre' | 'composer' | 'conductor' | 'performer';
export interface AlbumDetails {
    trackCount: number;
    duration: number;
    likedCount: number;
    discs: number[];
    discTitles: Record<number, string>;
    year: number | null;
    addedAt: string | null;
    liked: boolean;
    rating: number | null;
    genres: string[];
    unplayed: number | null;
    quality: string | null;
    withLyrics: number | null;
}
export interface ArtistDetails {
    trackCount: number;
    albumCount: number;
    duration: number;
    firstYear: number | null;
    lastYear: number | null;
    genres: string[];
    plays: number;
    listened: number;
    lastPlayed: string | null;
    topTracks: { track: CatalogEntry; plays: number }[];
    relatedArtists: CatalogEntry[];
}
export interface WorkshopPageResult<T> {
    entries: T[];
    page: number;
    hasNext: boolean;
}
export type HistorySnapshot = [number, number];
export interface HistoryQuery extends CatalogPageOptions {
    snapshot?: HistorySnapshot;
    category?: 'Tracks' | 'Playlists' | 'Albums' | 'Radio' | 'Podcasts';
    sort?: 'Recent' | 'Plays' | 'Duration' | 'Title' | 'Artist';
    ascending?: boolean;
    sessions?: boolean;
    counted?: boolean;
    range?: 'All' | 'Today' | 'Week' | 'Month' | 'Year' | 'Day' | 'Custom';
    from?: string;
    to?: string;
}
export interface HistoryEntry {
    id: string;
    trackId: string | null;
    title: string;
    artist: string;
    album: string;
    started: string;
    ended: string | null;
    day: string;
    played: number;
    duration: number;
    counted: boolean;
    origin: string;
    originId: string | null;
    label: string;
    plays: number;
    tracks: number;
}
export interface HistoryPage extends WorkshopPageResult<HistoryEntry> {
    pages: number;
    total: number;
    snapshot: HistorySnapshot;
}
export type HistoryReviewQuery = Pick<HistoryQuery, 'source' | 'snapshot' | 'range' | 'from' | 'to' | 'search' | 'counted'>;
export interface HistoryTotals {
    plays: number;
    tracks: number;
    artists: number;
    counted: number;
    seconds: number;
    latest: string | null;
}
export interface HistoryReview {
    snapshot: HistorySnapshot;
    totals: HistoryTotals;
    previous: HistoryTotals;
    activity: { date: string; plays: number; seconds: number }[];
    topTracks: HistoryEntry[];
    topArtists: HistoryEntry[];
    topAlbums: HistoryEntry[];
}
export type PersonalTagKind = 'track' | 'album' | 'artist';
export interface PersonalTagTarget {
    kind: PersonalTagKind;
    id: string;
}
export interface PersonalTag {
    id: string;
    name: string;
    itemCount: number;
    assigned: boolean | null;
}
export interface PersonalTagItem extends PersonalTagTarget {
    title: string;
    subtitle: string;
    available: boolean;
}
export type PersonalTagEdit = { action: 'create'; name: string }
    | { action: 'rename'; id: string; name: string }
    | { action: 'delete'; id: string }
    | { action: 'assign'; id: string; target: PersonalTagTarget; assigned: boolean };
export interface SmartFilters {
    liked?: boolean | null;
    excludeNeverRecommend?: boolean | null;
    unplayed?: boolean;
    genre?: string | null;
    codec?: string | null;
    folderId?: string | null;
    yearFrom?: number | null;
    yearTo?: number | null;
    bpmFrom?: number | null;
    bpmTo?: number | null;
    minPlayCount?: number | null;
    maxPlayCount?: number | null;
    minSkipCount?: number | null;
    minSampleRate?: number | null;
    addedWithinDays?: number | null;
    playedWithinDays?: number | null;
}
export type SmartField = 'title' | 'artist' | 'album' | 'albumArtist' | 'genre' | 'codec' | 'path'
    | 'year' | 'bpm' | 'duration' | 'playCount' | 'skipCount' | 'sampleRate' | 'bitDepth' | 'bitrate'
    | 'dateAdded' | 'lastPlayed' | 'lastSkipped' | 'liked' | 'instrumental' | 'replayGainStatus';
export type SmartOperator = 'is' | 'isNot' | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
    | 'greaterThan' | 'atLeast' | 'lessThan' | 'atMost' | 'between' | 'isEmpty' | 'isNotEmpty'
    | 'withinLastDays' | 'notWithinLastDays';
export type SmartCondition = { type: 'group'; match: 'all' | 'any'; children: SmartCondition[] }
    | { type: 'rule'; field: SmartField; operator: SmartOperator; value?: Json; valueTo?: Json };
export interface SmartRules {
    version?: 1 | 2;
    match?: 'all' | 'any';
    limit?: number;
    sort?: 'recentlyAdded' | 'recentlyPlayed' | 'mostPlayed' | 'leastPlayed' | 'title' | 'random';
    filters?: SmartFilters;
    condition?: SmartCondition | null;
    sorts?: { field: SmartField; direction: 'asc' | 'desc' }[] | null;
    albumSource?: Json;
}
export interface SmartPreviewSummary {
    items: CatalogEntry[];
    candidateCount: number;
    includedCount: number;
    requestedLimit: number;
    hasMore: boolean;
}
export type PlaybackMode = 'Sequential' | 'Shuffle' | 'RepeatOne' | 'RepeatAll';
export type RepeatMode = 'off' | 'one' | 'all';
export interface PlaybackSnapshot {
    status: 'idle' | 'starting' | 'playing' | 'paused' | 'stopped' | 'ended';
    title: string;
    artist: string;
    position: number;
    duration: number;
    volume: number;
    rate: number;
    mode: PlaybackMode;
    queueId: number;
    queuePosition: number;
    queueLength: number;
}
export interface LibraryChange {
    source: CatalogSource;
    revision: number;
}
export interface CurrentTrack {
    sequence: number;
    title: string;
    artist: string;
    catalog: { source: CatalogSource; id: string } | null;
}
export interface QueueChange {
    queueId: number;
    position: number;
    total: number;
}
export interface AudioAnalysisFrame {
    /** Matches CurrentTrack.sequence. */
    sequence: number;
    /** Host visualization bands in [0, 1], from lowest to highest. May be empty. */
    spectrum: number[];
    /** Loudest channel sample peak in dBFS, when available. */
    peakDbfs: number | null;
    /** Loudest channel RMS in dBFS, when available. */
    rmsDbfs: number | null;
}
export type AudioOutputMode = 'shared' | 'exclusive' | 'asio' | 'ks' | 'directsound' | 'waveout';
export interface AudioOutputDevice {
    id: string;
    name: string;
    isDefault: boolean;
    dedicatedMode: AudioOutputMode | null;
}
export interface ConfiguredAudioOutput {
    mode: AudioOutputMode;
    automatic: boolean;
    device: AudioOutputDevice | null;
    latencyProfile: 'lowLatency' | 'balanced' | 'stable';
}
export type AudioOutputChange =
    | { target: { kind: 'automatic' }; mode?: never; latencyProfile?: never }
    | {
        target?: { kind: 'systemDefault' } | { kind: 'device'; id: string };
        mode?: AudioOutputMode;
        latencyProfile?: ConfiguredAudioOutput['latencyProfile'];
    };
export interface AudioOutputStatus {
    status: PlaybackSnapshot['status'];
    route: 'local' | 'dlna' | 'hqplayer';
    configured: ConfiguredAudioOutput;
    /** Local Audio Host report when available. Remote routes and an unopened output return null. */
    active: {
        mode: AudioOutputMode;
        name: string;
        backend: string;
        sampleRate: number;
        hardwareSampleRate: number;
        sampleRateReadbackValid: boolean | null;
        channels: number;
        bufferFrames: number;
        format: string | null;
    } | null;
}
export type PlaybackCommand =
    | { action: 'toggle' | 'pause' | 'resume' | 'previous' | 'next' | 'stop' | 'toggleShuffle' | 'cycleRepeat' }
    | { action: 'seek' | 'seekBy'; seconds: number }
    | { action: 'setVolume'; volume: number }
    | { action: 'setMode'; mode: PlaybackMode }
    | { action: 'setShuffle'; enabled: boolean }
    | { action: 'setRepeat'; mode: RepeatMode };
export type QueueItem =
    | { kind: 'catalog'; source: CatalogSource; id: string }
    | ({ kind: 'stream'; id: string } & StreamTrack);
export type QueueEdit =
    | { action: 'clear' | 'undo' }
    | { action: 'remove' | 'moveAfterCurrent'; input: number[] }
    | { action: 'move'; input: { from: number; to: number } }
    | { action: 'reorder'; input: number[] }
    | { action: 'moveTo'; input: { indices: number[]; offset: number } }
    | { action: 'setRemoveAfterPlay'; input: { indices: number[]; enabled: boolean } };
export interface QueuePage {
    queueId: number;
    position: number;
    offset: number;
    total: number;
    hasNext: boolean;
    items: { title: string; artist: string; occurrenceId?: string | null; catalog: { source: CatalogSource; id: string } | null }[];
}
export interface LyricLine {
    timeMs: number | null;
    endMs: number | null;
    text: string;
    translation: string | null;
    romanization: string | null;
    words: { text: string; startMs: number; endMs: number | null }[];
}

export type SleepTimerAction = 'pause' | 'stop' | 'quit';

export interface SleepTimerStart {
    durationMinutes: number;
    action: SleepTimerAction;
    fadeOut: boolean;
}

export interface SleepTimerStatus {
    isActive: boolean;
    remainingMs: number;
    durationMinutes: number;
    action: SleepTimerAction;
    fadeOutEnabled: boolean;
}

export interface WorkshopContext {
    readonly pluginId: string;
    readonly contentRoot: string;
    readonly dataRoot: string;
    hostInvoke(method: 'host.describe'): Promise<HostDescription>;
    hostInvoke(method: string, input?: Json): Promise<Json>;
    onEvent(listener: (event: string, value: Json) => Awaitable<void>): () => void;
    readonly storage: {
        get(key: string): Promise<Json>;
        set(key: string, value: Json): Promise<void>;
        remove(key: string): Promise<void>;
    };
    readonly credentials: {
        get(key: string): Promise<string | null>;
        set(key: string, value: string): Promise<null>;
        remove(key: string): Promise<null>;
    };
    readonly sleepTimer: {
        getStatus(): Promise<SleepTimerStatus>;
        /** Duration is a whole number of minutes from 1 to 720. */
        start(input: SleepTimerStart): Promise<SleepTimerStatus>;
        cancel(): Promise<SleepTimerStatus>;
        onTick(listener: (event: { remainingMs: number }) => Awaitable<void>): () => void;
    };
    readonly library: {
        onChanged(listener: (event: LibraryChange) => Awaitable<void>): () => void;
        onFavoritesChanged(listener: (event: LibraryChange) => Awaitable<void>): () => void;
        query(options?: CatalogQuery): Promise<CatalogPage>;
        track(id: string, source?: CatalogSource): Promise<CatalogEntry>;
        /** Returns found local tracks in input order, with duplicates removed. */
        tracksByIds(ids: string[]): Promise<CatalogEntry[]>;
        /** Recorded local catalog skips and the latest skip's UTC timestamp. */
        trackSkipStats(id: string): Promise<{ skipCount: number; lastSkippedAt: string | null }>;
        albums(options?: CatalogPageOptions): Promise<CatalogPage>;
        albumTracks(id: string, options?: CatalogPageOptions): Promise<CatalogPage>;
        artists(options?: CatalogPageOptions): Promise<CatalogPage>;
        artistTracks(id: string, options?: CatalogPageOptions): Promise<CatalogPage>;
        artistAlbums(id: string, options?: CatalogPageOptions): Promise<CatalogPage>;
        albumDetails(id: string, source?: CatalogSource): Promise<AlbumDetails>;
        artistDetails(id: string, source?: CatalogSource): Promise<ArtistDetails>;
        genres(options?: GenreQuery): Promise<GenrePage>;
        genreAlbums(id: string, options?: CatalogPageOptions): Promise<CatalogPage>;
        genreTracks(id: string, options?: CatalogPageOptions): Promise<CatalogPage>;
        facets(facet: BrowseFacet, source?: CatalogSource): Promise<{ value: string; label: string }[]>;
        likedTracks(options?: CatalogPageOptions): Promise<CatalogPage>;
        likedAlbums(options?: CatalogPageOptions): Promise<CatalogPage>;
        playlists(options?: CatalogPageOptions): Promise<CatalogPage>;
        playlistTracks(id: string, options?: { source?: CatalogSource; page?: number }): Promise<CatalogPage>;
        playlistItems(id: string, options?: { page?: number; pageSize?: number }): Promise<PlaylistItemPage>;
        playlistSummary(id: string): Promise<PlaylistSummary>;
        playlistSummaries(options?: { page?: number; pageSize?: number; search?: string }): Promise<PlaylistSummaryPage>;
        createPlaylistWithDetails(details: { title: string; description?: string }): Promise<PlaylistSummary>;
        prependPlaylistTracks(id: string, trackIds: string[]): Promise<PlaylistItem[]>;
        removePlaylistItems(id: string, itemIds: string[]): Promise<{ affectedCount: number; recoveryId: string }>;
        playPlaylist(id: string, options?: { source?: CatalogSource; trackId?: string }): Promise<null>;
        queuePlaylist(id: string, options?: { source?: CatalogSource }): Promise<null>;
        createPlaylist(title: string, tracks?: string[]): Promise<{ id: string }>;
        renamePlaylist(id: string, title: string): Promise<null>;
        updatePlaylist(id: string, change: PlaylistPatch): Promise<null>;
        /** Move a song to a one-based position in a manually ordered local playlist. */
        movePlaylistTrack(id: string, trackId: string, position: number): Promise<null>;
        /** Move a playlist item to a zero-based position in the stored order. */
        movePlaylistItem(id: string, itemId: string, position: number): Promise<null>;
        /** Archive a local playlist so the user can recover it later. */
        archivePlaylist(id: string): Promise<null>;
        playlistRecovery(page?: number): Promise<WorkshopPageResult<PlaylistRecoveryEntry>>;
        restorePlaylistRecovery(entry: Pick<PlaylistRecoveryEntry, 'kind' | 'id'>): Promise<null>;
        setPlaylistTracks(id: string, tracks: string[], present: boolean): Promise<null>;
        setLiked(id: string, liked: boolean): Promise<null>;
        setAlbumLiked(id: string, liked: boolean, source?: CatalogSource): Promise<null>;
        readonly tags: {
            list(options?: { page?: number; target?: PersonalTagTarget }): Promise<WorkshopPageResult<PersonalTag>>;
            items(id: string, kind: PersonalTagKind, page?: number): Promise<WorkshopPageResult<PersonalTagItem>>;
            mixedItems(id: string, page?: number): Promise<{
                items: PersonalTagItem[];
                page: number;
                pageSize: number;
                total: number;
                hasMore: boolean;
            }>;
            change(edit: PersonalTagEdit): Promise<{ id: string } | null>;
        };
        readonly smart: {
            rules(id: string, source?: CatalogSource): Promise<SmartRules>;
            preview(rules: SmartRules, page?: number): Promise<CatalogPage>;
            previewSummary(rules: SmartRules): Promise<SmartPreviewSummary>;
            create(title: string, rules: SmartRules): Promise<{ id: string }>;
            update(id: string, title: string, rules: SmartRules): Promise<{ id: string }>;
            freeze(id: string, options?: { title?: string }): Promise<{ id: string; title: string; count: number }>;
        };
    };
    readonly history: {
        list(options?: HistoryQuery): Promise<HistoryPage>;
        review(options?: HistoryReviewQuery): Promise<HistoryReview>;
    };
    readonly playback: {
        onChanged(listener: (state: PlaybackSnapshot) => Awaitable<void>): () => void;
        onTrackChanged(listener: (track: CurrentTrack | null) => Awaitable<void>): () => void;
        get(): Promise<PlaybackSnapshot>;
        getCurrentTrack(): Promise<CurrentTrack | null>;
        getRate(): Promise<number>;
        setRate(rate: number): Promise<number>;
        control(command: PlaybackCommand): Promise<null>;
        setMode(mode: PlaybackMode): Promise<null>;
        seekBy(seconds: number): Promise<null>;
        setShuffle(enabled: boolean): Promise<null>;
        toggleShuffle(): Promise<null>;
        setRepeat(mode: RepeatMode): Promise<null>;
        cycleRepeat(): Promise<null>;
        getLyrics(): Promise<{ lines: LyricLine[]; trackOffsetMs: number }>;
    };
    readonly audio: {
        /** Latest local playback analysis, or null while no current frame is available. */
        onAnalysis(listener: (frame: AudioAnalysisFrame | null) => Awaitable<void>): () => void;
        readonly output: {
            getStatus(): Promise<AudioOutputStatus>;
            listDevices(): Promise<AudioOutputDevice[]>;
            /** Apply a local route change and return the accepted configuration. */
            setOutput(change: AudioOutputChange): Promise<ConfiguredAudioOutput>;
        };
    };
    readonly queue: {
        onChanged(listener: (event: QueueChange) => Awaitable<void>): () => void;
        get(options?: { offset?: number; queueId?: number }): Promise<QueuePage>;
        playItem(queueId: number, occurrenceId: string): Promise<null>;
        edit(queueId: number, edit: QueueEdit): Promise<null>;
        submit(request: { mode: 'play' | 'append' | 'playNext'; tracks: QueueItem[]; index?: number }): Promise<null>;
    };
    readonly pages: {
        invalidate(): void;
        register(id: string, descriptor: Descriptor, open: (request: { signal: AbortSignal }) =>
            Awaitable<WorkshopPage>): void;
    };
    readonly sources: {
        registerProvider(id: string, descriptor: Descriptor, handlers: SearchSource): void;
    };
    readonly commands: {
        register(id: string, descriptor: Descriptor, run: (input: Json, context: {
            callerPluginId: string;
            signal: AbortSignal;
        }) => Awaitable<Json>): void;
        list(): Promise<CommandDescriptor[]>;
        invoke(pluginId: string, commandId: string, input?: Json): Promise<Json>;
    };
    readonly metadata: TagRegistry;
    readonly covers: TagRegistry;
}
