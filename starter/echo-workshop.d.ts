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

export interface WorkshopFieldCommit {
    method: string;
    input?: Json;
}

export type WorkshopFieldControl =
    | { kind: 'toggle'; commit?: WorkshopFieldCommit }
    | { kind: 'range'; min: number; max: number; step: number; unit?: string; commit?: WorkshopFieldCommit }
    | { kind: 'choice'; options: { label: string; value: string }[] };

export interface WorkshopField {
    id: string;
    label: string;
    placeholder?: string;
    value?: string;
    secret?: boolean;
    advanced?: boolean;
    control?: WorkshopFieldControl;
    /** Run an action when Enter submits a text field. */
    submit?: WorkshopFieldCommit;
}

export interface WorkshopBoxStyle {
    gap?: number;
    padding?: number;
    paddingX?: number;
    paddingY?: number;
    minHeight?: number;
    grow?: boolean;
    surface?: boolean;
    radius?: number;
    width?: number;
    background?: string;
    tint?: string;
    nowrap?: boolean;
    border?: boolean;
    borderBottom?: boolean;
    align?: 'start' | 'center' | 'end' | 'stretch';
    justify?: 'start' | 'center' | 'end' | 'spaceBetween';
}
export type WorkshopGlyph =
    | 'search' | 'user' | 'folder' | 'list' | 'grid' | 'download' | 'check'
    | 'play' | 'pause' | 'refresh' | 'left' | 'right' | 'settings' | 'close' | 'music';
export type CanvasCommand =
    | { type: 'rect'; x: number; y: number; width: number; height: number; color: string }
    | { type: 'polyline'; points: [number, number][]; color: string; width: number };

export type WorkshopNode =
    | { type: 'row' | 'column'; children: WorkshopNode[]; style?: WorkshopBoxStyle }
    | { type: 'canvas'; height: number; commands: CanvasCommand[] }
    | { type: 'text'; text: string; role?: 'title' | 'heading' | 'body' | 'muted' | 'accent'; size?: number; color?: string; fontFamily?: string; truncate?: boolean }
    | { type: 'image'; image: string; height: number; width?: number; radius?: number; alt?: string; contain?: boolean }
    | { type: 'field'; id: string; compact?: boolean; hideLabel?: boolean }
    | { type: 'button'; action: WorkshopAction; appearance?: 'primary' | 'quiet' | 'outline' | 'tab'; icon?: WorkshopGlyph; iconOnly?: boolean; selected?: boolean }
    | { type: 'pressable'; action: WorkshopAction; children: WorkshopNode[]; style?: WorkshopBoxStyle }
    | { type: 'pageLink'; page: string; label: string; icon?: WorkshopGlyph }
    | { type: 'icon'; glyph: WorkshopGlyph; size?: number }
    | { type: 'rhythmStage' }
    | { type: 'divider' };
export interface WorkshopLayout {
    /** Change the key to reset scrolling when switching detail, filter or page. */
    key?: string;
    body?: WorkshopNode;
    grid?: { minItemWidth: number; maxColumns?: number; gap?: number; items: WorkshopNode[] };
    maxWidth?: number;
    accent?: string;
    /** Reference reusable PNG or JPEG data URLs by key. */
    images?: Record<string, string>;
}

export interface WorkshopPage {
    /** Optional playback-synchronized lane display. See original/README.md for the note encoding. */
    rhythmPreview?: {
        trackId: string;
        lanes: number;
        leadMs: number;
        notes: string;
    };
    layout?: WorkshopLayout;
    title: string;
    description?: string;
    fields?: WorkshopField[];
    advancedFieldsLabel?: string;
    headerActions?: WorkshopAction[];
    actions?: WorkshopAction[];
    rows?: { title: string; detail?: string; actions?: WorkshopAction[] }[];
}

export interface WorkshopMvTrack {
    id: string;
    title: string;
    artist: string;
    durationSeconds: number;
}

export interface WorkshopMvCandidate {
    id: string;
    title: string;
    artist?: string;
    durationSeconds?: number;
}

export interface WorkshopMvProvider {
    search(request: { track: WorkshopMvTrack; query: string; automatic: boolean; signal: AbortSignal }):
        Awaitable<WorkshopMvCandidate[]>;
    /** Override the default unique title-and-artist match. Return null for a miss. */
    match?(request: { track: WorkshopMvTrack; signal: AbortSignal }): Awaitable<WorkshopMvCandidate | null>;
    resolve(request: { track: WorkshopMvTrack; candidate: WorkshopMvCandidate; signal: AbortSignal }):
        Awaitable<{ url: string; startSeconds?: number; quality?: string;
            headers?: Partial<Record<'Authorization' | 'Referer' | 'User-Agent', string>> }>;
}

export interface WorkshopMvObservation {
    track: WorkshopMvTrack | null;
    state: 'playing' | 'paused';
    enabled: boolean;
    active: boolean;
    matching: { durationTolerance: 'tight' | 'standard' | 'extended'; allowUncredited: boolean };
}

export interface WorkshopMvSessionVideo {
    /** The URL returned by this provider's streams.publish. */
    url: string;
    trackId: string;
    title: string;
    sourceLabel: string;
    quality: string;
    startSeconds: number;
    durationSeconds?: number;
    page?: number;
    /** Optional unscoped timing-offset key from an earlier release. */
    previousTimingKey?: string;
    canLowerQuality?: boolean;
    adapted?: boolean;
    recovered?: boolean;
    accessDenied?: boolean;
}

export interface WorkshopMvSessionStatus {
    automatic: { trackId: string | null; phase: string; message: string;
        candidates: (WorkshopMvCandidate & { score?: number; reasons?: string[] })[] };
    video?: WorkshopMvSessionVideo | null;
    loggedIn?: boolean;
    username?: string;
    qrUrl?: string;
    loginMessage?: string;
    credentialsError?: string;
    searchRestricted?: boolean;
}

type MvCallback<Input, Result = unknown> = (input: Input, request: {signal: AbortSignal}) => Awaitable<Result>;

export interface WorkshopMvSessionProvider {
    observe: MvCallback<WorkshopMvObservation>;
    deactivate: MvCallback<WorkshopMvObservation>;
    status: MvCallback<{probeAccount?: boolean}, WorkshopMvSessionStatus>;
    search: MvCallback<{trackId: string; query: string}>;
    select: MvCallback<{trackId: string; candidateId: string}>;
    retry: MvCallback<null>;
    clear: MvCallback<null>;
    /** Provide all three account handlers to show the native sign-in controls. */
    login?: MvCallback<null>;
    closeLogin?: MvCallback<null>;
    logout?: MvCallback<null>;
    quality?: MvCallback<{quality: string}>;
    lowerQuality?: MvCallback<{url: string}>;
    playbackFailed?: MvCallback<{url: string}>;
    skip?: MvCallback<{trackId: string; candidateId: string}>;
    load?: MvCallback<{trackId: string; video: string; startSeconds: number}>;
    searchUrl?: MvCallback<{query: string}, string>;
}

export interface WorkshopMvStreams {
    publish(stream: {trackId: string; url: string;
        headers?: Partial<Record<'Authorization' | 'Referer' | 'User-Agent', string>>}): Promise<string>;
    clear(): void;
    accessDenied(): boolean;
}

export interface SourceKey { plugin: string; provider: string }
export interface SourceDescriptor extends SourceKey { title: string; browse: boolean }
export interface SourceCollection { id: string; title: string; kind: 'album' | 'playlist' | 'folder'; coverUrl?: string; itemCount?: number }
export interface SourceCatalogPage { tracks: TrackReference[]; collections: SourceCollection[]; hasMore: boolean }
export interface SourcePageOptions { page?: number; pageSize?: number }

export interface TrackReference {
    coverUrl?: string;
    providerTrackId: string;
    title: string;
    artist?: string;
    album?: string;
    duration?: number;
}

export interface StreamTrack {
    /** Follow the source sample rate when negotiating ASIO output. */
    followStreamRate?: boolean;
    /** Exact lookup through a lyrics provider registered by this plugin. */
    lyricsProvider?: string;
    /** Public artwork URL to try if the primary artwork is unavailable. */
    fallbackCover?: string;
    title: string;
    url: string;
    artist?: string;
    album?: string;
    duration?: number;
    cover?: string;
    lyrics?: string;
    bearer?: string;
}

export type SourceCollectionPlayback =
    | { state: 'idle' | 'preparing' | 'started' | 'cancelled' }
    | { state: 'error'; error: string };

export interface SearchSource {
    search(request: { query: string; page: number; pageSize: number; signal: AbortSignal }):
        Awaitable<{ tracks: TrackReference[]; hasMore?: boolean }>;
    browse?(request: { collectionId: string | null; page: number; pageSize: number; signal: AbortSignal }):
        Awaitable<{ tracks: TrackReference[]; collections?: SourceCollection[]; hasMore?: boolean }>;
    resolve(request: { providerTrackId: string; needArtwork?: boolean; signal: AbortSignal }): Awaitable<StreamTrack>;
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
    features: string[];
    protocol: number;
    commands: string[];
    events: string[];
    /** Maximum number of tracks per queue.submit call. */
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
export interface PlaylistMembershipPage {
    items: { playlistId: string; playlistTitle: string; itemId: string }[];
    page: number;
    hasMore: boolean;
}
export type PlaylistAppendPolicy = 'ask' | 'onlyNew' | 'keepAll';
export type PlaylistAppendResult =
    | { kind: 'appended'; added: number }
    | { kind: 'duplicates'; newCount: number; duplicateCount: number };
export interface PlaylistGroupPage {
    items: { id: string; title: string; assigned: boolean }[];
    page: number;
    hasMore: boolean;
}
export type PlaylistGroupEdit =
    | { action: 'create'; title: string; playlistId?: string }
    | { action: 'rename'; groupId: string; title: string }
    | { action: 'assign'; playlistId: string; groupId: string | null };
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
export interface AlbumVersions {
    primaryAlbumId: string | null;
    /** Linked editions. The Local catalog includes the queried edition in this list when grouped. */
    members: CatalogEntry[];
    /** Catalog matches for an edition that has no version group. */
    suggestions: CatalogEntry[];
    /** Measured loudness range in LU, keyed by album ID. Unmeasured albums are omitted. */
    loudnessRangeByAlbum: Record<string, number>;
}
export interface MusicCreditRelation {
    kind: 'Work' | 'Movement' | 'Composer' | 'Conductor' | 'Performer' | 'Contributor';
    id: string;
    title: string;
    trackCount: number;
    /** Parent work ID when the catalog links this movement to a work. */
    parent: string | null;
}
export interface AlbumCredits {
    /** Catalog relations for credited people, works and movements. */
    relations: MusicCreditRelation[];
    /** Additional role and name pairs from available legacy credit data. */
    namedCredits: { role: string; name: string }[];
}
export interface TrackArtistCredits {
    /** Artist credit as stored by the catalog. */
    artist: string;
    /** Resolved artist names using the catalog rules and any manual override. */
    names: string[];
    /** Suggested names for a manual split. */
    split: string[];
    overridden: boolean;
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
export interface PlaybackClock {
    trackSequence: number | null;
    /** Seek generation. Reset local interpolation on a generation or track change. */
    generation: number;
    status: PlaybackSnapshot['status'];
    positionSeconds: number;
    durationSeconds: number;
    playbackRate: number;
    /** Unix timestamp in milliseconds, taken when positionSeconds was sampled. */
    sampledAtMs: number;
}
export interface MusicMetadata {
    sequence: number;
    bpm: number | null;
    bpmEstimated: boolean;
    beatOffsetMs: number | null;
    genre: string | null;
}

export interface CanvasProfile {
    durationSeconds: number;
    sampleRate: number;
    peak: number[];
    rms: number[];
    leftMin: number[];
    leftMax: number[];
    rightMin: number[];
    rightMax: number[];
}
export interface CanvasSpectrogram {
    columns: number;
    bins: number;
    /** Columns of unsigned bytes with ascending frequencies within each column. */
    leftBase64: string;
    rightBase64: string;
}
export type CanvasStatus = { state: 'pending'; progress: number }
    | { state: 'failed'; error: string }
    | { state: 'ready'; data: { profile: CanvasProfile; spectrogram: CanvasSpectrogram | null } };

export interface AudioVisualizationOptions {
    intervalMs?: number;
    waveformSamples?: number;
    spectrum?: boolean;
    stereo?: boolean;
    fftSize?: number;
    bands?: number;
    measurements?: boolean;
    loudness?: boolean;
}
export interface AudioVisualizationFrame {
    status: 'ready' | 'pending' | 'stale' | 'unavailable';
    reason?: string | null;
    source: 'native_post_dsp';
    trackSequence: number;
    sampleRate?: number;
    channelOrder?: string[];
    stereo?: { balance: number | null; phaseCorrelation: number | null } | null;
    waveform?: { values: number[][]; samples: number; unit: 'linear-amplitude' } | null;
    spectrum?: { values: number[][]; frequenciesHz: number[]; frequencyRangesHz: number[][]; unit: string } | null;
    channels?: { samplePeakDbFS: number; rmsDbFS: number; peakHoldDbFS: number }[];
    loudness?: { [key: string]: number | string | boolean | null } | null;
}
export interface LibraryChange {
    source: CatalogSource;
    revision: number;
}
export interface CurrentTrack {
    /** Replayable identity when provided by the host and Core. */
    reference?: QueueReference | null;
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
export interface AudioSignalPath {
    status: PlaybackSnapshot['status'];
    trackSequence: number | null;
    input: 'local' | 'remoteLibrary' | 'online' | 'airPlay' | 'dlna' | 'listeningRoom' | null;
    route: AudioOutputStatus['route'];
    source: { codec: string | null; sampleRate: number | null; bitDepth: number | null; channels: number | null };
    output: {
        name: string;
        backend: string;
        mode: AudioOutputMode | null;
        sampleRate: number | null;
        hardwareSampleRate: number | null;
        sampleRateReadbackValid: boolean | null;
        channels: number | null;
        bufferFrames: number | null;
        format: string | null;
    } | null;
    processing: {
        dspActive: boolean;
        preampDb: number | null;
        replayGainDb: number | null;
        pcmResampleRate: number | null;
        nativeDsdRate: number | null;
    };
    bufferMs: number | null;
    underruns: number | null;
}
export type PlaybackCommand =
    | { action: 'toggle' | 'pause' | 'resume' | 'previous' | 'next' | 'stop' | 'toggleShuffle' | 'cycleRepeat' }
    | { action: 'seek' | 'seekBy'; seconds: number }
    | { action: 'setVolume'; volume: number }
    | { action: 'setMode'; mode: PlaybackMode }
    | { action: 'setShuffle'; enabled: boolean }
    | { action: 'setRepeat'; mode: RepeatMode };
export type QueueReference =
    | { kind: 'catalog'; source: CatalogSource; id: string }
    | { kind: 'source'; source: SourceKey; track: TrackReference };
export type QueueItem = QueueReference
    | ({ kind: 'stream'; id: string } & StreamTrack);
export type QueueEdit =
    | { action: 'clear' | 'undo' }
    | { action: 'remove' | 'moveAfterCurrent'; input: number[] }
    | { action: 'move'; input: { from: number; to: number } }
    | { action: 'reorder'; input: number[] }
    | { action: 'moveTo'; input: { indices: number[]; offset: number } }
    | { action: 'setRemoveAfterPlay'; input: { indices: number[]; enabled: boolean } };
export interface WorkshopArtwork {
    width: number;
    height: number;
    /** Assign to a named entry in layout.images. */
    dataUrl: string;
}
export interface QueueSearchHit {
    queueId: number;
    /** Zero-based, valid for this queueId. */
    index: number;
    title: string;
    artist: string;
}
export interface SavedQueueSummary { id: string; name: string; tracks: number }
export interface QueuePage {
    queueId: number;
    /** One-based current position, or zero for no current item. */
    position: number;
    offset: number;
    total: number;
    hasNext: boolean;
    items: { title: string; artist: string; occurrenceId?: string | null; reference?: QueueReference | null; catalog: { source: CatalogSource; id: string } | null }[];
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

export interface LocalCatalogSummary {
    trackCount: number;
    albumCount: number;
    artistCount: number;
    totalDurationSeconds: number;
}

export interface LocalCatalogAlbum {
    id: string;
    title: string;
    albumArtist: string;
    trackCount: number;
    durationSeconds: number;
    year: number | null;
    addedAt: string | null;
    rating: number | null;
}

export interface LocalCatalogArtist {
    id: string;
    name: string;
    role: 'trackArtist' | 'albumArtist';
    trackCount: number;
    albumCount: number;
}

export interface TrackSearchPage {
    items: CatalogEntry[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
}

export type PlaybackSpeedMode = 'Speed' | 'Nightcore' | 'Daycore';

export interface PlaybackSpeed {
    rate: number;
    mode: PlaybackSpeedMode;
}

export interface SegmentLoopStatus {
    trackInstance: string | null;
    available: boolean;
    start: number | null;
    end: number | null;
    enabled: boolean;
}

export type SegmentLoopEdit = { action: 'mark'; point: 'Start' | 'End' }
    | { action: 'move'; point: 'Start' | 'End'; seconds: number }
    | { action: 'toggle' | 'jumpToStart' | 'clear' };

export interface DspGraph {
    /** Supply this revision when applying edits to reject stale graph changes. */
    revision: string;
    filters: { [key: string]: Json }[];
    sequence: string[];
    procedural: { [key: string]: Json };
}

export interface StorageBudget {
    maxEntries: number;
    maxBytes: number;
}

export interface WorkshopRecord {
    value: Json;
    summary: Json;
    revision: number;
}

export interface RecordStorage {
    get(bucket: string, key: string): Promise<WorkshopRecord | null>;
    list(bucket: string, options: { limit: number; before?: number }): Promise<{
        items: { key: string; summary: Json; revision: number }[];
        nextCursor: number | null;
    }>;
    /** Pass null to create only, or an existing revision to conditionally replace it. */
    set(bucket: string, key: string, value: Json, summary: Json, budget: StorageBudget, expectedRevision?: number | null): Promise<{ revision: number }>;
    remove(bucket: string, key: string, expectedRevision?: number | null): Promise<null>;
}

export interface CacheStorage {
    get(bucket: string, key: string): Promise<Json>;
    /** expiresAt is an absolute Unix timestamp in milliseconds. */
    set(bucket: string, key: string, value: Json, budget: StorageBudget & { expiresAt: number; ifAbsent?: boolean }): Promise<boolean>;
    remove(bucket: string, key: string): Promise<null>;
}

export interface WorkshopLyricsCandidate {
    title: string;
    artist: string;
    album?: string;
    durationSeconds?: number;
    syncedLyrics?: string;
    plainLyrics?: string;
    karaokeLyrics?: string;
    translationLyrics?: string;
    romanizationLyrics?: string;
    instrumental?: boolean;
}

export type LyricsDocumentFormat = 'lrc' | 'ttml' | 'txt';

export interface WorkshopTrackLyrics {
    kind: 'empty' | 'plain' | 'synced' | 'instrumental';
    title: string;
    artist: string;
    album: string | null;
    durationSeconds: number | null;
    offsetMs: number;
    provider: 'none' | 'local' | 'manual' | 'remote';
    plainText: string | null;
    syncedText: string | null;
    lines: (Omit<LyricLine, 'timeMs' | 'endMs'> & {
        timeMs: number;
        endMs?: number;
        agentId?: string;
        kana: string | null;
        backgroundVocals?: {
            text: string; timeMs: number; endMs: number | null; agentId?: string;
            translation: string | null; words: LyricLine['words'];
        }[];
    })[];
}

export interface CurrentLyricsState {
    sequence: number | null;
    revision: number;
    /** Whether the current playback session has a lyrics source. The document can still be empty. */
    available: boolean;
}
export interface CurrentLyricsDocument {
    state: CurrentLyricsState;
    document: WorkshopTrackLyrics | null;
}

export interface LyricsViewLayout {
    target: 'main' | 'desktop' | 'companion' | 'settings';
    externalPlayback: {
        title: string; artist: string; album: string; playing: boolean; durationMs: number; line: LyricLine | null;
    } | null;
    /** Usable content area in logical pixels, after reserved chrome. */
    width: number;
    height: number;
    insetTop: number;
    insetBottom: number;
    fullscreen: boolean;
    focused: boolean;
    /** Coalescing interval for plugin-initiated page invalidation. */
    minRefreshIntervalMs: number;
    visible: boolean;
    reducedMotion: boolean;
    frameIntervalMs: number | null;
    preferences: {
        fontSize: number | null; secondaryFontSize: number | null; lineSpacingPercent: number | null;
        translation: boolean; romanization: boolean; globalOffsetMs: number; correctionEnabled: boolean;
        wordHighlight: boolean; fontFamily: string | null;
    } | null;
    appearance: { accent: number; text: number; muted: number; panel: number; appBg: number } | null;
    /** Set only for pages declaring ui:system-fonts. Contains family names, not paths. */
    systemFonts: string[] | null;
    bundledFonts: string[];
}

export type LyricsViewPermission = 'clipboard:write' | 'window:fullscreen' | 'audio:dsp-ui' | 'lyrics:import' | 'ui:system-fonts';

export interface CoverPalette {
    average: [number, number, number];
    /** Up to four #RRGGBB swatches extracted from the artwork. */
    colors: string[];
}

export type EnrichmentTag = 'Title' | 'Artist' | 'Album' | 'AlbumArtist' | 'Genre' | 'Year' | 'Track' | 'Disc';

export interface EnrichmentTrack {
    id: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    missingCover: boolean;
    missingLyrics: boolean;
    missingTags: EnrichmentTag[];
    fileTagsWritable: boolean;
    accessible: boolean;
}

export interface EnrichmentPage {
    tracks: EnrichmentTrack[];
    next: string | null;
}

export interface EnrichmentTagChange {
    tags?: [EnrichmentTag, string[]][];
    coverUrl?: string;
}

export interface EnrichmentTagOutcome {
    fields: EnrichmentTag[];
    cover: boolean;
    queued: boolean;
    originalSyncError: string | null;
}

export type WorkshopProviderLyrics = Omit<WorkshopLyricsCandidate, 'title' | 'artist' | 'album' | 'durationSeconds'>;

export interface WorkshopNetworkOptions {
    /** Accept, Accept-Language, Content-Type, Referer, Origin and User-Agent. */
    headers?: Record<string, string>;
    /** A UTF-8 body selects POST. Omit to send GET. */
    body?: string;
}

export interface WorkshopNetworkResponse {
    status: number;
    url: string;
    body: string;
}

export interface VersionTrack {
    id: string;
    title: string;
    artist: string;
    album: string | null;
    durationSeconds: number;
    playable: boolean;
    codec: string | null;
    sampleRate: number | null;
    bitDepth: number | null;
    bitrate: number | null;
}

export interface TrackVersions {
    members: { track: VersionTrack; sourceName: string | null }[];
    preferred: string | null;
    suggestions: VersionTrack[];
    manual: boolean;
    preferencePinned: boolean;
    sharedRecording: boolean;
    family: { preferredGroup: string | null; versions: { groupId: string; label: string; track: VersionTrack }[] } | null;
    /** Opaque version used to reject edits to a changed group. */
    revision: string;
}

export type TrackVersionEdit =
    | { action: 'add' | 'remove' | 'prefer'; trackId: string }
    | { action: 'useBestQuality' };

export interface PlaybackBookmark {
    id: string;
    label: string;
    /** Seconds within the track. */
    position: number;
}

export interface SavedSegment {
    id: string;
    track: string;
    name: string;
    title: string;
    artist: string;
    start: number;
    end: number;
    available: boolean;
}

export type SavedSegmentEdit =
    | { action: 'save'; trackId: string; name: string; start: number; end: number }
    | { action: 'rename'; id: string; name: string }
    | { action: 'relink'; id: string; trackId: string }
    | { action: 'remove'; id: string };

export interface TrackMenuTarget {
    id: string;
    source: CatalogSource;
    title: string;
    artist: string;
    album: string | null;
    durationSeconds: number;
}

export type PlayerBarIcon = 'listMusic' | 'bookmark' | 'heart' | 'radio' | 'clock' | 'star';

export type PlayerBarItem =
    | { type: 'track' | 'previous' | 'playPause' | 'next' | 'seek' | 'like'
        | 'lyrics' | 'queue' | 'volume' | 'connect' | 'spacer' }
    | { type: 'action'; id: string };

export interface SurfaceActionResult {
    /** Page registered by this plugin. */
    page?: string;
    /** Message of up to 512 UTF-8 bytes. */
    notice?: string;
}

export interface WorkshopContext {
    readonly pluginId: string;
    readonly contentRoot: string;
    readonly dataRoot: string;
    hostInvoke(method: 'host.describe'): Promise<HostDescription>;
    hostInvoke(method: string, input?: Json): Promise<Json>;
    onEvent(listener: (event: string, value: Json) => Awaitable<void>): () => void;
    readonly storage: {
        readonly records: RecordStorage;
        readonly cache: CacheStorage;
        get(key: string): Promise<Json>;
        set(key: string, value: Json): Promise<void>;
        remove(key: string): Promise<void>;
    };
    readonly credentials: {
        get(key: string): Promise<string | null>;
        set(key: string, value: string): Promise<null>;
        remove(key: string): Promise<null>;
    };
    readonly network: {
        /** Public HTTPS, same-host redirects, ECHO proxy and offline policy. */
        request(url: string, options?: WorkshopNetworkOptions): Promise<WorkshopNetworkResponse>;
    };
    readonly lyrics: {
        registerProvider(id: string, descriptor: Descriptor, lookup: (request: {
            track: { trackId: string | null; title: string; artist: string; album: string | null; durationSeconds: number | null };
            signal: AbortSignal;
            automatic: boolean;
            /** Source requested a lookup by its stable track ID. */
            exact: boolean;
        }) => Awaitable<WorkshopLyricsCandidate[]>): void;
        get(trackId?: string): Promise<WorkshopTrackLyrics | null>;
        /** Read the current document, optionally rejecting a stale sequence or revision. */
        getCurrent(expected?: { sequence?: number; revision?: number }): Promise<CurrentLyricsDocument>;
        matchAmll(sequence: number): Promise<{ matched: boolean }>;
        onChanged(listener: (state: CurrentLyricsState) => Awaitable<void>): () => void;
        /** Saves a provider result only while the track has no lyrics or explicit edit. */
        fillMissing(trackId: string, lyrics: WorkshopProviderLyrics): Promise<null>;
        applyCustom(trackId: string, text: string, format?: LyricsDocumentFormat): Promise<WorkshopTrackLyrics>;
        setOffset(trackId: string, offsetMs: number): Promise<WorkshopTrackLyrics>;
        setCurrentOffset(offsetMs: number): Promise<WorkshopTrackLyrics>;
        markInstrumental(trackId: string): Promise<WorkshopTrackLyrics>;
        clearOverride(trackId: string): Promise<null>;
    };
    readonly sleepTimer: {
        getStatus(): Promise<SleepTimerStatus>;
        /** Duration is a whole number of minutes from 1 to 720. */
        start(input: SleepTimerStart): Promise<SleepTimerStatus>;
        cancel(): Promise<SleepTimerStatus>;
        onTick(listener: (event: { remainingMs: number }) => Awaitable<void>): () => void;
    };
    readonly library: {
        readonly enrichment: {
            /** Checks up to 24 local tracks from an exclusive cursor. */
            scan(after?: string | null): Promise<EnrichmentPage>;
            /** Fills empty file tags, or embeds a cover if the track lacks one. */
            fillTags(trackId: string, change: EnrichmentTagChange): Promise<EnrichmentTagOutcome>;
        };
        onChanged(listener: (event: LibraryChange) => Awaitable<void>): () => void;
        onFavoritesChanged(listener: (event: LibraryChange) => Awaitable<void>): () => void;
        query(options?: CatalogQuery): Promise<CatalogPage>;
        track(id: string, source?: CatalogSource): Promise<CatalogEntry>;
        summary(): Promise<LocalCatalogSummary>;
        album(id: string): Promise<LocalCatalogAlbum | null>;
        albumForTrack(trackId: string): Promise<LocalCatalogAlbum | null>;
        /** Up to 12 other catalog albums by the album artist. */
        relatedAlbums(id: string, source?: CatalogSource): Promise<CatalogEntry[]>;
        albumVersions(id: string, source?: CatalogSource): Promise<AlbumVersions>;
        /** Up to 24 similar tracks, ranked using the Local catalog. */
        similarLocalTracks(id: string): Promise<CatalogEntry[]>;
        artist(id: string): Promise<LocalCatalogArtist | null>;
        /** Resolves a name using the catalog's artist identity rules. */
        artistByName(name: string, source?: CatalogSource): Promise<CatalogEntry | null>;
        /** Looks up roles by the credited name. */
        artistCredits(name: string, source?: CatalogSource): Promise<MusicCreditRelation[]>;
        albumCredits(id: string, source?: CatalogSource): Promise<AlbumCredits>;
        /** Reads the artist names of a local track. */
        trackArtistCredits(id: string): Promise<TrackArtistCredits>;
        albumFavoriteStates(ids: string[]): Promise<Record<string, boolean>>;
        /** Searches all candidates. A smart playlist's saved result limit does not cap search pages. */
        searchTracks(rules: SmartRules, page?: { page?: number; pageSize?: number }): Promise<TrackSearchPage>;
        /** Returns found local tracks in input order, with duplicates removed. */
        tracksByIds(ids: string[]): Promise<CatalogEntry[]>;
        /** Recorded local catalog skips and the latest skip's UTC timestamp. */
        trackSkipStats(id: string): Promise<{ skipCount: number; lastSkippedAt: string | null }>;
        trackVersions(id: string, source?: CatalogSource): Promise<TrackVersions>;
        /** Edit the current version group of a local track. */
        editTrackVersions(id: string, revision: string, edit: TrackVersionEdit): Promise<null>;
        /** Tracks in the order used for linked playback. */
        linkedTracks(id: string, source?: CatalogSource): Promise<VersionTrack[]>;
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
        /** Returns up to four stored occurrences per page, starting at page 1. */
        findTrackInPlaylists(trackId: string, options?: { page?: number; groupId?: string }): Promise<PlaylistMembershipPage>;
        /** The default duplicate policy reports conflicts before writing. */
        appendPlaylistTracks(id: string, trackIds: string[], duplicates?: PlaylistAppendPolicy): Promise<PlaylistAppendResult>;
        /** Transfers matched occurrence IDs between local manual playlists. A move returns an ID for recovery. */
        transferPlaylistItems(id: string, targetId: string, itemIds: string[], mode?: 'copy' | 'move'): Promise<{ recoveryId: string | null }>;
        playlistGroups(options?: { page?: number; playlistId?: string }): Promise<PlaylistGroupPage>;
        /** A null group ID lists ungrouped playlists. */
        playlistsInGroup(groupId: string | null, options?: { page?: number; search?: string }): Promise<CatalogPage>;
        editPlaylistGroup(change: PlaylistGroupEdit): Promise<null>;
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
        toggleTrackLiked(id: string): Promise<{ trackId: string; liked: boolean }>;
        toggleAlbumLiked(id: string): Promise<{ albumId: string; liked: boolean }>;
        /** Move a favorite track to a zero-based position in the stored order. */
        moveLikedTrack(id: string, position: number): Promise<null>;
        /** Update a batch of up to 256 track IDs together. */
        setTracksLiked(ids: string[], liked: boolean): Promise<null>;
        /** Return a Boolean for each of up to 200 track IDs. */
        trackFavoriteStates(ids: string[]): Promise<Record<string, boolean>>;
        setArtistFavorite(id: string, favorite: boolean): Promise<null>;
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
    readonly artwork: {
        previewUrl(url: string): Promise<WorkshopArtwork | null>;
        track(id: string, source?: CatalogSource): Promise<WorkshopArtwork | null>;
        album(id: string, source?: CatalogSource): Promise<WorkshopArtwork | null>;
        /** Returns a saved artist portrait, or null if the artist has none. */
        artist(id: string, source?: CatalogSource): Promise<WorkshopArtwork | null>;
        onArtistChanged(listener: (change: { revision: string }) => Awaitable<void>): () => void;
        /** Register during activate. The host requests portraits for artists missing one. */
        registerArtistProvider(id: string, options: { title: string }, lookup: (input: {
            artist: { id: string; name: string; source: CatalogSource };
            signal: AbortSignal;
        }) => Awaitable<({ artistName: string } & (
            { imageUrl: string; dataUrl?: never } | { dataUrl: string; imageUrl?: never }
        )) | null>): void;
        /** Pass CurrentTrack.sequence to reject a result after a track change. */
        current(sequence?: number): Promise<WorkshopArtwork | null>;
        /** Returns the current cover's average RGB without transferring the artwork image. */
        getPalette(sequence?: number): Promise<CoverPalette | null>;
        onPaletteChanged(listener: (event: { sequence: number | null; palette: CoverPalette | null }) => Awaitable<void>): () => void;
    };
    readonly history: {
        list(options?: HistoryQuery): Promise<HistoryPage>;
        review(options?: HistoryReviewQuery): Promise<HistoryReview>;
    };
    readonly playback: {
        readonly bookmarks: {
            list(id: string, source?: CatalogSource): Promise<PlaybackBookmark[]>;
            add(sequence: number): Promise<PlaybackBookmark[]>;
            jump(sequence: number, bookmarkId: string): Promise<PlaybackBookmark[]>;
            rename(track: { id: string; source?: CatalogSource }, bookmarkId: string, label: string): Promise<PlaybackBookmark[]>;
            remove(track: { id: string; source?: CatalogSource }, bookmarkId: string): Promise<PlaybackBookmark[]>;
        };
        readonly savedSegments: {
            list(options?: { page?: number; search?: string }): Promise<{ items: SavedSegment[]; page: number; total: number }>;
            edit(edit: SavedSegmentEdit): Promise<null>;
            play(id: string): Promise<null>;
        };
        onChanged(listener: (state: PlaybackSnapshot) => Awaitable<void>): () => void;
        onTrackChanged(listener: (track: CurrentTrack | null) => Awaitable<void>): () => void;
        /** Initial clock sample and changed samples at up to 20 Hz. Keep the callback lightweight. */
        onClock(listener: (clock: PlaybackClock) => Awaitable<void>): () => void;
        get(): Promise<PlaybackSnapshot>;
        getClock(): Promise<PlaybackClock>;
        getMusicMetadata(sequence: number): Promise<MusicMetadata | null>;
        getCurrentTrack(): Promise<CurrentTrack | null>;
        getRate(): Promise<number>;
        getSpeed(): Promise<PlaybackSpeed>;
        setSpeed(rate: number, mode: PlaybackSpeedMode): Promise<PlaybackSpeed>;
        getSegmentLoop(): Promise<SegmentLoopStatus>;
        editSegmentLoop(trackInstance: string, edit: SegmentLoopEdit): Promise<SegmentLoopStatus>;
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
        readonly canvas: {
            /** Start current-track analysis for up to 4096 buckets. Release the handle when done. */
            start(options: { sequence: number; buckets?: number; spectrogram?: boolean }): Promise<{ id: string }>;
            /** Current source provider only. Register a complete file relative to the plugin's data directory. */
            registerCachedAsset(sequence: number, relativePath: string): Promise<null>;
            status(id: string): Promise<CanvasStatus>;
            release(id: string): Promise<null>;
        };
        readonly visualization: {
            /** Open a native subscription. Poll no faster than the returned intervalMs. */
            open(options?: AudioVisualizationOptions): Promise<{ id: string; intervalMs: number; sequence: number }>;
            read(id: string): Promise<AudioVisualizationFrame>;
            close(id: string): Promise<null>;
        };
        getSignalPath(): Promise<AudioSignalPath>;
        /** Receives the latest snapshot when subscribed, then only on changes. */
        onSignalPathChanged(listener: (path: AudioSignalPath) => Awaitable<void>): () => void;
        /** Latest local playback analysis, or null while no current frame is available. */
        onAnalysis(listener: (frame: AudioAnalysisFrame | null) => Awaitable<void>): () => void;
        getAnalysis(): Promise<AudioAnalysisFrame | null>;
        /** Requires ECHO Pro DSP. Use getGraph to obtain the current revision. */
        readonly dsp: {
            getGraph(): Promise<DspGraph>;
            applyGraph(graph: DspGraph): Promise<DspGraph>;
            getRackOrder(): Promise<string[]>;
            setRackOrder(order: string[]): Promise<string[]>;
        };
        readonly output: {
            getStatus(): Promise<AudioOutputStatus>;
            listDevices(): Promise<AudioOutputDevice[]>;
            /** Apply a local route change and return the accepted configuration. */
            setOutput(change: AudioOutputChange): Promise<ConfiguredAudioOutput>;
        };
    };
    readonly queue: {
        onChanged(listener: (event: QueueChange) => Awaitable<void>): () => void;
        /** limit is 1–256 and defaults to 256. Supply queueId when continuing a previous page. */
        get(options?: { offset?: number; queueId?: number; limit?: number }): Promise<QueuePage>;
        search(query: string, options?: { source?: CatalogSource; remoteId?: string }): Promise<QueueSearchHit[]>;
        playAt(queueId: number, index: number): Promise<null>;
        readonly saved: {
            onChanged(listener: (event: { snapshots: SavedQueueSummary[]; undoRemoveId: string | null }) => Awaitable<void>): () => void;
            list(): Promise<SavedQueueSummary[]>;
            save(queueId: number): Promise<null>;
            restore(queueId: number, snapshotId: string): Promise<null>;
            remove(snapshotId: string): Promise<null>;
            undoRemove(snapshotId: string): Promise<null>;
        };
        playItem(queueId: number, occurrenceId: string): Promise<null>;
        edit(queueId: number, edit: QueueEdit): Promise<null>;
        submit(request: { mode: 'play' | 'append' | 'playNext'; tracks: QueueItem[]; index?: number }): Promise<null>;
    };
    readonly pages: {
        /** Returns the method to use on a button, row action or range commit. */
        registerAction(id: string, run: (request: {
            fields: Readonly<Record<string, string>>; data: Json; signal: AbortSignal; windowId: string | null;
            lyricsView: LyricsViewLayout | null;
        }) => Awaitable<WorkshopPage | void | null>): string;
        invalidate(pageId?: string): void;
        register(id: string, descriptor: Descriptor & (
            { presentation: 'lyrics-view' | 'desktop-lyrics' | 'companion-lyrics'; window?: never; transparent?: boolean; permissions?: LyricsViewPermission[]; settingsPage?: string } |
            { presentation: 'lyrics-settings'; window?: never; permissions?: LyricsViewPermission[] } |
            { presentation?: never; window?: { width?: number; height?: number } }
        ), open: (request: { signal: AbortSignal; windowId: string | null; lyricsView: LyricsViewLayout | null }) => Awaitable<WorkshopPage>): void;
    };
    readonly mv: {
        registerSessionProvider(id: string, descriptor: Descriptor & {
            matchPreferences?: boolean; qualities?: {value: string; label: string}[];
        }, handlers: WorkshopMvSessionProvider): WorkshopMvStreams;
        registerProvider(id: string, descriptor: Descriptor, handlers: WorkshopMvProvider): void;
    };
    readonly sources: {
        /** Admit playback of this plugin’s own paginated collection. Resolution continues after the action returns. */
        playCollection(providerId: string, collectionId: string, options?: { startTrackId?: string }): Promise<SourceCollectionPlayback>;
        cancelCollection(): Promise<SourceCollectionPlayback>;
        collectionStatus(): Promise<SourceCollectionPlayback>;
        list(): Promise<SourceDescriptor[]>;
        search(source: SourceKey, query: string, options?: SourcePageOptions): Promise<SourceCatalogPage>;
        browse(source: SourceKey, collectionId?: string | null, options?: SourcePageOptions): Promise<SourceCatalogPage>;
        registerProvider(id: string, descriptor: Descriptor & { placement?: 'playlists' }, handlers: SearchSource): void;
    };
    readonly commands: {
        /** Commands registered in the connected Core, or this host in single-process mode. */
        readonly core: {
            list(): Promise<CommandDescriptor[]>;
            invoke(pluginId: string, commandId: string, input?: Json): Promise<Json>;
        };
        register(id: string, descriptor: Descriptor, run: (input: Json, context: {
            callerPluginId: string;
            signal: AbortSignal;
        }) => Awaitable<Json>): void;
        list(): Promise<CommandDescriptor[]>;
        invoke(pluginId: string, commandId: string, input?: Json): Promise<Json>;
    };
    readonly actions: {
        registerPlayerBar(id: string, descriptor: Descriptor & {
            icon?: PlayerBarIcon;
            /** Show this action only when a layout explicitly places it. */
            layoutOnly?: boolean;
        },
            run: (input: { track: CurrentTrack | null; signal: AbortSignal }) => Awaitable<SurfaceActionResult | void>): void;
        registerTrackMenu(id: string, descriptor: Descriptor & { localOnly?: boolean },
            run: (input: { track: TrackMenuTarget; signal: AbortSignal }) => Awaitable<SurfaceActionResult | void>): void;
    };
    readonly playerBar: {
        /** Register during activate. The user chooses a layout in Appearance settings. */
        registerLayout(id: string, descriptor: Descriptor & { items: readonly PlayerBarItem[] }): void;
    };
    readonly metadata: TagRegistry;
    readonly covers: TagRegistry;
}
