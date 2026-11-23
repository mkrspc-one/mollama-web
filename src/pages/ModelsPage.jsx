import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Page, Container, Card, Typography, Button, ButtonGroup, Badge, Icon, Input, Select, ProgressBar, Pagination } from '@components/Components';
import { useNotification } from '@contexts/NotificationContext';
import { deviceService, modelService, providerService, describeError, useGuide, onReturn } from '../client/ai.client';

const TABS = [
    { id: 'discover', label: 'Discover' },
    { id: 'installed', label: 'Installed' },
    { id: 'running', label: 'Running' },
    { id: 'mine', label: 'My models' },
    { id: 'online', label: 'Online' }
];
const PROVIDER_ICONS = { ollama: 'SiOllama', anthropic: 'SiAnthropic', openai: 'FiZap', google: 'SiGooglegemini', moonshot: 'FiMoon', deepseek: 'SiDeepseek', xai: 'SiX', mistral: 'SiMistralai', openrouter: 'SiOpenrouter', groq: 'FiCpu', cerebras: 'FiCpu' };
const PROVIDER_COLORS = { healthy: 'success', unchecked: 'default', busy: 'warning', empty: 'warning' };

const PURPOSES = [
    { id: 'all', label: 'All' },
    { id: 'chat', label: 'Chat' },
    { id: 'writing', label: 'Writing' },
    { id: 'code', label: 'Code' },
    { id: 'reasoning', label: 'Reasoning' }
];

const FIT_COLORS = { gpu: 'success', mixed: 'warning', cpu: 'warning', too_large: 'error', cloud: 'tertiary' };
const RESUMABLE = ['DOWNLOAD_INTERRUPTED', 'OLLAMA_DOWN', 'DISK_FULL'];
const ABILITY_LABELS = { tools: 'Can use tools', vision: 'Can read images', thinking: 'Thinks step by step' };
// One line each, shown when a badge is pointed at.
const ABILITY_NOTES = {
    'Can use tools': 'It can call tools while it answers: search the web, read your files, use a calculator or an app you connected on the Tools page.',
    'Can read images': 'It can look at pictures you attach and answer about them.',
    'Thinks step by step': 'It works a problem through before it answers, which takes longer and is often more accurate.'
};

const CREATIVITY = [
    { label: 'Precise', value: 0.2 },
    { label: 'Balanced', value: 0.7 },
    { label: 'Inventive', value: 1.2 }
];
const creativityOf = (value) => (Number(value) <= 0.3 ? 'Precise' : Number(value) <= 0.9 ? 'Balanced' : 'Inventive');

const TEMPLATES = [
    {
        id: 'coding',
        label: 'Coding helper',
        displayName: 'Coding helper',
        system: 'You are a careful programming assistant. Explain what the code does before changing it, keep changes small, and say how to test them.',
        creativity: 0.2
    },
    {
        id: 'reviewer',
        label: 'Careful reviewer',
        displayName: 'Careful reviewer',
        system: 'You review work for mistakes. List each problem you find, say why it matters, and suggest a fix. If you find nothing wrong, say so plainly.',
        creativity: 0.1
    },
    {
        id: 'writer',
        label: 'Friendly writer',
        displayName: 'Friendly writer',
        system: 'You write in a warm, clear, plain style. Use short sentences and everyday words. Keep the meaning of what you are given.',
        creativity: 0.8
    },
    { id: 'blank', label: 'Blank', displayName: '', system: '', creativity: 0.7 }
];

const gb = (megabytes) => {
    if (megabytes === null || megabytes === undefined) return 'Unknown';
    const value = megabytes / 1024;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} GB`;
};
const gbFromBytes = (bytes) => gb(bytes / (1024 * 1024));
// Where a model's memory goes once it runs, and what that leaves of each memory before other apps take their part.
const placeWords = (place) => [
    [place.gpuMb > 0 ? `${gb(place.gpuMb)} graphics` : null, place.ramMb > 0 ? `${gb(place.ramMb)} system` : null].filter(Boolean).join(' + '),
    `leaves ${[place.gpuLeftMb !== null ? `${gb(place.gpuLeftMb)} graphics` : null, place.ramLeftMb !== null ? `${gb(place.ramLeftMb)} system` : null].filter(Boolean).join(', ')}`
].join(', ');
const PLACE_NOTE = 'An estimate of the memory the model takes while it runs, and what is left of each memory in total. Other open apps use some of what is left.';
const Placement = ({ model }) => (
    <>
        {model.fit?.place && <Typography size="xs" color="muted" margin="none" title={PLACE_NOTE}>This computer: {placeWords(model.fit.place)}</Typography>}
        {model.pooled?.place && <Typography size="xs" color="muted" margin="none" title={`${PLACE_NOTE} Graphics memory is every pooled computer's together; system memory is the primary computer's.`}>Pooled ({model.pooled.names}): {placeWords(model.pooled.place)}</Typography>}
    </>
);

const speedWords = (range) => {
    if (!range) return null;
    const label = range[0] >= 30 ? 'Fast' : range[0] >= 10 ? 'Comfortable' : range[0] >= 3 ? 'Slow' : 'Very slow';
    return `${label} (about ${range[0]} to ${range[1]} tokens a second)`;
};

const timeLeft = (seconds) => {
    if (seconds === null || seconds === undefined) return '';
    if (seconds < 60) return 'less than a minute left';
    if (seconds < 3600) return `about ${Math.ceil(seconds / 60)} min left`;
    return `about ${(seconds / 3600).toFixed(1)} hours left`;
};

const slug = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const Row = ({ children }) => (
    <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%" wrap={false}>{children}</Container>
);

const Stat = ({ icon, label, value, note }) => (
    <Card layout="flex" align="center" gap="sm" padding="sm" hover={false} shadow={false} wrap={false} width="100%">
        <Icon name={icon} size="sm" color="primary" />
        <Container layout="flex-column" gap="none" padding="none" minWidth="0">
            <Typography size="xxs" color="muted">{label}</Typography>
            <Typography size="sm" weight="semibold" truncate>{value}</Typography>
            {note && <Typography size="xxs" color="muted" truncate>{note}</Typography>}
        </Container>
    </Card>
);

const SectionTitle = ({ icon, title, count, children }) => (
    <Row>
        <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
            <Icon name={icon} size="xs" color="primary" />
            <Typography as="h2" size="sm" weight="semibold">{title}</Typography>
            {count !== undefined && <Badge size="xs" color="secondary">{count}</Badge>}
        </Container>
        {children}
    </Row>
);

const Empty = ({ icon, title, text }) => (
    <Card layout="flex" align="center" gap="sm" padding="md" width="100%" hover={false} shadow={false} wrap={false}>
        <Icon name={icon} size="sm" color="secondary" />
        <Container layout="flex-column" gap="none" padding="none">
            <Typography size="sm" weight="semibold">{title}</Typography>
            <Typography size="xs" color="muted">{text}</Typography>
        </Container>
    </Card>
);

const abilities = (model) => model.capabilities.map((ability) => ABILITY_LABELS[ability]).filter(Boolean);
const cannotChat = (model) => (model.canChat ?? !model.capabilities.includes('embedding')) === false;
const NoChatBadge = () => <Badge size="xs" color="warning" title="An embedding model. It turns text into numbers for searching and cannot hold a conversation, so the chat page does not offer it.">For search, cannot chat</Badge>;

const DownloadsPanel = ({ jobs, canManage, onResume, onPause, onCancel }) => {
    const order = { downloading: 0, queued: 1, paused: 2, failed: 3 };
    const open = jobs
        .filter((job) => job.status in order)
        .sort((a, b) => order[a.status] - order[b.status] || new Date(a.createdAt) - new Date(b.createdAt));
    if (open.length === 0) return null;

    return (
        <Card layout="flex-column" gap="sm" padding="md" width="100%" hover={false}>
            <SectionTitle icon="FiDownload" title="Downloads" count={open.length}>
                <Typography size="xxs" color="muted">They carry on if you close this page.</Typography>
            </SectionTitle>
            <Container layout="grid" columns="auto-lg" gap="sm" padding="none" width="100%">
                {open.map((job) => (
                    <Container key={job.id} layout="flex-column" gap="xs" padding="none" width="100%" minWidth="0">
                        <Row>
                            <Typography size="xs" weight="semibold" truncate>{job.model}</Typography>
                            <Typography size="xxs" color="muted">
                                {job.status === 'queued' && 'Waiting for its turn'}
                                {job.status === 'paused' && `Paused at ${job.percent}%`}
                                {job.status === 'failed' && 'Stopped'}
                                {job.status === 'downloading' && job.stalled && `Waiting at ${job.percent}%`}
                                {job.status === 'downloading' && !job.stalled && [
                                    `${job.percent}%`,
                                    job.totalBytes ? `${gbFromBytes(job.completedBytes)} of ${gbFromBytes(job.totalBytes)}` : null,
                                    job.speedBps ? `${(job.speedBps / 1048576).toFixed(1)} MB a second` : null,
                                    timeLeft(job.etaSeconds)
                                ].filter(Boolean).join(' · ')}
                            </Typography>
                        </Row>
                        <ProgressBar
                            value={job.percent}
                            size="sm"
                            color={job.status === 'failed' ? 'error' : job.status === 'paused' || job.stalled ? 'warning' : 'primary'}
                            animated={job.status === 'downloading' && !job.stalled}
                            width="100%"
                        />
                        {job.stalled && (
                            <Typography size="xxs" color="warning">
                                No data is arriving. Check the internet connection. The download carries on by itself when
                                the connection is back, or you can pause it.
                            </Typography>
                        )}
                        {job.error && <Typography size="xxs" color="error">{job.error.message} {job.error.action}</Typography>}
                        {canManage && (
                            <Container layout="flex" gap="xs" padding="none">
                                {job.status === 'downloading' && (
                                    <Button size="xs" color="secondary" onClick={() => onPause(job)}>Pause</Button>
                                )}
                                {(job.status === 'paused' || (job.status === 'failed' && RESUMABLE.includes(job.error?.code))) && (
                                    <Button size="xs" onClick={() => onResume(job)}>Resume</Button>
                                )}
                                <Button size="xs" color="secondary" onClick={() => onCancel(job)}>
                                    {job.status === 'failed' ? 'Remove from list' : 'Cancel'}
                                </Button>
                            </Container>
                        )}
                    </Container>
                ))}
            </Container>
        </Card>
    );
};

// Models that run on another company's computers with the person's own key. Ollama comes first, because it runs the
// models from the same library that are too large to download; the other services follow.
export const OnlineTab = () => {
    const { success, error: notifyError, confirm } = useNotification();
    const [providers, setProviders] = useState(null);
    const [suggested, setSuggested] = useState([]);
    const [chosen, setChosen] = useState(null);
    const [key, setKey] = useState('');
    const [busy, setBusy] = useState(null);

    useEffect(() => {
        providerService.list()
            .then((listed) => { setProviders(listed.providers); setSuggested(listed.suggested); })
            .catch((error) => { setProviders([]); notifyError(describeError(error, 'Your online services could not be loaded.')); });
    }, []);

    const replace = (provider) => setProviders((current) => current.map((one) => (one.id === provider.id ? provider : one)));
    const connected = (id) => (providers || []).find((provider) => provider.kind === id) || null;
    const run = async (id, work, fallback) => {
        setBusy(id);
        try {
            await work();
        } catch (error) {
            notifyError(describeError(error, fallback));
        }
        setBusy(null);
    };
    const save = () => run(chosen.id, async () => {
        const existing = connected(chosen.id);
        const { provider } = existing ? await providerService.replaceKey(existing.id, key.trim()) : await providerService.add(chosen.id, key.trim());
        if (existing) replace(provider);
        else setProviders((current) => [...current, provider]);
        if (provider.health.state === 'healthy') success(`${provider.name} is connected. Its models are in the model picker of every chat.`);
        setKey('');
        if (provider.health.state === 'healthy') setChosen(null);
    }, 'The key could not be saved.');
    const check = (provider) => run(provider.id, async () => replace((await providerService.check(provider.id)).provider), 'This service could not be checked.');
    const remove = async (provider) => {
        if (!await confirm(`Remove ${provider.name}? Its models leave the model picker, and its key is deleted from Mollama.`, { confirmLabel: 'Remove', color: 'error' })) return;
        run(provider.id, async () => {
            await providerService.remove(provider.id);
            setProviders((current) => current.filter((one) => one.id !== provider.id));
        }, 'This service could not be removed.');
    };

    if (providers === null) return <Typography size="xs" color="muted">Loading your online services…</Typography>;
    const ollama = suggested.find((entry) => entry.id === 'ollama');
    const others = suggested.filter((entry) => entry.id !== 'ollama' && !connected(entry.id));

    const keyForm = (entry) => (
        <Card layout="flex-column" gap="xs" padding="md" width="100%" hover={false}>
            <Container layout="flex" align="center" gap="sm" padding="none">
                <Icon name={PROVIDER_ICONS[entry.id] || 'FiCloud'} size="sm" color="primary" />
                <Typography size="sm" weight="semibold">Getting a key for {entry.name}</Typography>
                <Typography size="xxs" color="muted">{entry.key.cost}</Typography>
                <Button size="xxs" color="secondary" title="Opens in a new tab" onClick={() => window.open(entry.key.page, '_blank', 'noopener')}>
                    <Icon name="FiExternalLink" size="xs" />Open the key page
                </Button>
            </Container>
            {entry.key.steps.map((step, index) => <Typography key={step} size="xs">{index + 1}. {step}</Typography>)}
            <Container layout="flex" align="end" gap="sm" padding="none" width="100%" wrap={false}>
                <Input size="sm" label="Key" type="password" value={key} onChange={(e) => setKey(e.target.value)} width="100%" />
                <Button size="sm" color="primary" disabled={busy === entry.id || key.trim().length < 8} onClick={save}>
                    <Icon name="FiCheck" size="xs" />{busy === entry.id ? 'Checking…' : 'Connect'}
                </Button>
                <Button size="sm" color="secondary" onClick={() => { setChosen(null); setKey(''); }}>Cancel</Button>
            </Container>
            <Typography size="xxs" color="muted">The key is stored sealed on Mollama&apos;s server and is never shown again. Chats on these models are sent to {entry.name} and billed to your account there.</Typography>
        </Card>
    );

    const connectedCard = (provider) => (
        <Card key={provider.id} layout="flex-column" gap="xs" padding="sm" width="100%" minWidth="0" hover={false}>
            <Row>
                <Container layout="flex" align="center" gap="xs" padding="none" wrap={false} minWidth="0">
                    <Icon name={PROVIDER_ICONS[provider.kind] || 'FiCloud'} size="sm" color="primary" />
                    <Typography size="sm" weight="semibold" truncate>{provider.name}</Typography>
                </Container>
                <Badge size="xs" color={PROVIDER_COLORS[provider.health.state] || 'error'}>{provider.health.label}</Badge>
            </Row>
            <Typography size="xxs" color="muted">{provider.modelCount === 1 ? '1 model' : `${provider.modelCount} models`} in the model picker of every chat</Typography>
            {provider.health.needs.map((need) => <Typography key={need} size="xxs">{need}</Typography>)}
            <Container layout="flex" align="center" justify="end" gap="xs" padding="none" width="100%">
                <Button size="xxs" color="secondary" disabled={busy === provider.id} onClick={() => { setChosen(suggested.find((entry) => entry.id === provider.kind)); setKey(''); }}><Icon name="FiKey" size="xs" />Replace key</Button>
                <Button size="xxs" color="secondary" disabled={busy === provider.id} onClick={() => check(provider)}><Icon name="FiRefreshCw" size="xs" />{busy === provider.id ? 'Checking…' : 'Check'}</Button>
                <Button size="xxs" color="error" disabled={busy === provider.id} onClick={() => remove(provider)}><Icon name="FiTrash2" size="xs" />Remove</Button>
            </Container>
        </Card>
    );

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            {providers.length > 0 && (
                <>
                    <SectionTitle icon="FiCloud" title="Connected" count={providers.length} />
                    <Container layout="grid" columns={3} gap="sm" padding="none" width="100%">
                        {providers.map(connectedCard)}
                    </Container>
                </>
            )}

            {ollama && !connected('ollama') && (
                <>
                    <SectionTitle icon="FiDownloadCloud" title="Models too large to download" />
                    <Card layout="flex" align="center" justify="between" gap="md" padding="md" width="100%" hover={false} wrap={false}>
                        <Container layout="flex" align="center" gap="sm" padding="none" wrap={false} minWidth="0">
                            <Icon name="SiOllama" size="md" color="primary" />
                            <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                                <Typography size="sm" weight="semibold">Run them on Ollama&apos;s computers</Typography>
                                <Typography size="xs" color="muted">The models marked &quot;Cloud only&quot; in Discover cannot be downloaded. With your own Ollama key they run on Ollama&apos;s computers and work in chats like any other model.</Typography>
                            </Container>
                        </Container>
                        <Button size="sm" color="primary" onClick={() => { setChosen(ollama); setKey(''); }}><Icon name="FiKey" size="xs" />Add an Ollama key</Button>
                    </Card>
                </>
            )}

            {chosen && keyForm(chosen)}

            {others.length > 0 && (
                <>
                    <SectionTitle icon="FiGlobe" title="Other providers" />
                    <Container layout="grid" columns={4} gap="sm" padding="none" width="100%">
                        {others.map((entry) => (
                            <Card key={entry.id} layout="flex-column" gap="xs" padding="md" width="100%" minWidth="0" hover={false} shadow={false}>
                                <Row>
                                    <Container layout="flex" align="center" gap="sm" padding="none" wrap={false} minWidth="0">
                                        <Icon name={PROVIDER_ICONS[entry.id] || 'FiCloud'} size="md" color="primary" />
                                        <Typography size="sm" weight="semibold" truncate>{entry.name}</Typography>
                                    </Container>
                                    <Button size="xs" color={chosen?.id === entry.id ? 'secondary' : 'primary'} onClick={() => { setChosen(entry); setKey(''); }}><Icon name="FiKey" size="xs" />Add a key</Button>
                                </Row>
                                <Typography size="xs">{entry.does}.</Typography>
                                <Typography size="xxs" color="muted">{entry.key.cost}</Typography>
                            </Card>
                        ))}
                    </Container>
                </>
            )}
        </Container>
    );
};

const CatalogueCard = ({ model, job, canManage, ollamaUp, onDownload }) => {
    const guide = useGuide();
    const busy = job && ['queued', 'downloading'].includes(job.status);
    let action = null;

    const useOnline = (model.cloudOnly || model.online) && (
        <Button size="xs" color="secondary" title="Run it on Ollama's computers with your own Ollama key" onClick={() => window.dispatchEvent(new CustomEvent('models-open-online'))}>
            <Icon name="FiCloud" size="xs" />Use online
        </Button>
    );
    if (model.cloudOnly) action = null;
    else if (model.installed) action = <Badge size="xs" color="success">Installed</Badge>;
    else if (busy) action = <Badge size="xs" color="primary">{job.status === 'queued' ? 'Waiting' : `Downloading ${job.percent}%`}</Badge>;
    // A model that fits only when pooled is downloaded to the computer the pool runs it on, its main computer.
    else if (!model.fit.fits && !(model.pool && model.pool.here)) action = model.pool?.main
        ? <Badge size="xs" color="primary" title="A pooled model runs from the file on the main computer. Open the Models page for that computer to download it.">Download on {model.pool.main}</Badge>
        : <Badge size="xs" color="error">Too large</Badge>;
    else if (!model.fitsDisk) action = <Badge size="xs" color="error">Not enough disk</Badge>;
    else if (canManage) {
        const forPool = !model.fit.fits;
        action = (
            <Button size="xs" onClick={() => onDownload(model.tag)} disabled={!ollamaUp} title={forPool ? `Too large for this computer alone. It is kept here and runs in chats placed on your pool, with ${model.pool.names} sharing the work.` : undefined} {...guide.tip('models.download')}>
                <Icon name="FiDownload" size="xs" />
                {job?.status === 'paused' || job?.status === 'failed' ? 'Resume' : forPool ? 'Download for pooling' : 'Download'}
            </Button>
        );
    }

    return (
        <Card layout="flex-column" gap="xs" padding="md" width="100%" height="100%" minWidth="0" wrap={false}>
            <Row>
                <Typography as="h3" size="sm" weight="semibold" truncate title={model.name}>{model.name}</Typography>
                {model.pickLabel && <Badge size="xs" color="primary" title={model.pickWhy}>{model.pickLabel}</Badge>}
            </Row>
            <Typography size="xxs" color="muted" font="monospace" truncate title="Its name on Ollama">{model.tag}</Typography>
            <Typography size="xs" color="muted">{model.description}</Typography>
            <Container layout="flex" gap="xs" padding="none" align="center">
                <Badge size="xs" color={FIT_COLORS[model.fit.verdict]}>{model.fit.label}</Badge>
                {model.pool && !model.pool.off && <Badge size="xs" color="primary" title={`Too large for this computer alone, but together these computers can give it ${gb(model.pool.memoryMb)}. A pooled model writes more slowly than one on a single computer.`}>Fits if you pool {model.pool.names}</Badge>}
                {model.pool?.off && <Badge size="xs" color="warning" title={`It fits when ${model.pool.names} pool, but the pool is off right now. ${model.pool.off}`}>Fits pooled, pool off now</Badge>}
                {model.pool && model.moe && <Badge size="xs" color="success" title="Only a small part of this model works on each word, so far less crosses between your computers: it writes much faster pooled than a model of the same size that is not a mixture of experts.">Faster when pooled</Badge>}
                {model.pool && <Typography size="xxs" href="/devices?view=pooling">How to pool</Typography>}
                {cannotChat(model) && <NoChatBadge />}
                {abilities(model).map((ability) => <Badge key={ability} size="xs" color="secondary" title={ABILITY_NOTES[ability]}>{ability}</Badge>)}
            </Container>
            <Container padding="none" flexFill />
            <Typography size="xs" margin="none">
                {model.cloudOnly
                    ? 'Too large to download. Runs on Ollama with your own key.'
                    : [`${gb(model.sizeMb)} download`, model.fit.memoryNeededMb ? `needs ${gb(model.fit.memoryNeededMb)} to run` : null, model.fit.tokensPerSecond ? speedWords(model.fit.tokensPerSecond) : null].filter(Boolean).join(' · ')}
            </Typography>
            {!model.cloudOnly && <Placement model={model} />}
            {(useOnline || action) && (
                <Container layout="flex" align="center" justify="end" gap="xs" padding="none" width="100%">
                    {useOnline}
                    {action}
                </Container>
            )}
        </Card>
    );
};

const PAGE_SIZES = [4, 8, 12, 24, 48];
const EVERYTHING = { q: '', purpose: 'all', can: [], fits: false, size: 'any', memory: 'any', params: 'any' };
// Each range is a band from one figure to the next; the last has no upper end.
const bands = (unit, steps, scale = 1) => [
    { value: 'any', label: 'Any' },
    ...steps.map((step, index) => ({
        value: `${index === 0 ? 0 : steps[index - 1]}-${step}`,
        label: index === 0 ? `Up to ${step} ${unit}` : `${steps[index - 1]} to ${step} ${unit}`,
        low: (index === 0 ? 0 : steps[index - 1]) * scale,
        high: step * scale
    })),
    { value: `${steps.at(-1)}-`, label: `Over ${steps.at(-1)} ${unit}`, low: steps.at(-1) * scale, high: null }
];
const RANGES = {
    size: { title: 'Download size', low: 'minSizeMb', high: 'maxSizeMb', options: bands('GB', [2, 5, 10, 20, 40], 1024) },
    memory: { title: 'Memory needed', low: 'minMemoryMb', high: 'maxMemoryMb', options: bands('GB', [4, 8, 16, 32, 64], 1024) },
    params: { title: 'Model size', low: 'minParams', high: 'maxParams', options: bands('B', [4, 9, 16, 34, 80]) }
};
const rangeQuery = (find) => Object.entries(RANGES).reduce((query, [key, range]) => {
    const band = range.options.find((option) => option.value === find[key]);
    if (!band || band.value === 'any') return query;
    return { ...query, ...(band.low > 0 ? { [range.low]: band.low } : {}), ...(band.high !== null ? { [range.high]: band.high } : {}) };
}, {});
const SORTS = [
    { value: 'fit', label: 'Best fit for this computer', short: 'Best fit' },
    { value: 'largest', label: 'Needs the most memory first', short: 'Most memory' },
    { value: 'smallest', label: 'Needs the least memory first', short: 'Least memory' },
    { value: 'popular', label: 'Most downloaded first', short: 'Most downloaded' },
    { value: 'name', label: 'Name, A to Z', short: 'Name' }
];
const sortChoice = () => {
    try {
        const kept = localStorage.getItem('mollama-models-sort');
        return SORTS.some((option) => option.value === kept) ? kept : 'fit';
    } catch {
        return 'fit';
    }
};
const perPage = () => {
    const kept = Number(localStorage.getItem('mollama-models-per-page'));
    return PAGE_SIZES.includes(kept) ? kept : 12;
};
const DiscoverTab = ({ catalogue, recommended, find, jobs, canManage, ollamaUp, onDownload, onFind, onPage, onSort, loading }) => {
    const top = useRef(null);
    const [customName, setCustomName] = useState('');
    const [query, setQuery] = useState(find.q);
    const searched = useRef(find.q);

    // The list follows what is typed, a moment after the typing stops.
    useEffect(() => {
        const wanted = query.trim();
        if (wanted === searched.current) return undefined;
        const timer = setTimeout(() => {
            searched.current = wanted;
            onFind({ q: wanted });
        }, 350);
        return () => clearTimeout(timer);
    }, [query]);

    if (!catalogue) return <Typography size="xs" color="muted">Working out which models fit this device…</Typography>;
    const page = catalogue.page || 1;
    const size = catalogue.size || perPage();
    const paged = catalogue.paged ?? catalogue.total ?? 0;
    const pages = Math.max(1, Math.ceil(paged / size));
    const turn = (next, perPage = size) => {
        onPage(next, perPage);
        top.current?.scrollIntoView({ block: 'start' });
    };
    const narrowed = Boolean(find.q) || find.purpose !== 'all' || find.can.length > 0 || find.fits || Object.keys(RANGES).some((key) => find[key] !== 'any');
    const clear = () => {
        searched.current = '';
        setQuery('');
        onFind(EVERYTHING);
    };
    const total = catalogue.total ?? 0;
    const counted = `${total} ${total === 1 ? 'model' : 'models'}`;
    const summary = [
        catalogue.near ? `No model is called "${find.q}". The closest ${total === 1 ? 'is' : 'are'} shown: ${counted}` : narrowed ? `${counted} found` : `${counted} to choose from`,
        !find.fits && catalogue.fitting !== null && catalogue.fitting !== undefined ? `${catalogue.fitting} fit this computer` : null
    ].filter(Boolean).join(' · ');

    const jobFor = (tag) => jobs.find((job) => job.model === tag && job.status !== 'completed' && job.status !== 'cancelled');
    const others = catalogue.models;
    const card = (model) => (
        <CatalogueCard
            key={model.tag}
            model={model}
            job={jobFor(model.tag)}
            canManage={canManage}
            ollamaUp={ollamaUp}
            onDownload={onDownload}
        />
    );
    const choice = (label, on, change, key = label) => (
        <Button key={key} size="xs" color={on ? 'primary' : 'secondary'} selected={on} onClick={change}>{label}</Button>
    );
    // Every filter in force, each with the way to take it off.
    const active = [
        find.purpose !== 'all' ? { label: PURPOSES.find((option) => option.id === find.purpose)?.label, off: () => onFind({ purpose: 'all' }) } : null,
        ...find.can.map((ability) => ({ label: ABILITY_LABELS[ability], off: () => onFind({ can: find.can.filter((one) => one !== ability) }) })),
        find.fits ? { label: 'Fits this computer', off: () => onFind({ fits: false }) } : null,
        ...Object.entries(RANGES).filter(([key]) => find[key] !== 'any').map(([key, range]) => ({ label: `${range.title}: ${range.options.find((option) => option.value === find[key])?.label}`, off: () => onFind({ [key]: 'any' }) }))
    ].filter(Boolean);
    const group = (title, children) => (
        <Container key={title} layout="flex-column" gap="xs" padding="none" width="100%">
            <Typography size="xxs" color="muted" margin="none">{title}</Typography>
            <Container layout="flex" gap="xs" padding="none" align="center" width="100%">{children}</Container>
        </Container>
    );
    const filterPanel = (
        <Container layout="flex-column" gap="sm" padding="sm" width="100%">
            {group('Good for', PURPOSES.map((option) => choice(option.label, find.purpose === option.id, () => onFind({ purpose: option.id }), option.id)))}
            {group('Can do', [
                ...Object.entries(ABILITY_LABELS).map(([ability, label]) => choice(label, find.can.includes(ability), () => onFind({ can: find.can.includes(ability) ? find.can.filter((one) => one !== ability) : [...find.can, ability] }))),
                choice('Fits this computer', find.fits, () => onFind({ fits: !find.fits }))
            ])}
            {Object.entries(RANGES).map(([key, range]) => group(range.title, range.options.map((option) => choice(option.label, find[key] === option.value, () => onFind({ [key]: option.value }), option.value))))}
        </Container>
    );
    const sortPanel = (
        <Container layout="flex-column" gap="xs" padding="sm" width="100%">
            <Typography size="xxs" color="muted" margin="none">Order</Typography>
            {SORTS.map((option) => (
                <Button key={option.value} size="xs" width="100%" align="start" color={sortChoice() === option.value ? 'primary' : 'secondary'} selected={sortChoice() === option.value} onClick={() => onSort(option.value)}>{option.label}</Button>
            ))}
        </Container>
    );

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            {recommended?.length > 0 && (
                <>
                    <SectionTitle icon="FiStar" title="Recommended for this device" count={recommended.length} />
                    <Container layout="grid" columns="auto-lg" gap="sm" padding="none" width="100%" align="stretch">{recommended.map(card)}</Container>
                </>
            )}
            {recommended?.length === 0 && (
                <Typography size="xs" color="muted">
                    No model is a comfortable fit for this device. Smaller ones may still run slowly.
                </Typography>
            )}

            <Container ref={top} layout="flex-column" gap="xs" padding="none" width="100%">
                <Container layout="flex" gap="xs" padding="none" align="center" width="100%">
                    <Input
                        size="sm"
                        type="search"
                        placeholder="Search by name, size or ability: gemma, qwen3 30b, vision"
                        value={query}
                        maxLength={60}
                        onChange={(event) => setQuery(event.target.value.slice(0, 60))}
                        onKeyDown={(event) => { if (event.key === 'Enter') { searched.current = query.trim(); onFind({ q: query.trim() }); } }}
                        minWidth="220px"
                        flexFill
                    />
                    <Button size="sm" color={active.length > 0 ? 'primary' : 'secondary'} genie={{ trigger: 'click', padding: 'none', width: '360px', content: filterPanel }} genieTrigger="click">
                        <Icon name="FiFilter" size="xs" />Filters{active.length > 0 ? ` (${active.length})` : ''}
                    </Button>
                    <Button size="sm" color="secondary" genie={{ trigger: 'click', padding: 'none', width: '260px', content: sortPanel }} genieTrigger="click">
                        <Icon name="FiBarChart2" size="xs" />{SORTS.find((option) => option.value === sortChoice())?.short}
                    </Button>
                </Container>
                {active.length > 0 && (
                    <Container layout="flex" gap="xs" padding="none" align="center" width="100%">
                        {active.map((one) => (
                            <Button key={one.label} size="xs" color="primary" onClick={one.off} title="Remove this filter">
                                {one.label}<Icon name="FiX" size="xs" />
                            </Button>
                        ))}
                        <Button size="xs" color="secondary" onClick={clear}>Clear all</Button>
                    </Container>
                )}
                <Typography size="xxs" color="muted" margin="none">{summary}</Typography>
                {catalogue.plain && (active.length > 0 || sortChoice() !== 'fit') && (
                    <Typography size="xxs" color="warning" margin="none">This server is older than this page, so the filters and order chosen here are not applied yet. Restart or update the server.</Typography>
                )}
                {!canManage && <Typography size="xxs" color="muted">Only an admin or owner can download models.</Typography>}
            </Container>

            {catalogue.models.length === 0 && (
                <Typography size="xs" color="muted">
                    {catalogue.unavailable ? 'The list could not be loaded from ollama.com. You can still add a model by its name below.' : 'No model in the ollama.com library matched. Try other words or fewer filters, or add a model by its name below.'}
                </Typography>
            )}

            {others.length > 0 && (
                <>
                    <SectionTitle icon="FiGrid" title="All models" count={catalogue.total ?? others.length} />
                    <Container layout="grid" columns="auto-lg" gap="sm" padding="none" width="100%" align="stretch">{others.map(card)}</Container>
                </>
            )}

            {paged > PAGE_SIZES[0] && (
                <Container layout="flex-column" gap="xs" padding="none" width="100%">
                    <Pagination size="sm" padding="none" page={page} pages={pages} disabled={loading} onPage={(next) => turn(next)} pageSize={size} pageSizes={PAGE_SIZES} onPageSize={(chosen) => turn(1, chosen)}>
                        <Typography size="xxs" color="muted" margin="none">per page</Typography>
                    </Pagination>
                    <Container layout="flex" justify="end" padding="none" width="100%">
                        <Typography size="xxs" color="muted" margin="none">Page {page} of {pages} · {paged} models</Typography>
                    </Container>
                </Container>
            )}

            {canManage && (
                <Card layout="flex-column" gap="xs" padding="md" width="100%" hover={false} shadow={false}>
                    <SectionTitle icon="FiPlus" title="Add a model by name" />
                    <Typography size="xxs" color="muted">
                        For a model that is not listed. Type its name exactly as Ollama lists it, for example llama3.2:1b.
                        Mollama cannot tell in advance whether it will fit.
                    </Typography>
                    <Container layout="flex" gap="xs" padding="none" align="center" width="100%" wrap={false}>
                        <Input
                            size="sm"
                            placeholder="Model name"
                            value={customName}
                            onChange={(event) => setCustomName(event.target.value)}
                            width="100%"
                            flexFill
                        />
                        <Button
                            size="sm"
                            disabled={!customName.trim() || !ollamaUp}
                            onClick={() => { onDownload(customName.trim()); setCustomName(''); }}
                        >
                            <Icon name="FiDownload" size="xs" />Download
                        </Button>
                    </Container>
                </Card>
            )}
        </Container>
    );
};

const InstalledTab = ({ installed, canManage, onDelete, elsewhere = {} }) => {
    if (!installed) return <Typography size="xs" color="muted">Looking for installed models…</Typography>;
    if (!installed.ollamaAvailable) {
        return <Empty icon="FiAlertCircle" title="Ollama is not running" text="Installed models cannot be listed until it is started." />;
    }
    if (installed.models.length === 0) {
        return <Empty icon="FiBox" title="No models are installed yet" text="Open Discover to download one that fits this device." />;
    }

    return (
        <Container layout="grid" columns="auto-lg" gap="sm" padding="none" width="100%">
            {installed.models.map((model) => (
                <Card key={model.name} layout="flex-column" gap="xs" padding="md" width="100%" height="100%" minWidth="0" wrap={false}>
                    <Row>
                        <Typography as="h3" size="sm" weight="semibold" truncate title={model.displayName}>{model.displayName}</Typography>
                        {canManage && (
                            <Button size="xxs" variant="ghost" color="error" title="Delete" aria-label={`Delete ${model.displayName}`} onClick={() => onDelete(model)}>
                                <Icon name="FiTrash2" />
                            </Button>
                        )}
                    </Row>
                    {model.displayName !== model.name && <Typography size="xxs" color="muted" truncate>{model.name}</Typography>}
                    {model.description && <Typography size="xs" color="muted">{model.description}</Typography>}
                    <Container layout="flex" gap="xs" padding="none" align="center">
                        {model.personal && <Badge size="xs" color="primary">Yours, on {model.basedOn}</Badge>}
                        {cannotChat(model) && <NoChatBadge />}
                        {abilities(model).map((ability) => <Badge key={ability} size="xs" color="secondary" title={ABILITY_NOTES[ability]}>{ability}</Badge>)}
                        {elsewhere[model.name]?.length > 0 && <Badge size="xs" color="tertiary">Also on {elsewhere[model.name].join(', ')}</Badge>}
                    </Container>
                    <Typography size="xxs" color="muted">
                        {[
                            `${gbFromBytes(model.sizeBytes)} on disk`,
                            model.fit?.memoryNeededMb ? `needs ${gb(model.fit.memoryNeededMb)} to run` : null,
                            model.parameterSize,
                            model.quantization,
                            model.contextLength ? `reads ${model.contextLength.toLocaleString()} tokens` : null
                        ].filter(Boolean).join(' · ')}
                    </Typography>
                    <Placement model={model} />
                </Card>
            ))}
        </Container>
    );
};

const RunningTab = ({ running, canManage, onUnload }) => {
    if (!running) return <Typography size="xs" color="muted">Checking what is loaded…</Typography>;
    if (running.unavailable) {
        return <Empty icon="FiAlertCircle" title="Ollama is not running" text="Loaded models cannot be listed until it is started." />;
    }
    if (running.models.length === 0) {
        return <Empty icon="FiMoon" title="No model is loaded in memory" text="A model loads when it is used and is unloaded again after a few minutes." />;
    }

    return (
        <Container layout="grid" columns="auto-lg" gap="sm" padding="none" width="100%">
            {running.models.map((model) => (
                <Card key={model.name} layout="flex-column" gap="xs" padding="md" width="100%" minWidth="0" wrap={false}>
                    <Row>
                        <Typography as="h3" size="sm" weight="semibold" truncate>{model.displayName}</Typography>
                        {canManage && <Button size="xs" color="secondary" onClick={() => onUnload(model)}>Unload</Button>}
                    </Row>
                    <Container layout="flex" gap="xs" padding="none" align="center">
                        {model.healthy && <Badge size="xs" color="success">Fully on GPU</Badge>}
                        {!model.healthy && model.gpuPercent > 0 && (
                            <Badge size="xs" color="warning">Partly on CPU, so slower ({model.gpuPercent}% on GPU)</Badge>
                        )}
                        {model.gpuPercent === 0 && <Badge size="xs" color="warning">On the processor, so slower</Badge>}
                        <Typography size="xxs" color="muted">{gbFromBytes(model.sizeBytes)} in memory</Typography>
                    </Container>
                </Card>
            ))}
        </Container>
    );
};

const EMPTY_MODEL_FORM = { displayName: '', from: '', system: '', creativity: 0.7, contextSize: '' };

const ModelFields = ({ form, setForm, bases }) => {
    const [advanced, setAdvanced] = useState(form.contextSize !== '');
    const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
    return (
        <>
            <Input label="Name" value={form.displayName} onChange={change('displayName')} width="100%" />
            <Select
                label="Built on"
                width="100%"
                options={bases.map((model) => ({ value: model.name, label: model.displayName }))}
                value={form.from}
                onChange={(value) => setForm((current) => ({ ...current, from: value }))}
            />
            <Input
                label="Instructions"
                helpText="How this model should behave every time it is used."
                multiline
                rows={5}
                value={form.system}
                onChange={change('system')}
                width="100%"
            />
            <Container layout="flex-column" gap="xs" padding="none" width="100%">
                <Typography size="sm" weight="semibold">Creativity</Typography>
                <ButtonGroup size="sm" width="100%" wrap={false} justify="start" selectable={false}>
                    {CREATIVITY.map((level) => (
                        <Button
                            key={level.label}
                            size="sm"
                            color={creativityOf(form.creativity) === level.label ? 'primary' : 'secondary'}
                            selected={creativityOf(form.creativity) === level.label}
                            onClick={() => setForm((current) => ({ ...current, creativity: level.value }))}
                        >
                            {level.label}
                        </Button>
                    ))}
                </ButtonGroup>
            </Container>
            <Container layout="flex" gap="sm" padding="none">
                <Button size="sm" color="secondary" onClick={() => setAdvanced((open) => !open)}>
                    {advanced ? 'Hide advanced' : 'Advanced'}
                </Button>
            </Container>
            {advanced && (
                <Input
                    label="Reading size in tokens (optional)"
                    helpText="How much text the model can take in at once. Leave empty to use the model's own setting. Larger uses more memory."
                    value={form.contextSize}
                    onChange={change('contextSize')}
                    width="100%"
                />
            )}
        </>
    );
};

const MineTab = ({ installed, canManage, onCreated, onDelete }) => {
    const { success, error: notifyError } = useNotification();
    const [template, setTemplate] = useState(null);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY_MODEL_FORM);
    const [busy, setBusy] = useState(false);

    if (!installed) return <Typography color="muted">Looking for installed models…</Typography>;

    const bases = installed.models.filter((model) => !model.personal);
    const mine = installed.models.filter((model) => model.personal);

    const choose = (option) => {
        setEditing(null);
        setTemplate(option.id);
        setForm({ ...EMPTY_MODEL_FORM, displayName: option.displayName, from: bases[0]?.name || '', system: option.system, creativity: option.creativity });
    };

    const startEdit = (model) => {
        setTemplate(null);
        setEditing(model.name);
        setForm({
            displayName: model.displayName,
            from: bases.find((base) => base.name === model.basedOn || base.name === `${model.basedOn}:latest`)?.name || model.basedOn || '',
            system: model.system || '',
            creativity: model.parameters?.temperature ?? 0.7,
            contextSize: model.parameters?.num_ctx ? String(model.parameters.num_ctx) : ''
        });
    };

    const parametersOf = () => {
        const parameters = { temperature: Number(form.creativity) };
        if (form.contextSize === '') return parameters;
        const size = Number(form.contextSize);
        if (!Number.isInteger(size) || size < 512 || size > 262144) {
            notifyError('Reading size must be a whole number from 512 to 262144.');
            return null;
        }
        return { ...parameters, num_ctx: size };
    };

    const run = async (work, done) => {
        setBusy(true);
        try {
            await work();
            success(done);
            setTemplate(null);
            setEditing(null);
            onCreated();
        } catch (error) {
            notifyError(describeError(error));
        } finally {
            setBusy(false);
        }
    };

    const create = () => {
        const name = slug(form.displayName);
        if (!name) {
            notifyError('Give your model a name using letters or numbers.');
            return;
        }
        const parameters = parametersOf();
        if (!parameters) return;
        const displayName = form.displayName.trim();
        run(
            () => modelService.createModel({ name, displayName, from: form.from, system: form.system, parameters }),
            `${displayName} is ready. It is in your Installed list.`
        );
    };

    const save = (model) => {
        const parameters = parametersOf();
        if (!parameters) return;
        const displayName = form.displayName.trim();
        run(
            () => modelService.updateModel({ name: model.name, displayName, from: form.from, system: form.system, parameters }),
            `${displayName} was updated.`
        );
    };

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            <Typography size="xs" color="muted">
                A personal model is an installed model with your own instructions built in, saved under its own name.
                It takes almost no extra disk space.
                {!canManage && ' Only an admin or owner can create personal models.'}
            </Typography>

            {canManage && bases.length === 0 && (
                <Empty icon="FiBox" title="Install a model first" text="A personal model is built on one you have downloaded. Open Discover to get one." />
            )}

            {canManage && bases.length > 0 && (
                <Card layout="flex-column" gap="sm" padding="md" width="100%" maxWidth="720px" hover={false}>
                    <SectionTitle icon="FiPlus" title="New model, starting from" />
                    <ButtonGroup size="xs" width="100%" justify="start" selectable={false}>
                        {TEMPLATES.map((option) => (
                            <Button
                                key={option.id}
                                size="xs"
                                color={template === option.id ? 'primary' : 'secondary'}
                                selected={template === option.id}
                                onClick={() => choose(option)}
                            >
                                {option.label}
                            </Button>
                        ))}
                    </ButtonGroup>

                    {template && (
                        <>
                            <ModelFields key={template} form={form} setForm={setForm} bases={bases} />
                            <Container layout="flex" gap="xs" padding="none">
                                <Button size="sm" onClick={create} disabled={busy || !form.displayName.trim() || !form.from}>
                                    {busy ? 'Creating…' : 'Create model'}
                                </Button>
                                <Button size="sm" color="secondary" onClick={() => setTemplate(null)} disabled={busy}>Cancel</Button>
                            </Container>
                        </>
                    )}
                </Card>
            )}

            {mine.length > 0 && <SectionTitle icon="FiUser" title="Your models" count={mine.length} />}
            <Container layout="grid" columns="auto-lg" gap="sm" padding="none" width="100%">
                {mine.map((model) => (
                    <Card
                        key={model.name}
                        layout="flex-column"
                        gap="xs"
                        padding="md"
                        width="100%"
                        minWidth="0"
                        wrap={false}
                        hover={editing !== model.name}
                        span={editing === model.name ? 'full' : null}
                    >
                        <Row>
                            <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                                <Typography as="h3" size="sm" weight="semibold" truncate>{model.displayName}</Typography>
                                <Typography size="xxs" color="muted" truncate>Built on {model.basedOn}</Typography>
                            </Container>
                            {canManage && editing !== model.name && (
                                <Container layout="flex" gap="none" padding="none" wrap={false}>
                                    <Button size="xxs" variant="ghost" title="Edit" aria-label={`Edit ${model.displayName}`} onClick={() => startEdit(model)}>
                                        <Icon name="FiEdit2" />
                                    </Button>
                                    <Button size="xxs" variant="ghost" color="error" title="Delete" aria-label={`Delete ${model.displayName}`} onClick={() => onDelete(model)}>
                                        <Icon name="FiTrash2" />
                                    </Button>
                                </Container>
                            )}
                        </Row>
                        {editing === model.name ? (
                            <Container layout="flex-column" gap="sm" padding="none" width="100%" maxWidth="720px">
                                <ModelFields key={model.name} form={form} setForm={setForm} bases={bases} />
                                <Container layout="flex" gap="xs" padding="none">
                                    <Button size="sm" onClick={() => save(model)} disabled={busy || !form.displayName.trim() || !form.from}>
                                        {busy ? 'Saving…' : 'Save changes'}
                                    </Button>
                                    <Button size="sm" color="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
                                </Container>
                            </Container>
                        ) : (
                            <>
                                <Container layout="flex-column" gap="none" padding="none" width="100%" maxHeight="120px" overflow="auto">
                                    {model.system
                                        ? model.system.split('\n').map((line, index) => <Typography key={index} as="p" size="xs" color="muted">{line || ' '}</Typography>)
                                        : <Typography size="xs" color="muted">No instructions were given to this model.</Typography>}
                                </Container>
                                <Container layout="flex" gap="xs" padding="none" align="center">
                                    <Badge size="xs" color="secondary">{creativityOf(model.parameters?.temperature ?? 0.7)}</Badge>
                                    {model.parameters?.num_ctx && <Badge size="xs" color="secondary">Reads {model.parameters.num_ctx.toLocaleString()} tokens</Badge>}
                                </Container>
                            </>
                        )}
                    </Card>
                ))}
            </Container>
        </Container>
    );
};

const ModelsPage = () => {
    const { success, error: notifyError, confirm } = useNotification();
    const [tab, setTab] = useState('discover');
    const guide = useGuide();
    const [devices, setDevices] = useState(null);
    const [device, setDevice] = useState(null);
    const [elsewhere, setElsewhere] = useState({});
    const [catalogue, setCatalogue] = useState(null);
    const [installed, setInstalled] = useState(null);
    const [running, setRunning] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [canManage, setCanManage] = useState(false);
    const statuses = useRef(new Map());

    const loadInstalled = useCallback(async () => {
        try {
            const result = await modelService.listInstalled();
            setInstalled(result);
            setCanManage(Boolean(result.permissions?.manage));
        } catch (error) {
            notifyError(describeError(error, 'Installed models could not be loaded.'));
        }
    }, [notifyError]);
    const [refreshing, setRefreshing] = useState(false);

    const [catalogueLoading, setCatalogueLoading] = useState(false);
    useEffect(() => {
        const open = () => setTab('online');
        window.addEventListener('models-open-online', open);
        return () => window.removeEventListener('models-open-online', open);
    }, []);
    // The list is read live from ollama.com. What was searched for and narrowed by is kept, so turning a page,
    // changing the order or coming back to this tab asks for the same list.
    const [find, setFind] = useState(EVERYTHING);
    const finding = useRef(EVERYTHING);
    const asking = useRef(0);
    const viewing = useRef(null);
    // The recommended models are read on their own, so no search, filter or page of the list changes them.
    const [recommended, setRecommended] = useState(null);
    const loadRecommended = useCallback(async (deviceId) => {
        try {
            const result = await modelService.getDeviceRecommended(deviceId);
            setRecommended((now) => (viewing.current === deviceId ? result.models : now));
        } catch { /* the list below still shows every model */ }
    }, []);
    const loadCatalogue = useCallback(async (deviceId, { page = 1, size = perPage(), sort = sortChoice(), all = false, ...changes } = {}) => {
        const wanted = { ...finding.current, ...changes };
        finding.current = wanted;
        setFind(wanted);
        const { q, purpose, can, fits } = wanted;
        const spans = rangeQuery(wanted);
        const mine = ++asking.current;
        setCatalogueLoading(true);
        try {
            const ask = (current) => modelService.getDeviceCatalogue(deviceId, {
                ...(q ? { q } : {}),
                ...(page > 1 ? { page } : {}),
                ...(all ? { all: true } : {}),
                ...(current && !all ? { size } : {}),
                ...(current && sort !== 'fit' ? { sort } : {}),
                ...(current && purpose !== 'all' ? { purpose } : {}),
                ...(current && can.length > 0 ? { can: can.join(',') } : {}),
                ...(current && fits ? { fits: true } : {}),
                ...(current ? spans : {})
            });
            // A server a little behind this page may not know every choice yet; it is then asked plainly.
            // When it has to be, the page says so, since what is shown is then not what was chosen.
            const result = await ask(true).catch((error) => (error?.response?.status === 400 ? ask(false).then((plain) => ({ ...plain, plain: true })) : Promise.reject(error)));
            // An answer overtaken by a newer search is dropped.
            if (mine !== asking.current) return;
            result.size = result.size || 48;
            setCatalogue(result);
        } catch (error) {
            if (mine !== asking.current) return;
            notifyError(describeError(error, 'The model list could not be loaded.'));
            setCatalogue((now) => (page > 1 && now ? now : { models: [], unavailable: true, query: q, page: 1, more: false }));
        } finally {
            if (mine === asking.current) setCatalogueLoading(false);
        }
    }, [notifyError]);

    const loadRunning = useCallback(async () => {
        try {
            setRunning(await modelService.listRunning());
        } catch (error) {
            setRunning({ unavailable: true, models: [] });
        }
    }, []);

    const loadDevices = useCallback(async () => {
        try {
            const result = await deviceService.listDevices();
            setDevices(result.devices);
            setDevice((now) => result.devices.find((entry) => entry.id === now?.id)
                || result.devices.find((entry) => entry.id === result.current && entry.online)
                || result.devices.find((entry) => entry.online)
                || result.devices[0]
                || null);
        } catch (error) {
            setDevices([]);
            notifyError(describeError(error, 'Your devices could not be read.'));
        }
    }, [notifyError]);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        await loadDevices();
        if (device?.online) await Promise.all([loadInstalled(), loadCatalogue(device.id), loadRecommended(device.id), loadRunning()]);
        setRefreshing(false);
    }, [device, loadDevices, loadInstalled, loadCatalogue, loadRecommended, loadRunning]);

    useEffect(() => {
        return onReturn(() => refreshRef.current());
    }, []);

    useEffect(() => {
        loadDevices();
        return () => modelService.view(null);
    }, [loadDevices]);

    // Everything on the page belongs to the chosen computer, so it is read again when that changes.
    const deviceId = device?.id || null;
    const deviceOnline = Boolean(device?.online);
    useEffect(() => {
        modelService.view(deviceId);
        viewing.current = deviceId;
        statuses.current = new Map();
        setInstalled(null);
        setCatalogue(null);
        setRecommended(null);
        setRunning(null);
        setJobs([]);
        if (!deviceId || !deviceOnline) return;
        loadInstalled();
        loadCatalogue(deviceId);
        loadRecommended(deviceId);
    }, [deviceId, deviceOnline, loadInstalled, loadCatalogue, loadRecommended]);

    // Which of this computer's models are also on the person's other computers.
    useEffect(() => {
        let live = true;
        const others = (devices || []).filter((entry) => entry.id !== deviceId && entry.online);
        Promise.all(others.map((entry) => modelService.installedOn(entry.id).then((result) => [entry.name, result.models.map((model) => model.name)], () => [entry.name, []])))
            .then((lists) => {
                if (!live) return;
                const found = {};
                lists.forEach(([name, models]) => models.forEach((model) => { found[model] = [...(found[model] || []), name]; }));
                setElsewhere(found);
            });
        return () => { live = false; };
    }, [devices, deviceId, installed]);

    useEffect(() => {
        if (tab !== 'running' || !deviceId || !deviceOnline) return undefined;
        loadRunning();
        const timer = setInterval(loadRunning, 5000);
        return () => clearInterval(timer);
    }, [tab, loadRunning, deviceId, deviceOnline]);

    const refreshRef = useRef(() => {});
    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    useEffect(() => {
        const reload = () => {
            refreshRef.current();
            loadRunning();
        };
        window.addEventListener('ollama-availability-changed', reload);
        return () => window.removeEventListener('ollama-availability-changed', reload);
    }, [loadRunning]);

    const noteJob = useCallback((job) => {
        const before = statuses.current.get(job.id);
        statuses.current.set(job.id, job.status);
        if (before && before !== 'completed' && job.status === 'completed') refreshRef.current();
    }, []);

    useEffect(() => {
        if (!deviceId || !deviceOnline) return undefined;
        let poll = null;
        const loadJobs = async () => {
            try {
                const result = await modelService.listDownloads();
                result.downloads.forEach(noteJob);
                setJobs(result.downloads);
            } catch {
                return;
            }
        };
        const stop = modelService.watchDownloads({
            onSnapshot: (list) => {
                list.forEach((job) => statuses.current.set(job.id, job.status));
                setJobs(list);
                window.dispatchEvent(new CustomEvent('ollama-status-changed'));
            },
            onProgress: (job) => {
                noteJob(job);
                setJobs((current) => (current.some((existing) => existing.id === job.id)
                    ? current.map((existing) => (existing.id === job.id ? job : existing))
                    : [job, ...current]));
            },
            onError: () => {
                if (!poll) poll = setInterval(loadJobs, 3000);
            }
        });
        return () => {
            stop();
            if (poll) clearInterval(poll);
        };
    }, [noteJob, deviceId, deviceOnline]);

    const act = async (action, failMessage) => {
        try {
            const result = await action();
            window.dispatchEvent(new CustomEvent('ollama-status-changed'));
            return result;
        } catch (error) {
            notifyError(describeError(error, failMessage));
            return null;
        }
    };

    const applyJob = (result) => {
        const job = result?.download;
        if (!job) return;
        statuses.current.set(job.id, job.status);
        setJobs((current) => (current.some((existing) => existing.id === job.id)
            ? current.map((existing) => (existing.id === job.id ? job : existing))
            : [job, ...current]));
    };

    const download = async (name, onComputer = deviceId) => applyJob(await act(() => modelService.startDownload(name, onComputer), 'The download could not be started.'));
    const pause = async (job) => applyJob(await act(() => modelService.pauseDownload(job.id), 'The download could not be paused.'));
    const cancel = async (job) => {
        if (job.status === 'failed') {
            applyJob(await act(() => modelService.cancelDownload(job.id), 'The download could not be removed.'));
            return;
        }
        if (!(await confirm(`Cancel the download of ${job.model}?`, { confirmLabel: 'Cancel download', cancelLabel: 'Keep downloading' }))) return;
        applyJob(await act(() => modelService.cancelDownload(job.id), 'The download could not be cancelled.'));
    };

    const deleteModel = async (model) => {
        const target = device;
        const dependants = model.usedBy?.length
            ? ` These personal models are built on it and will stop working: ${model.usedBy.join(', ')}.`
            : '';
        const agreed = await confirm(
            `Delete ${model.displayName} from ${target?.name || 'this device'}? You can download it again later.${elsewhere[model.name]?.length ? ` It stays on ${elsewhere[model.name].join(', ')}.` : ''}${dependants}`,
            { confirmLabel: 'Delete', color: 'error' }
        );
        if (!agreed) return;
        const result = await act(() => modelService.deleteModel(model.name, target?.id), 'The model could not be deleted.');
        if (result) {
            success(`${model.displayName} was deleted.`);
            refresh();
        }
    };

    const unload = async (model) => {
        const result = await act(() => modelService.unloadModel(model.name), 'The model could not be unloaded.');
        if (result) {
            success(`${model.displayName} was removed from memory.`);
            loadRunning();
        }
    };

    const ollamaUp = installed ? installed.ollamaAvailable : true;
    const counts = useMemo(() => ({ installed: installed?.models.length ?? null }), [installed]);

    return (
        <Page layout="flex-column" padding="none" gap="none" background="dots" backgroundFade="bottom">
            <Container layout="flex-column" align="center" gap="none" padding="none" width="100%" height="100vh" wrap={false} overflow="hidden">
            <Container layout="flex-column" gap="md" padding="lg" width="100%" maxWidth="1360px" wrap={false}>
                <Row>
                    <Container layout="flex-column" gap="none" padding="none">
                        <Typography as="h1" size="2xl" weight="bold" animation="blur" animationDuration={600}>Models</Typography>
                        <Typography size="xs" color="muted">
                            {device ? `Find, download and manage AI models on ${device.name}.` : 'Find, download and manage AI models.'}
                        </Typography>
                    </Container>
                    <Button size="sm" color="secondary" disabled={refreshing} title="Refresh models and disk space" onClick={refresh} {...guide.tip('models.refresh')}>
                        <Icon name="FiRefreshCw" size="xs" />Refresh
                    </Button>
                </Row>

                {devices?.length > 1 && (
                    <Container layout="flex" gap="xs" padding="none" align="center">
                        {devices.map((entry) => (
                            <Button key={entry.id} size="sm" color={entry.id === deviceId ? 'primary' : 'secondary'} selected={entry.id === deviceId} onClick={() => setDevice(entry)}>
                                <Icon name="FiMonitor" size="xs" />{entry.name}
                                {deviceService.ready(entry)
                                    ? <Icon name="FiCheckCircle" size="xs" color="success" title="Ready to use right now" aria-label="Ready to use right now" />
                                    : <Badge size="xs" color={entry.paused ? 'warning' : entry.online ? 'success' : 'default'}>{entry.paused ? 'Paused' : entry.online ? 'Online' : 'Offline'}</Badge>}
                            </Button>
                        ))}
                    </Container>
                )}

                <Container layout="grid" columns="auto-sm" gap="sm" padding="none" width="100%">
                    <Stat icon="FiBox" label="Installed" value={installed ? `${installed.models.length} models` : '…'} />
                    <Stat icon="FiHardDrive" label="Used by models" value={installed?.disk ? gb(installed.disk.usedByModelsMb) : '…'} />
                    <Stat icon="FiDatabase" label="Free disk" value={installed?.disk ? gb(installed.disk.freeMb) : '…'} />
                    <Stat
                        icon="FiCpu"
                        label={device?.name || 'Device'}
                        value={catalogue?.hardware?.gpuName || device?.hardware?.gpuName || device?.name || '…'}
                        note={device?.hardware?.gpuMemoryMb ? `${gb(device.hardware.gpuMemoryMb)} graphics memory` : null}
                    />
                </Container>

                <DownloadsPanel jobs={jobs} canManage={canManage} onResume={(job) => download(job.model, job.device || deviceId)} onPause={pause} onCancel={cancel} />

                <Container layout="flex" gap="xs" padding="none" align="center">
                    {TABS.map((option) => (
                        <Button
                            key={option.id}
                            size="sm"
                            color={tab === option.id ? 'primary' : 'secondary'}
                            selected={tab === option.id}
                            onClick={() => setTab(option.id)}
                            {...guide.tip(`models.${option.id}`)}
                        >
                            {option.label}{option.id === 'installed' && counts.installed !== null ? ` (${counts.installed})` : ''}
                        </Button>
                    ))}
                </Container>

            </Container>
            <Container layout="flex" justify="center" padding="none" width="100%" flexFill minHeight="0" overflow="auto">
            <Container layout="flex-column" gap="md" padding="lg" width="100%" maxWidth="1360px" wrap={false}>
                {tab === 'online' && <OnlineTab />}
                {tab !== 'online' && devices?.length === 0 && (
                    <Empty icon="FiMonitor" title="No device is connected to your account" text="Open the Devices page to add a computer. Its models are then managed here." />
                )}
                {tab !== 'online' && device && !device.online && (
                    <Empty icon="FiMonitor" title={`${device.name} is offline`} text="Open the Mollama desktop app on that computer to see and manage its models." />
                )}
                {tab !== 'online' && device?.online && device.paused && (
                    <Empty icon="FiPause" title={`${device.name} is paused`} text="Resume it on the Devices page to see and manage its models." />
                )}
                {device?.online && tab === 'discover' && (
                    <DiscoverTab
                        catalogue={catalogue}
                        recommended={recommended}
                        jobs={jobs}
                        canManage={canManage}
                        ollamaUp={ollamaUp}
                        onDownload={download}
                        loading={catalogueLoading}
                        find={find}
                        onFind={(changes) => device && loadCatalogue(device.id, changes)}
                        onSort={(sort) => {
                            try { localStorage.setItem('mollama-models-sort', sort); } catch { /* kept for this visit only */ }
                            if (device) loadCatalogue(device.id, { sort });
                        }}
                        onPage={(page, size) => {
                            try { localStorage.setItem('mollama-models-per-page', String(size)); } catch { /* kept for this visit only */ }
                            if (device) loadCatalogue(device.id, { page, size });
                        }}
                    />
                )}
                {device?.online && tab === 'installed' && <InstalledTab installed={installed} canManage={canManage} onDelete={deleteModel} elsewhere={elsewhere} />}
                {device?.online && tab === 'running' && <RunningTab running={running} canManage={canManage} onUnload={unload} />}
                {device?.online && tab === 'mine' && (
                    <MineTab installed={installed} canManage={canManage} onCreated={refresh} onDelete={deleteModel} />
                )}
            </Container>
            </Container>
            </Container>
        </Page>
    );
};

export default ModelsPage;
