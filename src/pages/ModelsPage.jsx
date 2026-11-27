import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Page, Container, Card, Typography, Button, ButtonGroup, Badge, Icon, Input, Switch, Divider, ProgressBar, CircularProgress, Pagination, Data } from '@components/Components';
import { useNotification } from '@contexts/NotificationContext';
import { chatService, deviceService, modelService, providerService, trainingService, describeError, useGuide, onReturn } from '../client/ai.client';

const MEMORY_EVERY_MS = 4000;
const STATE_BADGES = { answering: ['Answering', 'success'], waiting: ['Waiting its turn', 'tertiary'], loading: ['Loading', 'warning'], idle: ['Idle', 'default'] };
const ROLE_BADGES = { main: 'Primary computer', lend: 'Secondary computer' };
const sizeText = (mb) => (mb >= 1000 ? `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB` : `${Math.round(mb)} MB`);
const spanText = (ms) => {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};
const clockText = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// What a model is doing, in one line.
const activityText = (model, now) => {
    if (model.state === 'loading') return model.source === 'pool' ? 'Being loaded across the pool. This can take a few minutes.' : 'Being loaded into memory.';
    const chat = model.chat ? `“${model.chat.title}”` : 'a chat';
    if (model.state === 'waiting') return `A reply in ${chat} is waiting its turn.`;
    if (model.state === 'answering') {
        const words = model.progress?.words || 0;
        return `${words > 0 ? `${words.toLocaleString()} words written in` : model.progress?.phase === 'thinking' ? 'Thinking in' : model.progress?.phase === 'searching' || model.progress?.phase === 'reading' ? 'Using the web in' : 'Reading the message in'} ${chat}${model.replies > 1 ? `, and ${model.replies - 1} more` : ''}.`;
    }
    const idle = model.usedAt ? `Idle for ${spanText(now - model.usedAt)}, last used at ${clockText(model.usedAt)}` : 'Idle';
    return model.endsAt && model.endsAt > now ? `${idle}. Leaves memory in ${spanText(model.endsAt - now)}.` : `${idle}.`;
};
const placeText = (model) => {
    const parts = [];
    if (model.gpuMb > 0) parts.push(`${sizeText(model.gpuMb)} graphics memory`);
    if (model.ramMb > 0) parts.push(`${sizeText(model.ramMb)} system memory`);
    if (parts.length === 0 && model.sizeMb) parts.push(model.source === 'pool' ? `${sizeText(model.sizeMb)} model file` : sizeText(model.sizeMb));
    if (model.source === 'online') parts.push(`runs on ${model.service}'s computers, and ${model.service} does not say how much memory it takes`);
    if (model.source === 'pool') parts.push(model.helpers.length ? `pooled with ${model.helpers.join(', ')}` : 'pooled');
    if (model.context && !model.use) parts.push(`${model.context.toLocaleString()} tokens of context`);
    return parts.join(' · ');
};

// What takes up a model's context, in the order it is read.
const CONTEXT_PARTS = [
    ['instructions', 'Instructions and skills', 'The skills and instructions sent with every message.'],
    ['functions', 'Functions it can call', 'What each function is and how to call it.'],
    ['conversation', 'Conversation', 'Your messages and the earlier replies, or the memory that replaced them.'],
    ['pages', 'Pages it opened', 'Skill pages, skill files and component pages opened in this reply.'],
    ['results', 'Results it read', 'What tools, searches, files and programs gave back in this reply.'],
    ['calls', 'Calls it wrote', 'Programs and other calls the model wrote in this reply.'],
    ['reply', 'The reply so far', 'What it has written to you in this reply, and what Mollama told it on the way.'],
    ['writing', 'Being written now', 'What it has thought and written in this step.']
];
// How much of its context a model is using, and on what.
const ContextUse = ({ model, now }) => {
    const { use } = model;
    const [label, color] = STATE_BADGES[model.state] || STATE_BADGES.idle;
    const head = (
        <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
            <Typography as="h3" size="xs" weight="semibold">{model.displayName}</Typography>
            <Badge size="xxs" color={color}>{label}</Badge>
            <Typography size="xxs" color="muted">{model.where}</Typography>
        </Container>
    );
    if (!use) {
        return (
            <Container layout="flex-column" gap="xs" padding="none" width="100%" minWidth="0">
                {head}
                <Typography as="p" size="xxs" color="muted">{model.state === 'loading' ? activityText(model, now) : 'Its use of context shows once it has answered a message.'}</Typography>
            </Container>
        );
    }
    const parts = CONTEXT_PARTS.filter(([id]) => use.parts[id] > 0);
    const notes = [
        use.now && `${use.keptFree.toLocaleString()} tokens are kept free for what it writes.`,
        use.room < use.total && `${use.room.toLocaleString()} are set aside in memory now, and more when it needs them.`,
        use.putAway > 0 && `${use.putAway === 1 ? '1 earlier result was' : `${use.putAway} earlier results were`} put away to save room.`
    ].filter(Boolean).join(' ');
    return (
        <Container layout="flex-column" gap="xs" padding="none" width="100%" minWidth="0">
            {head}
            <Container layout="flex" wrap={false} align="center" justify="between" gap="xs" padding="none" width="100%">
                <Typography size="xxs" color="muted">{use.now ? `Step ${use.steps} of its reply${model.chat ? ` in “${model.chat.title}”` : ''}` : `At the end of its last reply${use.chat ? `, in “${use.chat.title}”` : ''}`}</Typography>
                <Typography size="xxs">{`${use.left.toLocaleString()} free of ${use.total.toLocaleString()} tokens`}</Typography>
            </Container>
            <ProgressBar size="xs" width="100%" value={use.percent} color={use.percent >= 90 ? 'error' : use.percent >= 75 ? 'warning' : 'primary'} aria-label={`Context: ${use.percent}% used`} />
            {parts.map(([id, label, title]) => (
                <Container key={id} layout="flex" wrap={false} align="center" gap="sm" padding="none" width="100%" title={title}>
                    <Container padding="none" width="140px" minWidth="140px"><Typography size="xxs">{label}</Typography></Container>
                    <Container padding="none" flexFill minWidth="0"><ProgressBar size="xs" width="100%" value={use.parts[id]} max={use.total} color="primary" aria-label={`${label}: ${use.parts[id].toLocaleString()} tokens`} /></Container>
                    <Container padding="none" width="52px" minWidth="52px"><Typography size="xxs" align="right">{use.parts[id].toLocaleString()}</Typography></Container>
                </Container>
            ))}
            {notes && <Typography as="p" size="xxs" color="muted">{notes}</Typography>}
        </Container>
    );
};

// One model in memory: what it is, what it takes, what it is doing, and the way to remove it.
export const MemoryRow = ({ model, now, where = null, busy = false, onRemove }) => {
    const [label, color] = STATE_BADGES[model.state] || STATE_BADGES.idle;
    const working = model.state === 'answering' || model.state === 'waiting';
    return (
        <Container layout="flex" wrap={false} align="start" justify="between" gap="sm" padding="none" width="100%">
            <Container layout="flex-column" gap="none" padding="none" flexFill minWidth="0">
                <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
                    <Typography as="span" size="xs" weight="semibold">{model.displayName}</Typography>
                    <Badge size="xxs" color={color}>{label}</Badge>
                    {model.source === 'pool' && <Badge size="xxs" color="tertiary">Pool</Badge>}
                </Container>
                <Typography as="p" size="xxs">{activityText(model, now)}</Typography>
                <Typography as="p" size="xxs" color="muted">{[where, model.name, placeText(model)].filter(Boolean).join(' · ')}</Typography>
            </Container>
            {(model.source !== 'online' || working) && <Button
                size="xs"
                variant="ghost"
                color={working ? 'error' : 'primary'}
                disabled={busy || model.state === 'loading' && model.source !== 'pool'}
                title={model.source === 'online' ? 'Stops the reply it is writing' : working ? 'Stops the reply it is writing, then removes the model from memory' : 'Removes the model from memory. It loads again when a chat uses it.'}
                onClick={() => onRemove(model, working)}
            >
                {model.source === 'online' ? busy ? 'Stopping…' : 'Stop' : busy ? 'Removing…' : working ? 'Stop and remove' : 'Remove'}
            </Button>}
        </Container>
    );
};

const MemoryMeter = ({ label, totalMb, freeMb }) => {
    if (!totalMb) return null;
    const known = freeMb !== null && freeMb !== undefined;
    const used = known ? Math.max(0, totalMb - freeMb) : 0;
    const percent = known ? Math.round((used / totalMb) * 100) : 0;
    return (
        <Container layout="flex-column" gap="xs" padding="none" flexFill minWidth="180px">
            <Container layout="flex" wrap={false} align="center" justify="between" gap="xs" padding="none" width="100%">
                <Typography size="xxs" color="muted">{label}</Typography>
                <Typography size="xxs">{known ? `${sizeText(freeMb)} free of ${sizeText(totalMb)}` : `${sizeText(totalMb)} in all`}</Typography>
            </Container>
            {known && <ProgressBar size="xs" width="100%" value={percent} color={percent >= 90 ? 'error' : percent >= 75 ? 'warning' : 'primary'} aria-label={`${label}: ${percent}% used`} />}
        </Container>
    );
};

// What is in memory on each of the person's computers, kept up to date while it is on screen. With `only`, one computer.
export const MemoryManager = ({ only = null }) => {
    const { success, error: notifyError } = useNotification();
    const [state, setState] = useState(null);
    const [failed, setFailed] = useState(null);
    const [busy, setBusy] = useState([]);
    const [view, setView] = useState('memory');
    const [now, setNow] = useState(() => Date.now());
    const ask = useRef(0);

    const load = useCallback(async () => {
        const turn = ++ask.current;
        try {
            const result = await deviceService.memory();
            if (turn !== ask.current) return;
            // The computers' clocks and this one may differ, so times are kept against the server's.
            setState({ ...result, ahead: result.at - Date.now() });
            setFailed(null);
        } catch (error) {
            // A server without this yet takes the address for a computer's id, or knows no such page.
            const older = [400, 404].includes(error?.response?.status);
            if (turn === ask.current) setFailed(older ? 'The server does not have the memory view yet. It works once the server is updated.' : describeError(error, 'What is in memory could not be read.'));
        }
    }, []);

    useEffect(() => {
        load();
        const poll = setInterval(load, MEMORY_EVERY_MS);
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => {
            clearInterval(poll);
            clearInterval(tick);
            ask.current += 1;
        };
    }, [load]);

    const keyOf = (computer, model) => `${computer.id} ${model.source} ${model.name}`;
    const remove = async (computer, model, stop) => {
        const key = keyOf(computer, model);
        setBusy((list) => [...list, key]);
        try {
            if (model.source === 'online') {
                await chatService.stop(model.chat.id);
                return;
            }
            const result = await deviceService.freeMemory(computer.id, model.name, { ...(model.source === 'pool' ? { pooled: true } : {}), ...(stop ? { stop: true } : {}) });
            if (result.removed) success(`${model.displayName} was removed from memory on ${computer.name}.`);
            else notifyError(`${model.displayName} is still in memory on ${computer.name}. Try again in a moment.`);
        } catch (error) {
            notifyError(describeError(error, model.source === 'online' ? 'The reply could not be stopped.' : 'The model could not be removed.'));
        } finally {
            setBusy((list) => list.filter((one) => one !== key));
            load();
        }
    };

    if (!state) return failed ? <Typography size="xs" color="error">{failed}</Typography> : <Loading text="Checking what is in memory…" />;
    const at = now + state.ahead;
    const computers = state.computers.filter((one) => !only || one.id === only);
    const services = only ? [] : (state.online || []).map((service) => ({ ...service, models: service.models.map((model) => ({ ...model, service: service.name })) }));
    const inUse = [...computers, ...services].flatMap((one) => one.models.map((model) => ({ ...model, where: model.source === 'pool' ? `Pool, on ${one.name}` : one.name, key: keyOf(one, model) })));
    const idle = computers.flatMap((computer) => computer.models.filter((model) => model.state === 'idle').map((model) => ({ computer, model })));
    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%" minWidth="0">
            <ButtonGroup size="xs" justify="start" selectable={false}>
                <Button size="xs" selected={view === 'memory'} onClick={() => setView('memory')}>Memory</Button>
                <Button size="xs" selected={view === 'context'} onClick={() => setView('context')}>Context</Button>
            </ButtonGroup>
            {failed && <Typography size="xxs" color="warning">{`${failed} Showing what was last read.`}</Typography>}
            {view === 'context' && (
                <>
                    <Typography as="p" size="xxs" color="muted">How much of what it can read at once each model is using, and on what. Estimates, set right by the model's own count.</Typography>
                    {inUse.length === 0 && <Typography as="p" size="xs" color="muted">No model is in use.</Typography>}
                    {inUse.map((model, index) => (
                        <Fragment key={model.key}>
                            {index > 0 && <Divider />}
                            <ContextUse model={model} now={at} />
                        </Fragment>
                    ))}
                </>
            )}
            {view === 'memory' && <>
            {computers.length === 0 && <Typography size="xs" color="muted">No computer is linked yet. Add one on the Devices page.</Typography>}
            {computers.map((computer, index) => (
                <Fragment key={computer.id}>
                    {index > 0 && <Divider />}
                    <Container layout="flex-column" gap="sm" padding="none" width="100%" minWidth="0">
                        <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
                            <Icon name="FiMonitor" size="xs" />
                            <Typography as="h3" size="sm" weight="semibold">{computer.name}</Typography>
                            {!computer.online && <Badge size="xxs">Offline</Badge>}
                            {computer.paused && <Badge size="xxs" color="warning">Paused</Badge>}
                            {ROLE_BADGES[computer.role] && <Badge size="xxs" color="tertiary">{ROLE_BADGES[computer.role]}</Badge>}
                        </Container>
                        {computer.online && !computer.paused && (
                            <>
                                <Container layout="flex" align="start" gap="md" padding="none" width="100%">
                                    {computer.gpuShared
                                        ? <MemoryMeter label="Memory, shared with graphics" totalMb={computer.memory.totalMb} freeMb={computer.memory.freeMb} />
                                        : (
                                            <>
                                                <MemoryMeter label={computer.gpuName || 'Graphics memory'} totalMb={computer.memory.gpuTotalMb} freeMb={computer.memory.gpuFreeMb} />
                                                <MemoryMeter label="System memory" totalMb={computer.memory.totalMb} freeMb={computer.memory.freeMb} />
                                            </>
                                        )}
                                </Container>
                                {computer.lending && <Typography as="p" size="xxs" color="muted">{`Lending memory to ${computer.lending.main}, which is running ${computer.lending.displayName}.`}</Typography>}
                                {!computer.answered && <Typography as="p" size="xxs" color="warning">Ollama did not answer here, so its models cannot be listed right now.</Typography>}
                                {computer.answered && computer.models.length === 0 && <Typography as="p" size="xs" color="muted">No model is in memory.</Typography>}
                                {computer.models.map((model) => (
                                    <MemoryRow key={keyOf(computer, model)} model={model} now={at} busy={busy.includes(keyOf(computer, model))} onRemove={(one, stop) => remove(computer, one, stop)} />
                                ))}
                            </>
                        )}
                    </Container>
                </Fragment>
            ))}
            {services.map((service) => (
                <Fragment key={service.id}>
                    <Divider />
                    <Container layout="flex-column" gap="sm" padding="none" width="100%" minWidth="0">
                        <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
                            <Icon name="FiCloud" size="xs" />
                            <Typography as="h3" size="sm" weight="semibold">{service.name}</Typography>
                            <Badge size="xxs" color="tertiary">Online</Badge>
                        </Container>
                        {service.models.map((model) => <MemoryRow key={keyOf(service, model)} model={model} now={at} busy={busy.includes(keyOf(service, model))} onRemove={(one, stop) => remove(service, one, stop)} />)}
                    </Container>
                </Fragment>
            ))}
            <Divider />
            <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                <Typography as="p" size="xxs" color="muted">{`An idle model leaves memory after ${state.keepAliveMinutes === 0 ? 'its reply' : `${state.keepAliveMinutes} min`}, a pooled one after ${state.poolIdleMinutes} min.`}</Typography>
                {idle.length > 1 && <Button size="xs" onClick={() => idle.forEach(({ computer, model }) => remove(computer, model, false))}>{`Remove all ${idle.length} idle`}</Button>}
            </Container>
            </>}
        </Container>
    );
};

const TABS = [
    { id: 'discover', label: 'Downloadable', icon: 'FiDownloadCloud', about: 'Models you can download onto this computer' },
    { id: 'installed', label: 'Installed', icon: 'FiHardDrive', about: 'The models already on this computer' },
    { id: 'train', label: 'Train', icon: 'FiTrendingUp', about: 'Teach a model on this computer' },
    { id: 'online', label: 'Online', icon: 'FiGlobe', about: 'Models that run online: cloud models and your own keys' }
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
        {model.fit?.place && <Typography as="p" size="xxs" color="muted" title={PLACE_NOTE}>This computer: {placeWords(model.fit.place)}</Typography>}
        {model.pooled?.place && <Typography as="p" size="xxs" color="muted" title={`${PLACE_NOTE} Graphics memory is every pooled computer's together; system memory is the primary computer's.`}>Pooled ({model.pooled.names}): {placeWords(model.pooled.place)}</Typography>}
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


const Row = ({ children }) => (
    <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%" wrap={false}>{children}</Container>
);

const Stat = ({ label, value, note }) => (
    <Container layout="flex-column" gap="none" padding="none" minWidth="0">
        <Typography as="p" size="sm" color="muted">{label}</Typography>
        <Typography as="p" size="lg" weight="semibold">{value}</Typography>
        {note && <Typography as="p" size="xs" color="muted">{note}</Typography>}
    </Container>
);

const SectionTitle = ({ title, count, children }) => (
    <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%">
        <Container layout="flex" align="baseline" gap="sm" padding="none" wrap={false}>
            <Typography as="h2" size="md" weight="semibold" font="secondary">{title}</Typography>
            {count !== undefined && <Typography as="p" size="xs" color="muted">{count}</Typography>}
        </Container>
        {children}
    </Container>
);

const Loading = ({ text }) => (
    <Container layout="flex" align="center" gap="sm" padding="none" width="100%" wrap={false}>
        <CircularProgress size="xs" />
        <Typography as="p" size="xs" color="muted">{text}</Typography>
    </Container>
);

const Empty = ({ icon, title, text, children }) => (
    <Card layout="flex" align="center" justify="between" gap="md" padding="lg" width="100%">
        <Container layout="flex" align="center" gap="md" padding="none" wrap={false} minWidth="0">
            <Icon name={icon} size="sm" color="primary" />
            <Container layout="flex-column" gap="xs" padding="none" minWidth="0">
                <Typography as="h3" size="sm" weight="semibold">{title}</Typography>
                <Typography as="p" size="xs">{text}</Typography>
            </Container>
        </Container>
        {children}
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
        <Container as="section" layout="flex-column" gap="md" padding="none" width="100%">
            <SectionTitle title="Downloads" count={open.length}>
                <Typography as="p" size="xxs" color="muted">They carry on if you close this page.</Typography>
            </SectionTitle>
            <Card layout="flex-column" gap="lg" padding="lg" width="100%" wrap={false}>
                {open.map((job, index) => (
                    <Fragment key={job.id}>
                        {index > 0 && <Divider />}
                        <Container layout="flex-column" gap="sm" padding="none" width="100%" minWidth="0">
                            <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                                <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                                    <Typography as="h3" size="sm" weight="semibold" font="monospace">{job.model}</Typography>
                                    <Typography as="p" size="xs">
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
                                </Container>
                                {canManage && (
                                    <Container layout="flex" align="center" gap="xs" padding="none">
                                        {job.status === 'downloading' && (
                                            <Button size="sm" onClick={() => onPause(job)}>Pause</Button>
                                        )}
                                        {(job.status === 'paused' || (job.status === 'failed' && RESUMABLE.includes(job.error?.code))) && (
                                            <Button size="sm" onClick={() => onResume(job)}>Resume</Button>
                                        )}
                                        <Button size="sm" variant="ghost" onClick={() => onCancel(job)}>
                                            {job.status === 'failed' ? 'Remove from list' : 'Cancel'}
                                        </Button>
                                    </Container>
                                )}
                            </Container>
                            <ProgressBar
                                value={job.percent}
                                size="sm"
                                color={job.status === 'failed' ? 'error' : job.status === 'paused' || job.stalled ? 'warning' : 'primary'}
                                animated={job.status === 'downloading' && !job.stalled}
                                width="100%"
                            />
                            {job.stalled && (
                                <Typography as="p" size="xs" color="warning">
                                    No data is arriving. Check the internet connection. The download carries on by itself when
                                    the connection is back, or you can pause it.
                                </Typography>
                            )}
                            {job.error && <Typography as="p" size="xs" color="error">{job.error.message} {job.error.action}</Typography>}
                        </Container>
                    </Fragment>
                ))}
            </Card>
        </Container>
    );
};

// Models that run on another company's computers with the person's own key. Ollama comes first, because it runs the
// models from the same library that are too large to download; the other services follow.
// Training: a person teaches a model on one of their own computers. The tab lists every model downloaded on the chosen
// computer with whether it can be trained there and, if not, exactly why; any other model can be brought in by its name
// on Hugging Face. The desktop app on that computer does the work, and the result becomes one of its models.
const TRAIN_LIVE = ['queued', 'setting-up', 'scoring', 'training', 'saving'];
const TRAIN_STATUS = { queued: ['Waiting', 'default'], 'setting-up': ['Setting up', 'primary'], scoring: ['Asking the model', 'primary'], training: ['Training', 'primary'], saving: ['Saving', 'primary'], done: ['Trained', 'success'], failed: ['Failed', 'error'], stopped: ['Stopped', 'default'] };
const TRAIN_VERDICTS = {
    ready: ['Can be trained here', 'success'], card: ['Needs a larger graphics card', 'warning'], memory: ['Needs more memory', 'warning'], place: ['This computer is not ready', 'warning'],
    terms: ['Its makers ask for a sign-up first', 'default'], kind: ['Not supported yet', 'default'], origin: ['Original not found', 'default'], other: ['Cannot be trained', 'default']
};
const TRAIN_EXAMPLE = 'What should you do when you are not sure of an answer?\nSay that I am not sure, and ask one question that would settle it.\n\nHow long should your answers be?\nAs short as they can be while still answering fully.';
const spanOf = (seconds) => (seconds >= 90 ? `${Math.round(seconds / 60)} min` : `${seconds} s`);
const TRAIN_HELD = { '4bit': '4 bits', '8bit': '8 bits', none: 'full precision' };
// How many lessons the box holds and how long the longest is: what the run's own numbers are worked out from.
const lessonShape = (text) => {
    const rows = /^\s*\{/.test(text) ? text.split('\n').filter((line) => line.trim().startsWith('{')) : text.split(/\n\s*\n/).filter((block) => block.trim());
    return { count: rows.length, longest: rows.reduce((most, row) => Math.max(most, row.length), 0) };
};
// A run's main settings in one line.
const runLine = (set) => `Adapter of size ${set.r}${set.alpha !== set.r ? ` (strength ${set.alpha})` : ''}${set.parts === 'all' ? ' on every layer' : ''}, held at ${TRAIN_HELD[set.quantization] || set.quantization} · ${set.epochs} ${set.epochs === 1 ? 'pass' : 'passes'} · ${set.batch} ${set.batch === 1 ? 'lesson' : 'lessons'} per step${set.accumulate > 1 ? `, ${set.accumulate} steps added up` : ''} · step size ${set.lr}${set.seed !== undefined ? ` · seed ${set.seed}` : ''}`;
// One setting of a run: its name, where its value came from, what it does in plain words, and its control.
const TrainSetting = ({ one, value, mine, fitted, locked, onChange, onReset }) => {
    const [text, setText] = useState(String(value));
    useEffect(() => { setText((now) => (now.trim() !== '' && Number(now) === value ? now : String(value))); }, [value]);
    const fits = (number) => Number.isFinite(number) && number >= one.min && number <= one.max && (!one.whole || Number.isInteger(number));
    const bad = one.type === 'number' && text.trim() !== '' && !fits(Number(text));
    const type = (event) => {
        const raw = event?.target ? event.target.value : String(event ?? '');
        setText(raw);
        if (raw.trim() !== '' && fits(Number(raw)) && Number(raw) !== value) onChange(Number(raw));
    };
    const where = mine ? 'You set this' : fitted ? 'Chosen to fit this graphics card' : one.from === 'kind' ? 'From what you are teaching' : one.from === 'lessons' ? 'Worked out from your lessons' : 'The usual value';
    return (
        <Container layout="flex-wrap" align="start" justify="between" gap="sm" padding="none" width="100%">
            <Container layout="flex-column" gap="xs" padding="none" minWidth="14rem" flexFill>
                <Container layout="flex-wrap" align="center" gap="xs" padding="none">
                    <Typography size="xs" weight="semibold">{one.label}</Typography>
                    <Badge size="xs" color={mine ? 'primary' : fitted ? 'tertiary' : 'default'}>{where}</Badge>
                </Container>
                <Typography as="p" size="xxs" color="muted">{one.about}</Typography>
            </Container>
            <Container layout="flex-column" align="end" gap="xs" padding="none" minWidth="9rem">
                {one.type === 'switch' && <Switch size="sm" checked={value === true} disabled={locked} aria-label={one.label} onChange={(next) => onChange(typeof next === 'boolean' ? next : Boolean(next?.target?.checked))} />}
                {one.type === 'choice' && (
                    <ButtonGroup size="xs" justify="end" selectable={false}>
                        {one.options.map(([id, label]) => <Button key={id} size="xs" selected={value === id} disabled={locked} onClick={() => onChange(id)}>{label}</Button>)}
                    </ButtonGroup>
                )}
                {one.type === 'number' && (
                    <Input type="number" size="xs" width="9rem" value={text} disabled={locked} aria-label={one.label} validationState={bad ? 'error' : 'default'} helpText={bad ? `${one.whole ? 'A whole number from' : 'From'} ${one.min} to ${one.max}` : ''} onChange={type} onBlur={() => { if (text.trim() === '' || bad) setText(String(value)); }} />
                )}
                {one.type === 'number' && one.picks && (
                    <ButtonGroup size="xs" justify="end" selectable={false}>
                        {one.picks.map(([pick, label]) => <Button key={label} size="xs" selected={value === pick} disabled={locked} onClick={() => onChange(pick)}>{label}</Button>)}
                    </ButtonGroup>
                )}
                {mine && !locked && <Button size="xs" variant="ghost" onClick={onReset}>Back to the usual</Button>}
            </Container>
        </Container>
    );
};
export const TrainTab = ({ device }) => {
    const { success, error: notifyError, confirm } = useNotification();
    const [runs, setRuns] = useState(null);
    const [listed, setListed] = useState(null);
    const [chosen, setChosen] = useState(null);
    const [other, setOther] = useState('');
    const [form, setForm] = useState({ kind: 'habits', name: '', lessons: '' });
    const [fit, setFit] = useState(null);
    const [busy, setBusy] = useState(false);
    const [changed, setChanged] = useState({});
    const [open, setOpen] = useState(false);
    const [plan, setPlan] = useState(null);
    const [planProblem, setPlanProblem] = useState(null);

    const loadRuns = useCallback(() => trainingService.list().then(setRuns).catch((error) => { setRuns((current) => current || { kinds: [], groups: [], settings: [], trainings: [], limits: {} }); notifyError(describeError(error, 'Your trainings could not be loaded.')); }), []);
    const loadModels = useCallback(() => trainingService.models(device.id, 'habits').then(setListed).catch((error) => { setListed({ computer: { name: device.name, ready: false, reason: null }, models: [] }); notifyError(describeError(error, 'This computer\'s models could not be read.')); }), [device.id]);
    useEffect(() => { loadRuns(); }, [loadRuns]);
    useEffect(() => { setListed(null); setChosen(null); loadModels(); }, [loadModels]);
    const live = (runs?.trainings || []).some((one) => TRAIN_LIVE.includes(one.status));
    useEffect(() => {
        if (!live) return undefined;
        const timer = setInterval(loadRuns, 3000);
        return () => clearInterval(timer);
    }, [live, loadRuns]);
    // What the model being looked at would take of this computer: the chosen one, or the one being typed.
    const looking = chosen?.source || other.trim();
    useEffect(() => {
        setFit(null);
        if (chosen || !/^(https?:\/\/huggingface\.co\/)?[\w.-]+\/[\w.-]+\/?$/i.test(looking)) return undefined;
        let current = true;
        const timer = setTimeout(() => trainingService.check(device.id, looking, form.kind).then((found) => { if (current) setFit(found); }).catch(() => {}), 600);
        return () => { current = false; clearTimeout(timer); };
    }, [device.id, looking, form.kind, Boolean(chosen)]);
    // The run as it would be right now: every setting's value, how often the adapter is changed, and whether it fits.
    const shape = useMemo(() => lessonShape(form.lessons), [form.lessons]);
    useEffect(() => {
        if (!chosen) { setPlan(null); setPlanProblem(null); return undefined; }
        let current = true;
        const timer = setTimeout(() => trainingService.plan({ device: device.id, base: chosen.source, kind: form.kind, ...shape, settings: changed })
            .then((found) => { if (current) { setPlan(found); setPlanProblem(null); } })
            .catch((error) => { if (current) setPlanProblem(describeError(error, 'This run could not be worked out.')); }), 300);
        return () => { current = false; clearTimeout(timer); };
    }, [device.id, chosen?.source, form.kind, shape.count, shape.longest, changed]);

    if (runs === null || listed === null) return <Loading text="Reading this computer's models…" />;
    const kind = runs.kinds.find((one) => one.id === form.kind) || null;
    const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value?.target ? value.target.value : value }));
    const pick = (source, label) => {
        setChosen({ source, label });
        setForm((current) => ({ ...current, name: current.name || `my-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)}` }));
    };
    const start = async () => {
        setBusy(true);
        try {
            const { unread } = await trainingService.start({ device: device.id, base: chosen.source, ...form, ...(mine > 0 ? { settings: changed } : {}) });
            success(`Training has started on ${device.name}.${unread ? ` ${unread} ${unread === 1 ? 'lesson' : 'lessons'} could not be read and ${unread === 1 ? 'was' : 'were'} left out.` : ''}`);
            setChosen(null);
            setForm((current) => ({ ...current, name: '', lessons: '' }));
            await loadRuns();
        } catch (error) {
            notifyError(describeError(error, 'The training could not be started.'));
        }
        setBusy(false);
    };
    const stop = async (job) => {
        if (!await confirm(`Stop training ${job.name}? What it has learned so far is thrown away.`, { confirmLabel: 'Stop', color: 'error' })) return;
        await trainingService.stop(job.id).catch((error) => notifyError(describeError(error, 'The training could not be stopped.')));
        loadRuns();
    };
    const remove = async (job) => {
        await trainingService.remove(job.id).catch((error) => notifyError(describeError(error, 'This could not be removed from the list.')));
        loadRuns();
    };
    const gained = (job, key, of) => (job.after ? `${job.before ? `${job.before[key]} → ` : ''}${job.after[key]} of ${job.after[of]}` : job.before ? `${job.before[key]} of ${job.before[of]} before training` : null);
    const words = shape.count;
    const mine = Object.keys(changed).length;

    return (
        <>
            <Card layout="flex-column" gap="sm" padding="lg" width="100%" wrap={false}>
                <Typography as="h3" size="sm" weight="semibold">Teach a model your own lessons</Typography>
                <Typography as="p" size="xs" color="muted">1. Pick a model below, or bring another one in. 2. Give it lessons: a question and the answer you want, many times over. 3. {device.name} trains it on its own graphics card and adds the result to its models, ready to pick in a chat. Nothing is sent anywhere else.</Typography>
                {listed.computer.reason && <Typography as="p" size="xs" color={listed.computer.ready ? 'muted' : 'warning'}>{listed.computer.reason}</Typography>}
            </Card>

            {chosen && (
                <Card layout="flex-column" gap="md" padding="lg" width="100%" wrap={false}>
                    <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                        <Typography as="h3" size="sm" weight="semibold">Teach {chosen.label}</Typography>
                        <Button size="xs" variant="ghost" onClick={() => setChosen(null)}>Choose another model</Button>
                    </Container>
                    <Container layout="flex-column" gap="xs" padding="none" width="100%">
                        <Typography size="sm" weight="semibold">What to teach</Typography>
                        <ButtonGroup size="sm" justify="start" selectable={false}>
                            {runs.kinds.map((one) => <Button key={one.id} size="sm" selected={form.kind === one.id} onClick={() => set('kind')(one.id)}>{one.label}</Button>)}
                        </ButtonGroup>
                        {kind && <Typography as="p" size="xs" color="muted">{kind.about}</Typography>}
                        {plan?.base && <Typography as="p" size="xs" color="muted">{(plan.base.parameters / 1e9).toFixed(1)}B parameters · {gb(plan.needs.downloadMb)} downloaded to {device.name} the first time{plan.base.licence ? ` · licence ${plan.base.licence}` : ''}</Typography>}
                        {plan && !plan.fits && <Typography as="p" size="xs" color="warning">{plan.reason}</Typography>}
                    </Container>
                    <Container layout="flex-column" gap="xs" padding="none" width="100%">
                        <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                            <Typography size="sm" weight="semibold">How it will train</Typography>
                            <Container layout="flex" align="center" gap="xs" padding="none">
                                {mine > 0 && <Button size="xs" variant="ghost" onClick={() => setChanged({})}>Back to the usual settings</Button>}
                                <Button size="xs" variant="ghost" onClick={() => setOpen((now) => !now)}>{open ? 'Hide the settings' : mine > 0 ? `Settings (${mine} changed)` : 'See and change the settings'}</Button>
                            </Container>
                        </Container>
                        {plan && <Typography as="p" size="xs" color="muted">{runLine(plan.settings)}</Typography>}
                        {plan && (
                            <Typography as="p" size="xs" color="muted">
                                {shape.count > 0 ? `${shape.count} of your lessons` : 'Your lessons'}{plan.settings.ordinary > 0 ? ` and ${plan.settings.ordinary} everyday questions the model answers itself` : ''}{plan.updates !== null ? ` · the adapter is changed about ${plan.updates.toLocaleString()} times` : ''}{plan.needs ? ` · about ${gb(plan.needs.gpuMb)} on the graphics card` : ''}
                            </Typography>
                        )}
                        {planProblem && <Typography as="p" size="xs" color="error">{planProblem}</Typography>}
                        {(plan?.notes || []).map((note) => <Typography key={note} as="p" size="xs" color="warning">{note}</Typography>)}
                    </Container>
                    {open && plan && (
                        <Container layout="flex-column" gap="md" padding="none" width="100%">
                            <Typography as="p" size="xs" color="muted">These are the settings of Soup, the open-source trainer that {device.name} runs, in plain words. A value you leave alone is chosen for you: from what you are teaching, from your lessons, from what fits this graphics card, or the value that worked in our own tests. The settings Soup itself marks as not working yet are left out.</Typography>
                            {!plan.canChange && <Typography as="p" size="xs" color="warning">Changing a setting needs a newer Mollama desktop app on {device.name} (1.0.22 or later). Until it is updated, a run uses the values shown here.</Typography>}
                            {runs.groups.map((group) => (
                                <Fragment key={group.id}>
                                    <Divider />
                                    <Container layout="flex-column" gap="none" padding="none" width="100%">
                                        <Typography size="sm" weight="semibold">{group.label}</Typography>
                                        <Typography as="p" size="xs" color="muted">{group.about}</Typography>
                                    </Container>
                                    {runs.settings.filter((one) => one.group === group.id).map((one) => (
                                        <TrainSetting
                                            key={one.id}
                                            one={one}
                                            value={plan.settings[one.id]}
                                            mine={Object.hasOwn(changed, one.id)}
                                            fitted={(plan.fitted || []).includes(one.id)}
                                            locked={!plan.canChange}
                                            onChange={(value) => setChanged((now) => ({ ...now, [one.id]: value }))}
                                            onReset={() => setChanged(({ [one.id]: gone, ...rest }) => rest)}
                                        />
                                    ))}
                                </Fragment>
                            ))}
                            <Divider />
                        </Container>
                    )}
                    <Input
                        label="Lessons"
                        helpText={`A question, then its answer on the next line, and a blank line between lessons. At least ${runs.limits.least}. Ask each thing in several wordings: one lesson alone does not stick.${words ? ` ${words} so far.` : ''}`}
                        multiline
                        rows={8}
                        value={form.lessons}
                        onChange={set('lessons')}
                        width="100%"
                    />
                    {!form.lessons.trim() && (
                        <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                            <Typography as="p" size="xs" color="muted">Not sure how lessons look?</Typography>
                            <Button size="xs" variant="ghost" onClick={() => set('lessons')(TRAIN_EXAMPLE)}>Show me two</Button>
                        </Container>
                    )}
                    <Input label="Name for the trained model" helpText="Small letters, digits and hyphens. It appears under this name among this computer's models." value={form.name} onChange={set('name')} width="100%" />
                    <Container layout="flex" justify="end" padding="none" width="100%">
                        <Button size="sm" color="primary" disabled={busy || !plan?.fits || Boolean(planProblem) || !form.name.trim() || !form.lessons.trim()} onClick={start}>
                            <Icon name="FiPlay" size="xs" />Start training
                        </Button>
                    </Container>
                </Card>
            )}

            {!chosen && (
                <>
                    <SectionTitle title={`Models on ${device.name}`} count={listed.models.length} />
                    {listed.models.length === 0 && <Empty icon="FiBox" title="Nothing is downloaded on this computer yet" text="Download a model from the Downloadable tab, or bring one in below." />}
                    {listed.models.map((model) => {
                        const [label, color] = TRAIN_VERDICTS[model.state] || TRAIN_VERDICTS.other;
                        return (
                            <Card key={model.name} layout="flex-column" gap="xs" padding="md" width="100%" wrap={false}>
                                <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                                    <Container layout="flex" align="center" gap="sm" padding="none" minWidth="0">
                                        <Typography as="h3" size="sm" weight="semibold" truncate>{model.name}</Typography>
                                        <Badge size="xs" color={color}>{label}</Badge>
                                    </Container>
                                    {model.state === 'ready' && <Button size="xs" color="primary" onClick={() => pick(model.source, model.name.split(':')[0])}>Train this</Button>}
                                </Container>
                                <Typography as="p" size="xxs" color="muted">
                                    {gb(model.sizeMb)} on this computer{model.parameters ? ` · ${(model.parameters / 1e9).toFixed(1)}B parameters` : ''}{model.source ? ` · trained from its makers' original, ${model.source}` : ''}{model.state === 'ready' && model.needs ? ` (${gb(model.needs.downloadMb)} more to download)` : ''}
                                </Typography>
                                {model.reason && <Typography as="p" size="xs">{model.reason}</Typography>}
                                {model.state === 'card' && <Typography as="p" size="xs" color="muted">A rented graphics card with about {gb(model.cardMb)} would train it. Renting one for a run is coming to Mollama.</Typography>}
                            </Card>
                        );
                    })}

                    <Card layout="flex-column" gap="sm" padding="lg" width="100%" wrap={false}>
                        <Typography as="h3" size="sm" weight="semibold">Bring another model</Typography>
                        <Typography as="p" size="xs" color="muted">Any chat model published on Hugging Face in its makers' original form can be trained. Open its page there, copy its name (its maker, a slash and its name) or the page's address, and paste it here. It is downloaded to {device.name} when training starts.</Typography>
                        <Input label="Its name on Hugging Face" helpText="For example Qwen/Qwen2.5-7B-Instruct." value={other} onChange={(value) => setOther(value?.target ? value.target.value : value)} width="100%" />
                        {fit?.base && <Typography as="p" size="xs" color="muted">{fit.base.label}: {(fit.base.parameters / 1e9).toFixed(1)}B parameters · about {gb(fit.needs.gpuMb)} on the graphics card · {gb(fit.needs.downloadMb)} to download{fit.base.licence ? ` · licence ${fit.base.licence}` : ''}</Typography>}
                        {fit && !fit.fits && <Typography as="p" size="xs" color="warning">{fit.reason}</Typography>}
                        {fit && !fit.fits && fit.lacks === 'card' && <Typography as="p" size="xs" color="muted">A rented graphics card with about {gb(fit.needs.gpuMb)} would train it. Renting one for a run is coming to Mollama.</Typography>}
                        <Container layout="flex" justify="end" padding="none" width="100%">
                            <Button size="sm" color="primary" disabled={!fit?.fits} onClick={() => pick(fit.base.source, fit.base.label)}>Train this</Button>
                        </Container>
                    </Card>
                </>
            )}

            {runs.trainings.length > 0 && <SectionTitle title="Your trainings" count={runs.trainings.length} />}
            {runs.trainings.map((job) => {
                const [label, color] = TRAIN_STATUS[job.status] || [job.status, 'default'];
                const running = TRAIN_LIVE.includes(job.status);
                return (
                    <Card key={job.id} layout="flex-column" gap="sm" padding="lg" width="100%" wrap={false}>
                        <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                            <Container layout="flex" align="center" gap="sm" padding="none" minWidth="0">
                                <Typography as="h3" size="sm" weight="semibold" truncate>{job.name}</Typography>
                                <Badge size="xs" color={color}>{label}</Badge>
                            </Container>
                            {running
                                ? <Button size="xs" variant="ghost" color="error" onClick={() => stop(job)}>Stop</Button>
                                : <Button size="xs" variant="ghost" title="Remove from this list" aria-label={`Remove ${job.name} from this list`} onClick={() => remove(job)}><Icon name="FiX" size="xs" /></Button>}
                        </Container>
                        <Typography as="p" size="xxs" color="muted">
                            {String(job.base).split('/').pop()} · {job.kind === 'facts' ? 'Facts' : 'Habits'} · {job.lessons} lessons{job.seconds ? ` · ${spanOf(job.seconds)}` : ''}
                        </Typography>
                        {job.settings && <Typography as="p" size="xxs" color="muted">{runLine(job.settings)}</Typography>}
                        {running && (
                            <Container layout="flex-column" gap="xs" padding="none" width="100%">
                                <ProgressBar size="xs" width="100%" value={job.percent} color="primary" aria-label={`${job.name}: ${job.percent}% done`} />
                                <Typography as="p" size="xs" color="muted">{job.stage || 'Working'}</Typography>
                            </Container>
                        )}
                        {gained(job, 'recalled', 'of') && <Typography as="p" size="xs">Gives back its lessons, nearly word for word: {gained(job, 'recalled', 'of')} asked</Typography>}
                        {gained(job, 'kept', 'keptOf') && <Typography as="p" size="xs">Still knows what it knew: {gained(job, 'kept', 'keptOf')} asked</Typography>}
                        {job.status === 'done' && <Typography as="p" size="xs" color="muted">Pick {job.name} in a chat on that computer to use it. It is also under Installed.</Typography>}
                        {job.detail && job.status !== 'done' && <Typography as="p" size="xs" color={job.status === 'failed' ? 'error' : 'muted'}>{job.detail}</Typography>}
                    </Card>
                );
            })}
        </>
    );
};

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

    if (providers === null) return <Loading text="Loading your online services…" />;
    const cloud = providers.find((provider) => provider.cloud) || null;
    const keyed = providers.filter((provider) => !provider.cloud);
    const others = suggested.filter((entry) => !connected(entry.id));
    const perMillion = (dollars) => (dollars === null || dollars === undefined ? '' : `$${dollars.toFixed(dollars < 1 ? 3 : 2)}`);

    const keyForm = (entry) => (
        <Card layout="flex-column" gap="md" padding="lg" width="100%" maxWidth="720px" wrap={false}>
            <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                <Container layout="flex" align="center" gap="sm" padding="none" wrap={false} minWidth="0">
                    <Icon name={PROVIDER_ICONS[entry.id] || 'FiCloud'} size="sm" color="primary" />
                    <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                        <Typography as="h3" size="sm" weight="semibold">Getting a key for {entry.name}</Typography>
                        <Typography as="p" size="xxs" color="muted">{entry.key.cost}</Typography>
                    </Container>
                </Container>
                <Button size="sm" title="Opens in a new tab" onClick={() => window.open(entry.key.page, '_blank', 'noopener')}>
                    <Icon name="FiExternalLink" size="xs" />Open the key page
                </Button>
            </Container>
            <Container layout="flex-column" gap="xs" padding="none" width="100%">
                {entry.key.steps.map((step, index) => <Typography key={step} as="p" size="xs">{index + 1}. {step}</Typography>)}
            </Container>
            <Container layout="flex" align="end" gap="sm" padding="none" width="100%" wrap={false}>
                <Input size="sm" label="Key" type="password" value={key} onChange={(e) => setKey(e.target.value)} width="100%" />
                <Button size="sm" color="secondary" variant="solid" disabled={busy === entry.id || key.trim().length < 8} onClick={save}>
                    <Icon name="FiCheck" size="xs" />{busy === entry.id ? 'Checking…' : 'Connect'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setChosen(null); setKey(''); }}>Cancel</Button>
            </Container>
            <Typography as="p" size="xxs" color="muted">The key is stored sealed on Mollama&apos;s server and is never shown again. Chats on these models are sent to {entry.name} and billed to your account there.</Typography>
        </Card>
    );

    const connectedCard = (provider) => (
        <Card key={provider.id} layout="flex-column" gap="sm" padding="lg" width="100%" height="100%" minWidth="0" wrap={false}>
            <Row>
                <Container layout="flex" align="center" gap="sm" padding="none" wrap={false} minWidth="0">
                    <Icon name={PROVIDER_ICONS[provider.kind] || 'FiCloud'} size="sm" color="primary" />
                    <Typography as="h3" size="sm" weight="semibold">{provider.name}</Typography>
                </Container>
                <Badge size="xs" color={PROVIDER_COLORS[provider.health.state] || 'error'}>{provider.health.label}</Badge>
            </Row>
            <Typography as="p" size="xs">{provider.modelCount === 1 ? '1 model' : `${provider.modelCount} models`} in the model picker of every chat</Typography>
            {provider.health.needs.map((need) => <Typography key={need} as="p" size="xs">{need}</Typography>)}
            <Container padding="none" flexFill />
            <Container layout="flex" align="center" justify="end" gap="xs" padding="none" width="100%">
                <Button size="sm" variant="ghost" disabled={busy === provider.id} onClick={() => { setChosen(suggested.find((entry) => entry.id === provider.kind)); setKey(''); }}><Icon name="FiKey" size="xs" />Replace key</Button>
                <Button size="sm" disabled={busy === provider.id} onClick={() => check(provider)}><Icon name="FiRefreshCw" size="xs" />{busy === provider.id ? 'Checking…' : 'Check'}</Button>
                <Button size="sm" color="error" disabled={busy === provider.id} onClick={() => remove(provider)}><Icon name="FiTrash2" size="xs" />Remove</Button>
            </Container>
        </Card>
    );

    return (
        <Container layout="flex-column" gap="xl" padding="none" width="100%">
            {cloud && (
                <Container as="section" layout="flex-column" gap="md" padding="none" width="100%">
                    <SectionTitle title="Cloud" count={cloud.priced?.length ?? cloud.modelCount}>
                        <Badge size="xs" color={PROVIDER_COLORS[cloud.health.state] || 'error'}>{cloud.health.label}</Badge>
                    </SectionTitle>
                    <Typography as="p" size="xs" maxWidth="760px">
                        Large open models that run online, paid from your Mollama credit by what each reply reads and writes, with no key of your own. They are in the model picker of every chat; a reply stops when your credit runs low.
                    </Typography>
                    {cloud.health.needs.map((need) => <Typography key={need} as="p" size="xs" color="warning">{need}</Typography>)}
                    {cloud.priced?.length > 0 && (
                        <Data
                            data={cloud.priced.map((model) => ({ id: model.name, model: model.title || model.name, context: model.contextLength ? `${Math.round(model.contextLength / 1024)}K` : '', reads: perMillion(model.input), writes: perMillion(model.output), can: [model.tools ? 'Tools' : null, model.vision ? 'Pictures' : null].filter(Boolean).join(', ') }))}
                            size="xs"
                            exclude={['id']}
                            fieldConfig={{ model: { label: 'Model' }, context: { label: 'Reads up to' }, reads: { label: 'Reading, per million tokens' }, writes: { label: 'Writing, per million tokens' }, can: { label: 'Can use' } }}
                            sortable
                            flat
                            width="100%"
                        />
                    )}
                </Container>
            )}

            {keyed.length > 0 && (
                <Container as="section" layout="flex-column" gap="md" padding="none" width="100%">
                    <SectionTitle title="Connected" count={keyed.length} />
                    <Container layout="grid" columns={4} gap="md" padding="none" width="100%" align="stretch">
                        {keyed.map(connectedCard)}
                    </Container>
                </Container>
            )}

            {chosen && keyForm(chosen)}

            {others.length > 0 && (
                <Container as="section" layout="flex-column" gap="md" padding="none" width="100%">
                    <SectionTitle title="Other providers" />
                    <Container layout="grid" columns={4} gap="md" padding="none" width="100%" align="stretch">
                        {others.map((entry) => (
                            <Card key={entry.id} layout="flex-column" gap="sm" padding="lg" width="100%" height="100%" minWidth="0" wrap={false}>
                                <Container layout="flex" align="center" gap="sm" padding="none" width="100%" wrap={false} minWidth="0">
                                    <Icon name={PROVIDER_ICONS[entry.id] || 'FiCloud'} size="sm" color="primary" />
                                    <Typography as="h3" size="sm" weight="semibold">{entry.name}</Typography>
                                </Container>
                                <Typography as="p" size="xs">{entry.does}.</Typography>
                                <Typography as="p" size="xxs" color="muted">{entry.key.cost}</Typography>
                                <Container padding="none" flexFill />
                                <Container layout="flex" align="center" justify="end" gap="xs" padding="none" width="100%">
                                    <Button size="sm" selected={chosen?.id === entry.id} onClick={() => { setChosen(entry); setKey(''); }}><Icon name="FiKey" size="xs" />Add a key</Button>
                                </Container>
                            </Card>
                        ))}
                    </Container>
                </Container>
            )}
        </Container>
    );
};

const CatalogueCard = ({ model, job, jobs = [], canManage, ollamaUp, onDownload, deviceId = null }) => {
    const guide = useGuide();
    const busy = job && ['queued', 'downloading'].includes(job.status);
    const fromLibrary = model.source !== 'huggingface';
    let action = null;

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
        // Where it can be downloaded from: the two places, each on its own button with its own mark.
        action = (
            <ButtonGroup size="sm" selectable={false} wrap={false}>
                {fromLibrary && (
                    <Button size="sm" onClick={() => onDownload(model.tag)} disabled={!ollamaUp} title={forPool ? `Too large for this computer alone. It is kept here and runs in chats placed on your pool, with ${model.pool.names} sharing the work.` : `Download ${model.name}`} {...guide.tip('models.download')}>
                        <Icon name="SiOllama" size="xs" />
                        {job?.status === 'paused' || job?.status === 'failed' ? 'Resume' : 'Download from Ollama'}
                    </Button>
                )}
                {model.hub && (
                    <Button size="sm" disabled={!ollamaUp} title="Choose a download size" genie={{ trigger: 'click', variant: 'popover', width: '420px', padding: 'lg', content: <HubFiles repo={model.hub} deviceId={deviceId} jobs={jobs} canManage={canManage} ollamaUp={ollamaUp} onDownload={onDownload} /> }}>
                        <Icon name="SiHuggingface" size="xs" />Download from Hugging Face
                    </Button>
                )}
            </ButtonGroup>
        );
    }
    const can = abilities(model);

    return (
        <Card layout="flex-column" gap="sm" padding="lg" width="100%" height="100%" minWidth="0" wrap={false}>
            <Container layout="flex-column" gap="none" padding="none" width="100%" minWidth="0">
                <Row>
                    <Typography as="h3" size="sm" weight="semibold" title={model.name}>{model.name}</Typography>
                    {model.pickLabel && <Badge size="xs" color="primary" title={model.pickWhy}>{model.pickLabel}</Badge>}
                </Row>
            </Container>
            <Typography as="p" size="xs">{model.description}</Typography>
            {(can.length > 0 || cannotChat(model)) && (
                <Container layout="flex" gap="xs" padding="none" align="center" width="100%">
                    {cannotChat(model) && <NoChatBadge />}
                    {can.map((ability) => <Badge key={ability} size="xs" title={ABILITY_NOTES[ability]}>{ability}</Badge>)}
                </Container>
            )}
            <Container padding="none" flexFill />
            <Container layout="flex-column" gap="xs" padding="none" width="100%" minWidth="0">
                <Typography as="p" size="xs">
                    {model.cloudOnly
                        ? 'Too large to download.'
                        : [`${gb(model.sizeMb)} download`, model.fit.memoryNeededMb ? `needs ${gb(model.fit.memoryNeededMb)} to run` : null, model.fit.tokensPerSecond ? speedWords(model.fit.tokensPerSecond) : null].filter(Boolean).join(' · ')}
                </Typography>
                {!model.cloudOnly && <Placement model={model} />}
                <Container layout="flex" gap="xs" padding="none" align="center" width="100%">
                    <Badge size="xs" color={FIT_COLORS[model.fit.verdict]}>{model.fit.label}</Badge>
                    {model.pool && !model.pool.off && <Badge size="xs" color="primary" title={`Too large for this computer alone, but together these computers can give it ${gb(model.pool.memoryMb)}. A pooled model writes more slowly than one on a single computer.`}>Fits if you pool {model.pool.names}</Badge>}
                    {model.pool?.off && <Badge size="xs" color="warning" title={`It fits when ${model.pool.names} pool, but the pool is off right now. ${model.pool.off}`}>Fits pooled, pool off now</Badge>}
                    {model.pool && model.moe && <Badge size="xs" color="success" title="Only a small part of this model works on each word, so far less crosses between your computers: it writes much faster pooled than a model of the same size that is not a mixture of experts.">Faster when pooled</Badge>}
                    {model.pool && <Typography size="xxs" margin="none" href="/devices?view=pooling">How to pool</Typography>}
                </Container>
            </Container>
            {busy && <ProgressBar value={job.percent} size="xs" color="primary" animated={job.status === 'downloading' && !job.stalled} width="100%" />}
            {action && (
                <Container layout="flex" align="center" justify="end" gap="xs" padding="none" width="100%">
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
// One model's download sizes from its second source, each with whether it fits this computer.
const HubFiles = ({ repo, deviceId, jobs, canManage, ollamaUp, onDownload }) => {
    const [files, setFiles] = useState(null);
    useEffect(() => {
        let live = true;
        modelService.hubFiles(repo, deviceId).then((result) => live && setFiles(result), (error) => live && setFiles({ problem: error?.response?.data?.message || 'Its download sizes could not be read just now.' }));
        return () => { live = false; };
    }, [repo, deviceId]);
    if (!files) return <Loading text="Reading its download sizes…" />;
    if (files.problem) return <Typography as="p" size="xs" color="error">{files.problem}</Typography>;
    return (
        <Container layout="flex-column" gap="sm" padding="none" width="100%">
            <Typography as="h3" size="sm" weight="semibold">{files.repo}</Typography>
            <Typography as="p" size="xxs" color="muted">{[files.parameters ? `${files.parameters}B parameters` : null, files.licence ? `Licence: ${files.licence}` : null, 'Smaller sizes are squeezed harder: faster and lighter, a little less exact.'].filter(Boolean).join(' · ')}</Typography>
            {files.quants.length === 0 && <Typography as="p" size="xs" color="muted">This model has no single-file download that can be used here.</Typography>}
            {files.quants.map((one) => {
                const job = jobs.find((entry) => entry.model === one.name && entry.status !== 'completed' && entry.status !== 'cancelled');
                return (
                    <Container key={one.quant} layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%" wrap={false}>
                        <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                            <Typography as="p" size="xs" weight="semibold">{`${one.quant} · ${gb(one.sizeMb)}`}</Typography>
                            {one.fit && <Typography as="p" size="xxs" color={one.fit.fits ? 'muted' : 'warning'}>{one.fit.label}</Typography>}
                        </Container>
                        {canManage && (job
                            ? <Badge size="xs">{job.status === 'downloading' ? `${job.percent ?? 0}%` : job.status}</Badge>
                            : <Button size="xs" disabled={!ollamaUp || (one.fit && !one.fit.fits)} onClick={() => onDownload(one.name)}><Icon name="FiDownload" size="xs" />Download</Button>)}
                    </Container>
                );
            })}
        </Container>
    );
};

const DiscoverTab = ({ catalogue, recommended, find, jobs, canManage, ollamaUp, onDownload, onFind, onPage, onSort, loading, deviceId = null }) => {
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

    if (!catalogue) return <Loading text="Working out which models fit this device…" />;
    const page = catalogue.page || 1;
    const size = catalogue.size || perPage();
    const paged = catalogue.paged ?? catalogue.total ?? 0;
    const pages = Math.max(1, Math.ceil(paged / size));
    // The list holds the first 200 models; reaching its last page asks for 200 more.
    const turn = (next, perPage = size) => {
        onPage(next, perPage, next >= pages && catalogue.further ? (catalogue.limit || 200) + 200 : null);
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
            jobs={jobs}
            deviceId={deviceId}
            canManage={canManage}
            ollamaUp={ollamaUp}
            onDownload={onDownload}
        />
    );
    const choice = (label, on, change, key = label) => (
        <Button key={key} size="xs" selected={on} onClick={change}>{label}</Button>
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
            <Typography as="p" size="xxs" color="muted">{title}</Typography>
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
            <Typography as="p" size="xxs" color="muted">Order</Typography>
            {SORTS.map((option) => (
                <Button key={option.value} size="xs" width="100%" align="start" selected={sortChoice() === option.value} onClick={() => onSort(option.value)}>{option.label}</Button>
            ))}
        </Container>
    );

    return (
        <Container layout="flex-column" gap="xl" padding="none" width="100%">
            {recommended?.length > 0 && (
                <Container as="section" layout="flex-column" gap="md" padding="none" width="100%">
                    <SectionTitle title="Recommended for this device" count={recommended.length} />
                    <Container layout="grid" columns={4} gap="md" padding="none" width="100%" align="stretch">{recommended.map(card)}</Container>
                </Container>
            )}
            {recommended?.length === 0 && (
                <Typography as="p" size="xs" color="muted">
                    No model is a comfortable fit for this device. Smaller ones may still run slowly.
                </Typography>
            )}

            <Container ref={top} layout="flex-column" gap="sm" padding="none" width="100%">
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
                    <Button size="sm" selected={active.length > 0} genie={{ trigger: 'click', padding: 'none', width: '360px', content: filterPanel }} genieTrigger="click">
                        <Icon name="FiFilter" size="xs" />Filters{active.length > 0 ? ` (${active.length})` : ''}
                    </Button>
                    <Button size="sm" genie={{ trigger: 'click', padding: 'none', width: '260px', content: sortPanel }} genieTrigger="click">
                        <Icon name="FiBarChart2" size="xs" />{SORTS.find((option) => option.value === sortChoice())?.short}
                    </Button>
                </Container>
                {active.length > 0 && (
                    <Container layout="flex" gap="xs" padding="none" align="center" width="100%">
                        {active.map((one) => (
                            <Button key={one.label} size="xs" selected onClick={one.off} title="Remove this filter">
                                {one.label}<Icon name="FiX" size="xs" />
                            </Button>
                        ))}
                        <Button size="xs" variant="ghost" onClick={clear}>Clear all</Button>
                    </Container>
                )}
                <Typography as="p" size="xxs" color="muted">{summary}</Typography>
                {catalogue.plain && (active.length > 0 || sortChoice() !== 'fit') && (
                    <Typography as="p" size="xxs" color="warning">This server is older than this page, so the filters and order chosen here are not applied yet. Restart or update the server.</Typography>
                )}
                {!canManage && <Typography as="p" size="xxs" color="muted">Only an admin or owner can download models.</Typography>}
            </Container>

            {catalogue.models.length === 0 && (
                <Empty
                    icon={catalogue.unavailable ? 'FiAlertCircle' : 'FiSearch'}
                    title={catalogue.unavailable ? 'The model list could not be loaded' : 'No model matched'}
                    text={catalogue.unavailable ? 'The list could not be loaded just now. You can still add a model by its name below.' : 'No model matched. Try other words or fewer filters, or add a model by its name below.'}
                >
                    {!catalogue.unavailable && narrowed && <Button size="sm" onClick={clear}>Clear all filters</Button>}
                </Empty>
            )}

            {others.length > 0 && (
                <Container as="section" layout="flex-column" gap="md" padding="none" width="100%">
                    <SectionTitle title="All models" count={catalogue.total ?? others.length} />
                    <Container layout="grid" columns={4} gap="md" padding="none" width="100%" align="stretch">{others.map(card)}</Container>
                </Container>
            )}

            {paged > PAGE_SIZES[0] && (
                <Container layout="flex-column" gap="xs" padding="none" width="100%">
                    <Pagination size="sm" padding="none" page={page} pages={pages} disabled={loading} onPage={(next) => turn(next)} pageSize={size} pageSizes={PAGE_SIZES} onPageSize={(chosen) => turn(1, chosen)}>
                        <Typography as="p" size="xxs" color="muted">per page</Typography>
                    </Pagination>
                    <Container layout="flex" justify="end" padding="none" width="100%">
                        <Typography as="p" size="xxs" color="muted">Page {page} of {pages} · {paged} models</Typography>
                    </Container>
                </Container>
            )}

            {canManage && (
                <Card layout="flex-column" gap="sm" padding="lg" width="100%" maxWidth="720px">
                    <Typography as="h2" size="md" weight="semibold" font="secondary">Add a model by name</Typography>
                    <Typography as="p" size="xs" color="muted">
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
    if (!installed) return <Loading text="Looking for installed models…" />;
    if (!installed.ollamaAvailable) {
        return <Empty icon="FiAlertCircle" title="Ollama is not running" text="Installed models cannot be listed until it is started." />;
    }
    if (installed.models.length === 0) {
        return <Empty icon="FiBox" title="No models are installed yet" text="Open the Downloadable tab to download one that fits this device." />;
    }

    return (
        <Container layout="grid" columns={4} gap="md" padding="none" width="100%" align="stretch">
            {installed.models.map((model) => (
                <Card key={model.name} layout="flex-column" gap="sm" padding="lg" width="100%" height="100%" minWidth="0" wrap={false}>
                    <Container layout="flex-column" gap="none" padding="none" width="100%" minWidth="0">
                        <Typography as="h3" size="sm" weight="semibold" title={model.displayName}>{model.displayName}</Typography>
                        {model.displayName !== model.name && <Typography as="p" size="xxs" color="muted" font="monospace">{model.name}</Typography>}
                    </Container>
                    {model.description && <Typography as="p" size="xs">{model.description}</Typography>}
                    <Container layout="flex" gap="xs" padding="none" align="center" width="100%">
                        {model.personal && <Badge size="xs" color="primary">Yours, on {model.basedOn}</Badge>}
                        {cannotChat(model) && <NoChatBadge />}
                        {abilities(model).map((ability) => <Badge key={ability} size="xs" title={ABILITY_NOTES[ability]}>{ability}</Badge>)}
                        {elsewhere[model.name]?.length > 0 && <Badge size="xs" color="tertiary">Also on {elsewhere[model.name].join(', ')}</Badge>}
                    </Container>
                    <Container padding="none" flexFill />
                    <Container layout="flex-column" gap="xs" padding="none" width="100%" minWidth="0">
                        <Typography as="p" size="xs">
                            {[
                                `${gbFromBytes(model.sizeBytes)} on disk`,
                                model.fit?.memoryNeededMb ? `needs ${gb(model.fit.memoryNeededMb)} to run` : null,
                                model.parameterSize,
                                model.quantization,
                                model.contextLength ? `reads ${model.contextLength.toLocaleString()} tokens` : null
                            ].filter(Boolean).join(' · ')}
                        </Typography>
                        <Placement model={model} />
                    </Container>
                    {canManage && (
                        <Container layout="flex" align="center" justify="end" gap="xs" padding="none" width="100%">
                            <Button size="sm" color="error" title="Delete" aria-label={`Delete ${model.displayName}`} onClick={() => onDelete(model)}>
                                <Icon name="FiTrash2" size="xs" />Delete
                            </Button>
                        </Container>
                    )}
                </Card>
            ))}
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
        const { q, purpose, can, fits, limit } = wanted;
        const spans = rangeQuery(wanted);
        const mine = ++asking.current;
        setCatalogueLoading(true);
        try {
            const ask = (current) => modelService.getDeviceCatalogue(deviceId, {
                ...(q ? { q } : {}),
                ...(page > 1 ? { page } : {}),
                ...(current && limit > 200 ? { limit } : {}),
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
        if (device?.online) await Promise.all([loadInstalled(), loadCatalogue(device.id), loadRecommended(device.id)]);
        setRefreshing(false);
    }, [device, loadDevices, loadInstalled, loadCatalogue, loadRecommended]);

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

    const refreshRef = useRef(() => {});
    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    useEffect(() => {
        const reload = () => refreshRef.current();
        window.addEventListener('ollama-availability-changed', reload);
        return () => window.removeEventListener('ollama-availability-changed', reload);
    }, []);

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

    const ollamaUp = installed ? installed.ollamaAvailable : true;
    const counts = useMemo(() => ({ installed: installed?.models.length ?? null }), [installed]);

    // The sections, down the left edge of the screen; what this computer holds, down the right edge.
    const sections = TABS.map((option) => ({
        icon: option.icon,
        label: `${option.label}${option.id === 'installed' && counts.installed !== null ? ` (${counts.installed})` : ''}: ${option.about}`,
        selected: tab === option.id,
        onClick: () => setTab(option.id),
        tip: guide.tip(`models.${option.id}`)
    }));
    const holds = (
        <Container layout="flex-column" gap="lg" padding="none" width="100%">
            <Stat label="Installed" value={installed ? `${installed.models.length} models` : '…'} />
            <Stat label="Used by models" value={installed?.disk ? gb(installed.disk.usedByModelsMb) : '…'} />
            <Stat label="Free disk" value={installed?.disk ? gb(installed.disk.freeMb) : '…'} />
            <Stat
                label="Graphics card"
                value={device ? (catalogue?.hardware?.gpuName || device.hardware?.gpuName || 'None') : '…'}
                note={device?.hardware?.gpuMemoryMb ? `${gb(device.hardware.gpuMemoryMb)} graphics memory` : null}
            />
        </Container>
    );

    return (
        <Page
            title="Models"
            lead={device ? `Find, download and manage AI models on ${device.name}.` : 'Find, download and manage AI models.'}
            layout="flex-column"
            gap="xl"
            background="grid"
            backgroundFade="bottom"
            left={{ actions: sections, icon: TABS.find((option) => option.id === tab)?.icon, label: 'Sections of the Models page' }}
            right={{ content: holds, icon: 'FiHardDrive', label: device ? `What ${device.name} holds` : 'What this computer holds' }}
            actions={(
                <Container layout="flex" gap="sm" padding="none" align="center" justify="end">
                    {devices?.length > 1 && (
                        <ButtonGroup size="sm" selectable={false} wrap>
                            {devices.map((entry) => (
                                <Button key={entry.id} size="sm" selected={entry.id === deviceId} onClick={() => setDevice(entry)}>
                                    <Icon name="FiMonitor" size="xs" />{entry.name}
                                    {deviceService.ready(entry)
                                        ? <Icon name="FiCheckCircle" size="xs" color="success" title="Ready to use right now" aria-label="Ready to use right now" />
                                        : <Badge size="xs" color={entry.paused ? 'warning' : entry.online ? 'success' : 'default'}>{entry.paused ? 'Paused' : entry.online ? 'Online' : 'Offline'}</Badge>}
                                </Button>
                            ))}
                        </ButtonGroup>
                    )}
                    <Button size="sm" variant="ghost" disabled={refreshing} title="Refresh models and disk space" onClick={refresh} {...guide.tip('models.refresh')}>
                        <Icon name="FiRefreshCw" size="xs" />Refresh
                    </Button>
                </Container>
            )}
        >
            <Typography as="h2" size="md" weight="semibold" font="secondary">{TABS.find((option) => option.id === tab)?.label}</Typography>

            <DownloadsPanel jobs={jobs} canManage={canManage} onResume={(job) => download(job.model, job.device || deviceId)} onPause={pause} onCancel={cancel} />

            <Container layout="flex-column" gap="xl" padding="none" width="100%" wrap={false}>
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
                        deviceId={deviceId}
                        find={find}
                        onFind={(changes) => device && loadCatalogue(device.id, { ...changes, limit: 200 })}
                        onSort={(sort) => {
                            try { localStorage.setItem('mollama-models-sort', sort); } catch { /* kept for this visit only */ }
                            if (device) loadCatalogue(device.id, { sort });
                        }}
                        onPage={(page, size, limit) => {
                            try { localStorage.setItem('mollama-models-per-page', String(size)); } catch { /* kept for this visit only */ }
                            if (device) loadCatalogue(device.id, { page, size, ...(limit ? { limit } : {}) });
                        }}
                    />
                )}
                {device?.online && tab === 'installed' && <InstalledTab installed={installed} canManage={canManage} onDelete={deleteModel} elsewhere={elsewhere} />}
                {device?.online && !device.paused && tab === 'train' && <TrainTab device={device} />}
            </Container>
        </Page>
    );
};

export default ModelsPage;
