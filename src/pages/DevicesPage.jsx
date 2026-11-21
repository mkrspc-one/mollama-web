import React, { useCallback, useEffect, useState } from 'react';
import { Page, Container, Card, Typography, Button, ButtonGroup, Badge, Icon, Input } from '@components/Components';
import { useSearchParams } from 'react-router-dom';
import { useNotification } from '@contexts/NotificationContext';
import { deviceService, desktopService, describeError, formatGb, useGuide } from '../client/ai.client';

const ADD_STEPS = [
    'Download the Mollama desktop app on the computer you want to add.',
    'Install it, open it and sign in with this account.',
    'The computer appears on this page by itself, and its models can be used from any of your Mollama apps.'
];

// Pooling: what a person should know before lending computers to one model.
const POOL_GUIDE = {
    steps: {
        label: 'How to pool',
        items: [
            'Install the Mollama desktop app on every computer you want to pool, and sign in with this account on each.',
            'Put them on the same home network, by cable if you can, or connect two of them with a direct network cable.',
            'Mollama finds the computers that can pool by itself and lists them here.',
            'Turn on pooling in the desktop app on each computer. After you agree, it sets up the llama.cpp parts that let that computer be the main computer or a helper.',
            'Pick the main computer: the one with the largest graphics card, and room on its disk for the model.',
            'Download the model on the main computer only, then choose the pool in a chat.'
        ]
    },
    benefits: {
        label: 'Benefits',
        items: [
            'Runs models no single computer of yours can hold, using the memory of all of them.',
            'Puts memory to work that sits idle on your other computers.',
            'Only the main computer downloads the model: the helpers lend their memory through the desktop app and keep no copy of their own.',
            'Measured on two of the owner\'s computers over Wi-Fi: a 33B model wrote about 2.8 times faster pooled than on one computer alone.'
        ]
    },
    risks: {
        label: 'Risks',
        items: [
            'Pooling has no password and no encryption between computers. Only pool on a home network you trust, never on public or shared Wi-Fi.',
            'Replies are slower than on one computer whenever the model would fit on one: on that same test a small model wrote 11 words a second pooled against 52 alone.',
            'If a computer in the pool sleeps, loses its network or is turned off, the reply stops.',
            'A lending computer is busy and warm while a pooled model runs.'
        ]
    },
    tips: {
        label: 'Tips',
        items: [
            'Use a cable, not Wi-Fi: every word crosses the network, and Wi-Fi delay comes and goes.',
            'Pool only models that do not fit one computer. A model that fits runs fastest on its own.',
            'Keep lending computers awake and plugged in, and close large programs on them.',
            'Pool two or three computers, not more: each one adds a step to every word.',
            'The first start sends the model to the helpers and takes minutes; later starts use their cache and take about a minute.',
            'Turn lending off when you are done.'
        ]
    }
};

const POOL_PARTS = [['off', 'Off'], ['lend', 'Lend'], ['main', 'Main']];
// What a computer in a pool is doing now, in a few words, and the colour of its badge.
const poolStatus = (one, hasMain) => {
    if (one.role === 'off') return null;
    if (!one.known) return ['Its desktop app cannot pool yet: pooling comes with the next Mollama desktop app release.', 'warning'];
    if (one.setup === 'asking') return ['Waiting for you to agree on that computer to set up pooling.', 'warning'];
    if (one.setup === 'downloading') return [`Downloading llama.cpp${one.progress ? `, ${Math.round(one.progress * 100)}%` : ''}…`, 'secondary'];
    if (['declined', 'failed', 'unsupported'].includes(one.setup) || (one.detail && !one.lending)) return [one.detail || 'Pooling could not be set up on it.', 'error'];
    if (one.role === 'main') return ['Main computer: it holds the model and runs it.', 'primary'];
    if (!hasMain) return ['Ready to lend. Choose a main computer on this network.', 'secondary'];
    if (one.reachable === false) return [one.detail || 'The main computer cannot reach it.', 'error'];
    if (one.reachable === true) return ['Lending: the main computer reaches it.', 'success'];
    return [one.lending ? 'Lending: being checked by the main computer…' : 'Setting up…', 'secondary'];
};

const PoolingCard = ({ pools, onPart }) => {
    const [tab, setTab] = useState('steps');
    const groups = pools?.groups || [];
    const left = pools?.left || [];
    return (
        <Card layout="flex-column" gap="sm" padding="md" width="100%" minWidth="0" span="full" hover={false}>
            <Heading icon="FiLayers" title="Pooling computers">
                <Badge size="xs" color="secondary">Coming soon</Badge>
            </Heading>
            <Typography size="xs" color="muted">
                Several of your computers can share one model that none of them could hold alone. Mollama checks which of your computers are on the same network. Choose one main computer and let the others lend; running a pooled model in a chat is being built.
            </Typography>
            {!pools && <Typography size="xs" color="muted">Checking your computers…</Typography>}
            {pools && groups.length === 0 && <Typography size="xs">None of your computers can pool right now.</Typography>}
            {groups.map((group) => (
                <Container key={group.network} layout="flex-column" gap="xs" padding="sm" width="100%" backgroundColor="surface-alt">
                    <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
                        <Icon name={group.via === 'cable' || group.wired ? 'FiLink' : 'FiWifi'} size="xs" color="primary" />
                        <Typography size="xs" weight="semibold">{group.computers.map((one) => one.name).join(' + ')}</Typography>
                        <Badge size="xs" color="secondary">{group.via === 'cable' ? 'Direct cable' : group.wired ? 'Home network, cable' : 'Home network, Wi-Fi'}</Badge>
                        {group.computers.some((one) => one.role === 'main') && group.computers.some((one) => one.role === 'lend') && group.computers.filter((one) => one.role === 'lend').every((one) => one.reachable === true)
                            ? <Badge size="xs" color="success" title="The main computer reached every lending computer through its gate.">Checked</Badge>
                            : <Badge size="xs" color="warning" title="Checked once a main computer reaches a lending computer.">Not yet checked</Badge>}
                    </Container>
                    {group.computers.map((one) => {
                        const status = poolStatus(one, group.computers.some((other) => other.id === pools.main));
                        return (
                            <Container key={one.id} layout="flex" align="center" gap="xs" padding="none" width="100%">
                                <Typography size="xs" weight="semibold">{one.name}</Typography>
                                <Typography size="xxs" color="muted">{one.address}</Typography>
                                <ButtonGroup size="xs" justify="start" selectable={false}>
                                    {POOL_PARTS.map(([role, label]) => (
                                        <Button key={role} size="xs" color={one.role === role ? 'primary' : 'secondary'} selected={one.role === role} onClick={() => one.role !== role && onPart(one, role)}>{label}</Button>
                                    ))}
                                </ButtonGroup>
                                {status && <Badge size="xs" color={status[1]}>{status[0]}</Badge>}
                            </Container>
                        );
                    })}
                    <Typography size="xxs" color="muted">
                        Between them: {formatGb(group.combined.gpuMemoryMb)} of graphics memory and {formatGb(group.combined.memoryMb)} of system memory, on {group.network}.
                    </Typography>
                </Container>
            ))}
            {left.length > 0 && (
                <Container layout="flex-column" gap="none" padding="none" width="100%">
                    {left.map((one) => (
                        <Typography key={one.id} size="xxs" color="muted">{`${one.name}: ${one.message}`}</Typography>
                    ))}
                </Container>
            )}
            <ButtonGroup size="xs" justify="start" selectable={false}>
                {Object.entries(POOL_GUIDE).map(([key, part]) => (
                    <Button key={key} size="xs" color={tab === key ? 'primary' : 'secondary'} selected={tab === key} onClick={() => setTab(key)}>{part.label}</Button>
                ))}
            </ButtonGroup>
            <Container layout="flex-column" gap="xs" padding="none" width="100%">
                {POOL_GUIDE[tab].items.map((item, index) => (
                    <Container key={item} layout="flex" align="start" gap="xs" padding="none" wrap={false}>
                        {tab === 'steps' ? <Badge size="xs" color="primary">{index + 1}</Badge> : <Icon name={tab === 'risks' ? 'FiAlertTriangle' : tab === 'benefits' ? 'FiCheck' : 'FiInfo'} size="xs" color={tab === 'risks' ? 'warning' : 'secondary'} />}
                        <Typography size="xs" color="muted">{item}</Typography>
                    </Container>
                ))}
            </Container>
        </Card>
    );
};

const Tile = ({ icon, label, value, note }) => (
    <Card layout="flex" align="center" gap="sm" padding="sm" hover={false} shadow={false} wrap={false} width="100%" minWidth="0">
        <Icon name={icon} size="sm" color="primary" />
        <Container layout="flex-column" gap="none" padding="none" minWidth="0">
            <Typography size="xxs" color="muted">{label}</Typography>
            <Typography size="sm" weight="semibold" truncate title={String(value)}>{value}</Typography>
            {note && <Typography size="xxs" color="muted">{note}</Typography>}
        </Container>
    </Card>
);

const Heading = ({ icon, title, children }) => (
    <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%" wrap={false}>
        <Container layout="flex" align="center" gap="xs" padding="none" wrap={false} minWidth="0">
            <Icon name={icon} size="xs" color="primary" />
            <Typography as="h2" size="sm" weight="semibold" truncate>{title}</Typography>
        </Container>
        {children}
    </Container>
);

const toGbText = (megabytes) => (megabytes ? String(Math.round(megabytes / 1024)) : '');
export const DesktopDownloads = ({ vertical = false }) => {
    const [published, setPublished] = useState(null);
    const channels = desktopService.channels();

    useEffect(() => {
        let live = true;
        desktopService.published().then((release) => { if (live) setPublished(release); });
        return () => { live = false; };
    }, []);

    const ready = (file) => published === null || published.files.includes(file);

    return (
        <Container layout={vertical ? 'flex' : 'flex-column'} gap="sm" padding="none" width={vertical ? 'auto' : '100%'} align="start" justify="end">
            {channels.map((channel) => (
                <Container key={channel.id} layout="flex-column" gap="xs" padding="none" width={vertical ? 'auto' : '100%'}>
                    {channels.length > 1 && (
                        <Container layout="flex" align="center" gap="xs" padding="none">
                            <Typography size="xs" weight="semibold" margin="none">{channel.title}</Typography>
                            <Badge size="xs" color={channel.id === 'staging' ? 'warning' : 'success'}>{channel.opens}</Badge>
                        </Container>
                    )}
                    <ButtonGroup size="sm" justify="start" selectable={false} vertical={vertical}>
                        {desktopService.systems.map((system) => {
                            const file = `${channel.name}${system.ending}`;
                            return (
                                <Button key={system.id} size="sm" color={channel.id === 'staging' ? 'secondary' : 'primary'} height="auto" disabled={!ready(file)} onClick={() => window.open(desktopService.address(file), '_blank', 'noopener')}>
                                    <Container layout="flex-column" align="center" gap="none" padding="none">
                                        <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                                            <Icon name={system.icon} size="xs" />
                                            <Typography size="xs" weight="semibold" color="inherit" margin="none">{system.label}</Typography>
                                        </Container>
                                        <Typography size="xxs" color="inherit" margin="none">
                                            {!ready(file) ? 'Not available yet' : published?.version ? `Version ${published.version}` : 'Download'}
                                        </Typography>
                                    </Container>
                                </Button>
                            );
                        })}
                    </ButtonGroup>
                </Container>
            ))}
        </Container>
    );
};

const isNewer = (candidate, current) => {
    const parts = (version) => String(version || '').split('.').map((part) => Number(part) || 0);
    const [next, now] = [parts(candidate), parts(current)];
    for (let index = 0; index < 3; index += 1) {
        if ((next[index] || 0) !== (now[index] || 0)) return (next[index] || 0) > (now[index] || 0);
    }
    return false;
};
const thisSystem = () => {
    const agent = navigator.userAgent;
    const id = /Windows/i.test(agent) ? 'windows' : /Macintosh/i.test(agent) ? 'mac' : /Linux/i.test(agent) ? 'linux' : null;
    return desktopService.systems.find((system) => system.id === id) || null;
};

// Inside the desktop app, the card for this computer says which version of the app it runs and offers a newer one.
// The installer downloads in the browser and updates the app in place when it is run; sign-in and settings are kept.
const AppUpdate = () => {
    const current = window.desktop?.version || null;
    const [published, setPublished] = useState(null);
    const [checking, setChecking] = useState(false);
    const check = useCallback(() => {
        setChecking(true);
        desktopService.published().then(setPublished).finally(() => setChecking(false));
    }, []);
    useEffect(() => { if (current) check(); }, [current, check]);
    if (!current) return null;

    const system = thisSystem();
    const file = system ? `${desktopService.channels()[0].name}${system.ending}` : null;
    const ready = Boolean(published?.version && file && published.files.includes(file) && isNewer(published.version, current));
    return (
        <>
            <Badge size="xs" color={ready ? 'warning' : 'default'} title={ready ? `Version ${published.version} is available` : undefined}>App {current}</Badge>
            {ready ? (
                <Button size="xs" color="primary" title="Downloads the installer in your browser. Run it to update; your sign-in and settings stay." onClick={() => window.open(desktopService.address(file), '_blank', 'noopener')}>
                    <Icon name="FiDownload" size="xs" />Update to {published.version}
                </Button>
            ) : (
                <Button size="xs" color="secondary" disabled={checking} title={published && !published.version ? 'The list of versions could not be read just now.' : published ? 'This is the newest version.' : undefined} onClick={check}>
                    <Icon name={checking ? 'FiLoader' : 'FiRefreshCw'} size="xs" />{checking ? 'Checking…' : published && !published.version ? 'Could not check' : published ? 'Up to date' : 'Check for updates'}
                </Button>
            )}
        </>
    );
};

const toMb = (gbText) => (gbText === '' ? null : Math.round(Number(gbText) * 1024));

const DeviceCard = ({ device, canManage, onChanged, onRemove, onPause, here, onSetUp }) => {
    const { success, error: notifyError } = useNotification();
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ name: '', memoryGb: '', gpuName: '', gpuMemoryGb: '' });

    const { hardware, ollama } = device;
    const guide = useGuide();

    const startEditing = () => {
        setForm({
            name: device.name,
            memoryGb: toGbText(hardware.memoryMb),
            gpuName: hardware.gpuName || '',
            gpuMemoryGb: hardware.hasGpu ? toGbText(hardware.gpuMemoryMb) : '0'
        });
        setEditing(true);
    };

    const run = async (action, doneMessage) => {
        setBusy(true);
        try {
            const result = await action();
            onChanged(result.device);
            success(doneMessage);
            setEditing(false);
        } catch (error) {
            notifyError(describeError(error));
        } finally {
            setBusy(false);
        }
    };

    const save = () => {
        const numbers = [form.memoryGb, form.gpuMemoryGb];
        if (numbers.some((value) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
            notifyError('Memory must be a number of gigabytes, for example 32.');
            return;
        }
        run(() => deviceService.updateDevice(device.id, {
            name: form.name.trim() || device.name,
            overrides: {
                memoryMb: toMb(form.memoryGb),
                gpuName: form.gpuName.trim(),
                gpuMemoryMb: toMb(form.gpuMemoryGb)
            }
        }), 'Device details saved.');
    };

    const useDetected = () => run(() => deviceService.updateDevice(device.id, {
        overrides: { memoryMb: null, gpuName: '', gpuMemoryMb: null }
    }), 'Back to the details read from this computer.');

    const readAgain = () => run(() => deviceService.detectDevice(device.id), 'This computer was read again.');

    const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

    return (
        <Card layout="flex-column" gap="sm" padding="md" width="100%" hover={false} span="full">
            <Heading icon="FiMonitor" title={device.name}>
                <Container layout="flex" gap="xs" padding="none" align="center" justify="end">
                    {deviceService.ready(device) && <Icon name="FiCheckCircle" size="sm" color="success" title="Ready to use right now" aria-label="Ready to use right now" />}
                    <Badge size="xs" color={device.paused ? 'warning' : device.online ? 'success' : 'default'}>{device.paused ? 'Paused' : device.online ? 'Online' : 'Offline'}</Badge>
                    {device.online && !device.paused && (
                        <Badge size="xs" color={ollama.available ? 'success' : 'error'}>
                            {ollama.available ? `Ollama ${ollama.version}` : 'Ollama is not running'}
                        </Badge>
                    )}
                    {here && <AppUpdate />}
                    {here && device.online && !device.paused && !ollama.available && <Button size="xs" color="secondary" onClick={onSetUp}>Set up Ollama</Button>}
                    {device.kind !== 'local' && (device.online || device.paused) && (
                        <Button size="xs" color="secondary" onClick={() => onPause(device)}>
                            <Icon name={device.paused ? 'FiPlay' : 'FiPause'} size="xs" />{device.paused ? 'Resume' : 'Pause'}
                        </Button>
                    )}
                    {device.kind !== 'local' && !here && <Button size="xs" color="error" onClick={() => onRemove(device)}><Icon name="FiTrash2" size="xs" />Remove</Button>}
                    {device.edited && <Badge size="xs" color="warning">Corrected by hand</Badge>}
                </Container>
            </Heading>
            <Typography size="xxs" color="muted">
                {device.kind === 'local' ? 'The computer Mollama is running on.' : 'Linked through the Mollama desktop app.'}
                {!device.online && ' Open the Mollama desktop app on it to bring it online, or remove it if that computer is no longer yours to use.'}
                {device.paused && ' Paused: it stays connected but is given no work, and its models are out of memory, until you resume it.'}
                {device.online && !device.paused && !ollama.available && (here ? ' Ollama is not running here. Set up Ollama installs it if needed and starts it.' : ' Start Ollama on that computer, or open Mollama on it and choose Set up Ollama.')}
            </Typography>

            {!editing && (
                <Container layout="grid" columns="auto-sm" gap="sm" padding="none" width="100%">
                    <Tile
                        icon="FiZap"
                        label={hardware.gpuShared ? 'Graphics' : 'Graphics card'}
                        value={!hardware.hasGpu ? 'None found' : hardware.gpuShared ? 'Built in' : (hardware.gpuName || 'Graphics card')}
                        note={!hardware.hasGpu
                            ? 'Models run on the processor, which is slower'
                            : hardware.gpuShared
                                ? `Shares the ${formatGb(hardware.memoryMb)} of system memory. About ${formatGb(hardware.gpuMemoryMb)} of it can hold a model (an estimate).`
                                : `${formatGb(hardware.gpuMemoryMb)} of graphics memory`}
                    />
                    <Tile icon="FiLayers" label="System memory" value={formatGb(hardware.memoryMb)} />
                    <Tile
                        icon="FiHardDrive"
                        label="Free disk for models"
                        value={hardware.diskFreeMb === null ? 'Unknown' : `${formatGb(hardware.diskFreeMb)} free`}
                        note={hardware.diskTotalMb ? `of ${formatGb(hardware.diskTotalMb)}` : null}
                    />
                    <Tile
                        icon="FiCpu"
                        label="Processor"
                        value={hardware.cpu || 'Unknown'}
                        note={hardware.cpuThreads ? `${hardware.cpuThreads} threads` : null}
                    />
                    <Tile
                        icon="FiBox"
                        label="Models installed"
                        value={ollama.available ? String(ollama.modelCount) : 'Unknown'}
                        note={ollama.available && ollama.modelCount === 0 ? 'None yet' : null}
                    />
                </Container>
            )}

            {editing && (
                <Container layout="flex-column" gap="sm" padding="none" width="100%">
                    <Typography size="xs" color="muted">
                        Change these only if what Mollama reads is wrong. Leave a box empty to use what it reads.
                    </Typography>
                    <Container layout="grid" columns="auto-sm" gap="sm" padding="none" width="100%">
                        <Input size="sm" label="Device name" value={form.name} onChange={change('name')} width="100%" />
                        <Input size="sm" label="System memory (GB)" value={form.memoryGb} onChange={change('memoryGb')} width="100%" />
                        <Input size="sm" label="Graphics card name" value={form.gpuName} onChange={change('gpuName')} width="100%" />
                        <Input size="sm" label="Graphics memory (GB)" value={form.gpuMemoryGb} onChange={change('gpuMemoryGb')} width="100%" />
                    </Container>
                    <Container layout="flex" gap="xs" padding="none">
                        <Button size="sm" onClick={save} disabled={busy}>Save</Button>
                        <Button size="sm" color="secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
                        {device.edited && (
                            <Button size="sm" color="secondary" onClick={useDetected} disabled={busy}>Use what Mollama reads</Button>
                        )}
                    </Container>
                </Container>
            )}

            {canManage && !editing && (
                <Container layout="flex" gap="xs" padding="none">
                    <Button size="xs" onClick={readAgain} disabled={busy} {...guide.tip('devices.read')}>
                        <Icon name="FiRefreshCw" size="xs" />{busy ? 'Reading…' : 'Read this computer again'}
                    </Button>
                    <Button size="xs" color="secondary" onClick={startEditing} disabled={busy} {...guide.tip('devices.correct')}>
                        <Icon name="FiEdit2" size="xs" />Correct these details
                    </Button>
                </Container>
            )}
        </Card>
    );
};

const DevicesPage = () => {
    const { error: notifyError, success, confirm } = useNotification();
    const [devices, setDevices] = useState(null);
    const [here, setHere] = useState(null);
    const [canManage, setCanManage] = useState(false);
    const [failed, setFailed] = useState(false);
    const [pools, setPools] = useState(null);
    // Two views: the computers themselves, and pooling them. The address says which, so other pages can link to pooling.
    const [params, setParams] = useSearchParams();
    const view = params.get('view') === 'pooling' ? 'pooling' : 'computers';

    const load = useCallback(async () => {
        try {
            const result = await deviceService.listDevices();
            setDevices(result.devices);
            deviceService.pools().then(setPools, () => setPools({ groups: [], left: [] }));
            setCanManage(Boolean(result.permissions?.manage));
            setFailed(false);
        } catch (error) {
            setFailed(true);
            notifyError(describeError(error, 'Your devices could not be loaded.'));
        }
    }, [notifyError]);

    useEffect(() => {
        load();
        window.addEventListener('ollama-availability-changed', load);
        return () => window.removeEventListener('ollama-availability-changed', load);
    }, [load]);

    // A computer's part in a pool: lending its memory, or the main computer that runs the model.
    const setPoolPart = async (computer, role) => {
        try {
            setPools(await deviceService.setPoolRole(computer.id, role));
            if (role === 'lend') success(`${computer.name} will lend. If pooling is not set up on it yet, it asks there before downloading llama.cpp.`);
            if (role === 'main') success(`${computer.name} is now your main computer.`);
        } catch (error) {
            notifyError(describeError(error, 'The computer could not be changed.'));
        }
    };

    // A paused computer stays connected but is given no work, and its loaded models are taken out of memory.
    const pauseDevice = async (device) => {
        try {
            if (device.paused) await deviceService.resumeDevice(device.id);
            else await deviceService.pauseDevice(device.id);
            success(device.paused ? `${device.name} is back in use.` : `${device.name} is paused. Its models are out of memory and it will not be given work until you resume it.`);
            window.dispatchEvent(new CustomEvent('ollama-status-changed'));
            load();
        } catch (error) {
            notifyError(describeError(error, 'The computer could not be changed.'));
        }
    };

    const removeDevice = async (device) => {
        const now = device.online ? ' It is connected right now and will be disconnected.' : '';
        if (!(await confirm(`Remove ${device.name} from your account?${now} It comes back if someone signs in to Mollama on it again.`, { confirmLabel: 'Remove', color: 'error' }))) return;
        try {
            await deviceService.removeDevice(device.id);
            if (deviceService.chosen() === device.id) deviceService.choose('');
            success(`${device.name} was removed.`);
            load();
        } catch (error) {
            notifyError(describeError(error, 'The device could not be removed.'));
        }
    };

    useEffect(() => {
        window.desktop?.deviceState?.().then((state) => setHere(state?.deviceId || null));
    }, [devices]);

    const setUpOllama = async () => {
        success('Setting up Ollama on this computer. Answer the question Mollama asks, then wait for it to finish.');
        const result = await window.desktop.setUpOllama();
        if (result === 'running') success('Ollama is running on this computer.');
        else if (result === 'failed') notifyError('Ollama could not be set up. Install it from ollama.com, then try again.');
        load();
    };

    const replaceDevice = (updated) => {
        setDevices((current) => current.map((device) => (device.id === updated.id ? updated : device)));
        window.dispatchEvent(new CustomEvent('ollama-status-changed'));
    };

    return (
        <Page layout="flex-column" padding="none" gap="none" background="dots" backgroundFade="bottom">
            <Container layout="flex-column" align="center" gap="none" padding="none" width="100%" height="100vh" wrap={false} overflow="hidden">
            <Container layout="flex-column" gap="md" padding="lg" width="100%" maxWidth="1360px" wrap={false}>
                <Container layout="flex-column" gap="none" padding="none">
                    <Typography as="h1" size="2xl" weight="bold" animation="blur" animationDuration={600}>Devices</Typography>
                    <Typography size="xs" color="muted">
                        The computers that run your AI models. Mollama reads each one so it can tell you which models fit.
                        {devices && !canManage && " Only an admin or owner can correct a device's details."}
                    </Typography>
                </Container>
                <ButtonGroup size="xs" justify="start" selectable={false}>
                    {[['computers', 'Computers', 'FiMonitor'], ['pooling', 'Pooling', 'FiLayers']].map(([id, label, icon]) => (
                        <Button key={id} size="xs" color={view === id ? 'primary' : 'secondary'} selected={view === id} onClick={() => setParams(id === 'pooling' ? { view: id } : {}, { replace: true })}><Icon name={icon} size="xs" />{label}</Button>
                    ))}
                </ButtonGroup>

            </Container>
            <Container layout="flex" justify="center" padding="none" width="100%" flexFill minHeight="0" overflow="auto">
            <Container layout="flex-column" gap="md" padding="lg" width="100%" maxWidth="1360px" wrap={false}>
                {devices === null && !failed && <Typography size="xs" color="muted">Reading this computer…</Typography>}

                {failed && (
                    <Card padding="md" width="100%" hover={false}>
                        <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%" wrap={false}>
                            <Typography size="sm" weight="semibold">Your devices could not be loaded.</Typography>
                            <Button size="sm" onClick={load}>Try again</Button>
                        </Container>
                    </Card>
                )}

                {devices?.length === 0 && (
                    <Card layout="flex-column" gap="xs" padding="md" width="100%" hover={false}>
                        <Typography size="sm" weight="semibold">No device is connected to your account yet.</Typography>
                        <Typography size="xs" color="muted">
                            Install the Mollama desktop app on a computer and sign in. That computer appears here by itself, and its models can then be used from any of your Mollama apps.
                        </Typography>
                    </Card>
                )}

                {view === 'pooling' && devices?.length > 0 && <PoolingCard pools={pools} onPart={setPoolPart} />}

                {view === 'computers' && <Container layout="grid" columns={2} gap="sm" padding="none" width="100%">
                    {devices?.map((device) => (
                        <DeviceCard key={device.id} device={device} canManage={canManage} onChanged={replaceDevice} onRemove={removeDevice} onPause={pauseDevice} here={device.id === here} onSetUp={setUpOllama} />
                    ))}


                    <Card layout="flex" justify="between" align="center" gap="md" padding="md" width="100%" minWidth="0" span="full" hover={false} background="hex" backgroundFade="left">
                        <Container layout="flex-column" gap="sm" padding="none" flexFill minWidth="0">
                            <Heading icon="FiPlusCircle" title={devices?.length ? 'Add another device' : 'Add a device'} />
                            <Container layout="flex-column" gap="xs" padding="none" width="100%">
                                {ADD_STEPS.map((step, index) => (
                                    <Container key={step} layout="flex" align="start" gap="xs" padding="none" wrap={false}>
                                        <Badge size="xs" color="primary">{index + 1}</Badge>
                                        <Typography size="xs" color="muted">{step}</Typography>
                                    </Container>
                                ))}
                            </Container>
                        </Container>
                        <DesktopDownloads vertical />
                    </Card>
                </Container>}
            </Container>
            </Container>
            </Container>
        </Page>
    );
};

export default DevicesPage;
