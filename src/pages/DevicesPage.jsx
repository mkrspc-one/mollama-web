import React, { useCallback, useEffect, useState } from 'react';
import { Page, Container, Card, Typography, Button, ButtonGroup, Badge, Icon, Input, Frame } from '@components/Components';
import { useSearchParams } from 'react-router-dom';
import { useNotification } from '@contexts/NotificationContext';
import { deviceService, desktopService, skillService, describeError, formatGb, useGuide } from '../client/ai.client';

const ADD_STEPS = [
    'Download the Mollama desktop app on the computer you want to add.',
    'Install it, open it and sign in with this account.',
    'The computer appears on this page by itself, and its models can be used from any of your Mollama apps.'
];

// Pooling: what a person should know before lending computers to one model.
const POOL_GUIDE = {
    steps: {
        label: 'How to pool',
        figure: 'setup',
        items: [
            'Install the Mollama desktop app on every computer you want to pool, and sign in with this account on each.',
            'Put them on the same home network, by cable if you can, or connect two of them with a direct network cable.',
            'Mollama finds the computers that can pool by itself and lists them here.',
            'Choose each computer\'s part below. The first time, the desktop app on that computer asks before it sets pooling up.',
            'Choose the computer that runs the model: the one with the largest graphics card, and room on its disk for the model. Set the others to lend their memory.',
            'Download the model on the computer that runs it, then choose the pool in a chat.'
        ]
    },
    wiring: {
        label: 'Wiring',
        figure: 'wired',
        items: [
            'The cable: an Ethernet network cable, Cat 6 or Cat 5e, the kind with clear square plugs that goes into a router. One to three metres is plenty. Plugged straight into both computers\' network ports, it works for any mix of computers; no special crossover cable is needed.',
            'A laptop without a network port needs a USB-C network adapter. An adapter with a USB-A plug fits a USB-C laptop through a small USB-C to USB-A adapter, not a USB-A to USB-C cable.',
            'Choose a USB 3 adapter, 1 Gb or 2.5 Gb. A USB 2 adapter is no faster than good Wi-Fi.',
            'Two cables can be joined with a small inline coupler, or both plugged into your router or a network switch.',
            'Two Macs can use one Thunderbolt cable: a real Thunderbolt or 40 Gb USB4 cable, not a charging cable. Between a Mac and a PC, use network adapters.',
            'A plain USB-C cable between two computers is not a network and does not work.',
            'A small personal or travel router makes a private network of your own with no subscription: plug the computers into it. Each computer still needs the internet to reach Mollama, so keep them on your Wi-Fi too, or let the small router share an internet connection.',
            'On a direct cable Windows may call the new network Public. The computers can still pool, but set it to Private in Windows settings if that PC is to lend.'
        ]
    },
    benefits: {
        label: 'Benefits',
        figure: 'shelf',
        items: [
            'Runs models no single computer of yours can hold, using the memory of all of them.',
            'Puts memory to work that sits idle on your other computers.',
            'Only the computer that runs the model downloads it. The others lend their memory and keep no copy of it.',
            'Measured on two of the owner\'s computers over Wi-Fi: a 33B model wrote about 2.8 times faster pooled than on one computer alone.'
        ]
    },
    risks: {
        label: 'Risks',
        figure: 'gate',
        items: [
            'Pool only at home, or on a network you trust. Pooled computers talk to each other openly, so on public or shared Wi-Fi someone nearby could listen in. Mollama never pools on a network Windows marks Public, and a computer that lends its memory answers only the computer that runs the model.',
            'Every computer in the pool has to stay on: if one sleeps, loses its network or is turned off, the reply stops.',
            'Pooling a model that fits one computer makes it slower, not faster: a small model wrote 11 words a second pooled against 52 on one computer.',
            'A lending computer is busy and warm while a pooled model runs.'
        ]
    },
    tips: {
        label: 'Tips',
        figure: 'wire',
        items: [
            'Which cable: an Ethernet network cable, Cat 6 or Cat 5e, with clear square plugs at both ends. A laptop with no network port also needs a USB-C network adapter (USB 3, 1 Gb or 2.5 Gb). The Wiring tab shows every way to connect.',
            'Use a cable, not Wi-Fi: every word crosses the network, and Wi-Fi delay comes and goes. Measured on the owner\'s two computers, a 33B model wrote 7.5 words a second over a direct cable against about 6.5 over Wi-Fi.',
            'A better router helps less than you might think: on a cable the delay is already under a millisecond, and the computers\' own work sets most of the speed. Faster ports (2.5 Gb) mostly shorten the first start, when the model is sent to the other computers. On Wi-Fi, a newer router close to the computers keeps the delay steadier.',
            'Pool only models that do not fit one computer. A model that fits runs fastest on its own.',
            'Before you pool, close large apps on every computer in the pool: browsers with many tabs, games, video and design tools. The model is split by each computer\'s memory, and memory other apps hold can make it slower or stop it loading.',
            'Keep lending computers awake and plugged in while a pooled model runs.',
            'Pool two or three computers, not more: each one adds a step to every word.',
            'The first start sends the model to the other computers and takes minutes; later starts take about a minute.',
            'Turn lending off when you are done.'
        ]
    }
};

// The part each computer plays, in plain words: left out, lending its memory, or running the model with the others' memory.
const POOL_PARTS = [
    { role: 'off', label: 'Not pooled', icon: 'FiMinusCircle', hint: 'This computer is not part of the pool.' },
    { role: 'lend', label: 'Lends memory', icon: 'FiShare2', hint: 'Its memory helps the computer that runs the model. It needs no copy of the model.' },
    { role: 'main', label: 'Runs the model', icon: 'FiCpu', hint: 'It holds the model and runs it, using the memory the others lend. Choose the one with the largest graphics card.' }
];
const STATUS_ICONS = { warning: 'FiAlertTriangle', error: 'FiXCircle', success: 'FiCheckCircle', primary: 'FiCpu', secondary: 'FiClock' };
// What a computer in a pool is doing now, in a few words, and the colour of its badge.
const poolStatus = (one, hasMain) => {
    if (one.role === 'off') return null;
    if (!one.known) return ['Its desktop app cannot pool yet: pooling comes with the next Mollama desktop app release.', 'warning'];
    if (one.setup === 'asking') return ['Waiting for you to agree on that computer to set up pooling.', 'warning'];
    if (one.setup === 'downloading') return [`Setting up pooling${one.progress ? `, ${Math.round(one.progress * 100)}%` : ''}…`, 'secondary'];
    if (['declined', 'failed', 'unsupported'].includes(one.setup) || (one.detail && !one.lending)) return [one.detail || 'Pooling could not be set up on it.', 'error'];
    if (one.role === 'main') return ['Runs the model with the memory the others lend.', 'primary'];
    if (!hasMain) return ['Ready to lend. Choose which computer on this network runs the model.', 'secondary'];
    if (one.reachable === false) return [one.detail || 'The computer that runs the model cannot reach it.', 'error'];
    if (one.reachable === true) return ['Lending its memory. The computer that runs the model reaches it.', 'success'];
    return [one.lending ? 'Lending its memory. Checking that it can be reached…' : 'Setting up…', 'secondary'];
};

// A Hairline figure: the kit's bench page with its engine and the figure's code put in, drawn in the app's colours.
const FIGURE_PALETTE = {
    ground: 'var(--app-background)',
    ink: 'var(--app-text)',
    muted: 'color-mix(in srgb, var(--app-text) 65%, transparent)',
    line: 'var(--app-border)',
    'hairline-plate': 'var(--app-background)',
    'hairline-hi': 'var(--app-text)',
    'hairline-edge': 'color-mix(in srgb, var(--app-text) 55%, transparent)',
    'hairline-mid': 'color-mix(in srgb, var(--app-text) 32%, transparent)',
    'hairline-lo': 'var(--app-border)'
};
const kitFiles = new Map();
const kitFile = (path) => {
    if (!kitFiles.has(path)) {
        const request = skillService.file('hairline-hairline-create', path).then((result) => result.text);
        kitFiles.set(path, request);
        request.catch(() => kitFiles.delete(path));
    }
    return kitFiles.get(path);
};
const PoolFigure = ({ name, title }) => {
    const [page, setPage] = useState({});
    useEffect(() => {
        let live = true;
        setPage({});
        const figure = fetch(`/pooling/${name}.js`).then((reply) => {
            if (!reply.ok) throw new Error('missing');
            return reply.text();
        });
        Promise.all([kitFile('bench.html'), kitFile('kernel.js'), figure]).then(
            ([bench, kernel, code]) => { if (live) setPage({ html: bench.replace('/*KERNEL*/', () => `\n${kernel}\n`).replace('/*FIGURE*/', () => `\n${code}\n`) }); },
            () => { if (live) setPage({ failed: true }); }
        );
        return () => { live = false; };
    }, [name]);
    if (page.failed) return <Typography size="xxs" color="muted">The drawing could not be loaded.</Typography>;
    if (!page.html) return <Typography size="xxs" color="muted">Drawing…</Typography>;
    return <Frame html={page.html} title={title} width="100%" height="440px" maxHeight="760px" variables={FIGURE_PALETTE} dressed fit />;
};

// Every list is marked the same way: a small badge, numbered for the steps and with the part's own mark otherwise.
const POOL_MARK = { wiring: 'FiLink', benefits: 'FiCheck', risks: 'FiAlertTriangle', tips: 'FiInfo' };

const PoolGuide = () => {
    const [tab, setTab] = useState('steps');
    const part = POOL_GUIDE[tab];
    return (
        <Card layout="flex-column" gap="sm" padding="md" width="100%" minWidth="0" hover={false}>
            <Heading icon="FiBookOpen" title="Pooling, step by step" />
            <ButtonGroup size="xs" justify="start" selectable={false}>
                {Object.entries(POOL_GUIDE).map(([key, one]) => (
                    <Button key={key} size="xs" color={tab === key ? 'primary' : 'secondary'} selected={tab === key} onClick={() => setTab(key)}>{one.label}</Button>
                ))}
            </ButtonGroup>
            <Container layout="grid" columns={2} gap="md" padding="none" width="100%">
                <Container layout="flex-column" gap="none" padding="none" width="100%" minWidth="0">
                    <PoolFigure key={part.figure} name={part.figure} title={part.label} />
                </Container>
                <Container layout="flex-column" gap="xs" padding="none" width="100%" minWidth="0">
                    {part.items.map((item, index) => (
                        <Container key={item} layout="flex" align="start" gap="xs" padding="none" wrap={false}>
                            <Badge size="xs" color={tab === 'risks' ? 'warning' : 'primary'} width="20px" minWidth="20px" height="20px">{tab === 'steps' ? index + 1 : <Icon name={POOL_MARK[tab]} size="xs" color="contrast" />}</Badge>
                            <Typography size="xs" color="muted">{item}</Typography>
                        </Container>
                    ))}
                </Container>
            </Container>
        </Card>
    );
};

// Windows marks a network Public until told otherwise, and Mollama never pools on one. This is how a person changes it.
const PRIVATE_STEPS = [
    'Do this only on a network you own and trust, such as your home Wi-Fi. Private lets other devices on that network see the computer.',
    'On that computer, open Settings, then Network & internet.',
    'Choose Wi-Fi (or Ethernet, for a cable), then the network it is connected to.',
    'Under Network profile type, choose Private network.',
    'Come back here and press Check again.'
];
const MakePrivate = ({ name }) => (
    <Container layout="flex-column" gap="xs" padding="none" width="100%">
        <Typography size="xs" weight="semibold">{`Set ${name}'s network to Private`}</Typography>
        {PRIVATE_STEPS.map((step, index) => (
            <Container key={step} layout="flex" align="start" gap="xs" padding="none" wrap={false}>
                <Badge size="xs" color={index === 0 ? 'warning' : 'primary'} width="20px" minWidth="20px" height="20px">{index === 0 ? <Icon name="FiAlertTriangle" size="xs" color="contrast" /> : index}</Badge>
                <Typography size="xs" color="muted">{step}</Typography>
            </Container>
        ))}
        <Typography size="xxs" color="muted">Or in PowerShell, run as administrator, with the connection's own name in place of Wi-Fi (Settings lists it under Network & internet, Advanced network settings):</Typography>
        <Typography size="xxs" as="code">Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private</Typography>
    </Container>
);

// What usually stops the computer that runs the model from reaching a lending one, and what to do, most likely first.
const UNREACHABLE_CHECKS = [
    ['FiShield', 'On a Mac that runs the model', 'macOS asks before an app may reach other computers on your network. Open System Settings, Privacy & Security, Local Network, and turn on Mollama.'],
    ['FiLock', 'A firewall on the lending computer', 'On Windows, allow Mollama when Windows asks, or in Windows Security, Firewall & network protection, Allow an app through firewall, tick Mollama for the network you are on. On a Mac, System Settings, Network, Firewall, Options, allow Mollama.'],
    ['FiLink', 'The cable or the Wi-Fi', 'Both computers must be on the same network: the same Wi-Fi, or the cable plugged in at both ends with its lights on. A guest Wi-Fi often keeps devices apart.'],
    ['FiPower', 'Both apps open and awake', 'The Mollama app must be open on both computers, and neither asleep. Reopening the app on the lending computer opens its gate again.'],
    ['FiRefreshCw', 'Then check again', 'Press Check again at the top of this card. The line under the computer says what was found.']
];
const WhyUnreachable = () => (
    <Container layout="flex-column" gap="xs" padding="none" width="100%">
        <Typography size="xs" weight="semibold">Why the computer that runs the model cannot reach it</Typography>
        {UNREACHABLE_CHECKS.map(([icon, title, text]) => (
            <Container key={title} layout="flex" align="start" gap="xs" padding="none" wrap={false}>
                <Badge size="xs" color="primary" width="20px" minWidth="20px" height="20px"><Icon name={icon} size="xs" color="contrast" /></Badge>
                <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                    <Typography size="xs" weight="semibold">{title}</Typography>
                    <Typography size="xs" color="muted">{text}</Typography>
                </Container>
            </Container>
        ))}
    </Container>
);

const PoolingCard = ({ pools, onPart, onCheck, checking, checkedAt }) => {
    const groups = pools?.groups || [];
    const left = pools?.left || [];
    return (
        <Card layout="flex-column" gap="sm" padding="md" width="100%" minWidth="0" span="full" hover={false}>
            <Heading icon="FiLayers" title="Pooling computers">
                <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                    {checkedAt && <Typography size="xxs" color="muted">Checked {checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Typography>}
                    <Button size="xs" color="secondary" disabled={checking} title="Read every connected computer's network again and check who can pool" onClick={onCheck}>
                        <Icon name="FiRefreshCw" size="xs" />{checking ? 'Checking…' : 'Check again'}
                    </Button>
                    <Badge size="xs" color="secondary" title="Needs the Mollama desktop app 1.0.8 or later on every pooled computer">Preview</Badge>
                </Container>
            </Heading>
            <Typography size="xs" color="muted">
                Several of your computers can share one model that none of them could hold alone. Mollama checks which of your computers are on the same network. Choose the computer that runs the model and let the others lend their memory. Once it reaches them, the pool appears in a chat's computer picker, with that computer's models.
            </Typography>
            {!pools && <Typography size="xs" color="muted">Checking your computers…</Typography>}
            {pools && groups.length === 0 && <Typography size="xs">None of your computers can pool right now.</Typography>}
            {groups.map((group) => (
                <Container key={group.network} layout="flex-column" gap="xs" padding="sm" width="100%" backgroundColor="surface-alt">
                    <Container layout="flex" justify="between" align="center" gap="xs" padding="none" width="100%">
                        <Container layout="flex" align="center" gap="xs" padding="none" minWidth="0">
                            <Icon name={group.via === 'cable' || group.wired ? 'FiLink' : 'FiWifi'} size="sm" color="primary" />
                            <Typography size="sm" weight="semibold">{group.via === 'cable' ? 'Joined by a direct cable' : group.wired ? 'On your home network, by cable' : 'On your home network, by Wi-Fi'}</Typography>
                        </Container>
                        {group.computers.some((one) => one.role === 'main') && group.computers.some((one) => one.role === 'lend') && group.computers.filter((one) => one.role === 'lend').every((one) => one.reachable === true)
                            ? <Badge size="xs" color="success" title="The computer that runs the model reached every computer lending its memory.">Ready to pool</Badge>
                            : <Badge size="xs" color="warning" title="Ready once the computer that runs the model reaches a computer lending its memory.">Not ready yet</Badge>}
                    </Container>
                    <Container layout="grid" columns={2} gap="sm" padding="none" width="100%">
                        {group.computers.map((one) => {
                            const status = poolStatus(one, group.computers.some((other) => other.id === pools.main));
                            const part = POOL_PARTS.find((entry) => entry.role === one.role) || POOL_PARTS[0];
                            return (
                                <Container key={one.id} layout="flex-column" gap="sm" padding="sm" width="100%" minWidth="0" backgroundColor="surface">
                                    <Container layout="flex" align="center" gap="xs" padding="none" width="100%" wrap={false}>
                                        <Icon name="FiMonitor" size="sm" color="primary" />
                                        <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                                            <Typography size="sm" weight="semibold" truncate>{one.name}</Typography>
                                            <Typography size="xxs" color="muted">{[one.gpuMemoryMb ? `${formatGb(one.gpuMemoryMb)} graphics` : null, `${formatGb(one.memoryMb)} memory`].filter(Boolean).join(' · ')}</Typography>
                                        </Container>
                                    </Container>
                                    <ButtonGroup size="xs" justify="start" selectable={false}>
                                        {POOL_PARTS.map((entry) => (
                                            <Button key={entry.role} size="xs" color={one.role === entry.role ? 'primary' : 'secondary'} selected={one.role === entry.role} title={entry.hint} onClick={() => one.role !== entry.role && onPart(one, entry.role)}>
                                                <Icon name={entry.icon} size="xs" />{entry.label}
                                            </Button>
                                        ))}
                                    </ButtonGroup>
                                    <Container layout="flex" align="start" gap="xs" padding="none" width="100%" wrap={false}>
                                        <Icon name={status ? STATUS_ICONS[status[1]] : 'FiInfo'} size="xs" color={status ? status[1] : 'secondary'} />
                                        <Typography size="xs" color="muted">{status ? status[0] : part.hint}</Typography>
                                    </Container>
                                    {one.reachable === false && (
                                        <Button size="xxs" color="secondary" genieTrigger="click" genie={{ trigger: 'click', width: '440px', padding: 'sm', content: <WhyUnreachable /> }}>
                                            <Icon name="FiHelpCircle" size="xs" />Why can't it be reached?
                                        </Button>
                                    )}
                                </Container>
                            );
                        })}
                    </Container>
                    <Container layout="grid" columns={2} gap="sm" padding="none" width="100%">
                        <Tile icon="FiZap" label="Graphics memory together" value={formatGb(group.combined.gpuMemoryMb)} />
                        <Tile icon="FiLayers" label="System memory together" value={formatGb(group.combined.memoryMb)} />
                    </Container>
                </Container>
            ))}
            {left.length > 0 && (
                <Container layout="flex-column" gap="xs" padding="none" width="100%">
                    {left.map((one) => (
                        <Container key={one.id} layout="flex" align="center" gap="xs" padding="none" width="100%">
                            <Typography size="xxs" color="muted">{`${one.name}: ${one.message}`}</Typography>
                            {one.reason === 'public' && (
                                <Button size="xxs" color="secondary" genieTrigger="click" genie={{ trigger: 'click', width: '420px', padding: 'sm', content: <MakePrivate name={one.name} /> }}>
                                    <Icon name="FiShield" size="xs" />How to make it Private
                                </Button>
                            )}
                        </Container>
                    ))}
                </Container>
            )}
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

    // A computer's part in a pool: lending its memory, or running the model with the others' memory.
    // A network check on demand: every connected computer is read again and checked for who can pool.
    const [poolCheck, setPoolCheck] = useState({ checking: false, at: null });
    const checkPools = async () => {
        setPoolCheck((now) => ({ ...now, checking: true }));
        try {
            const result = await deviceService.checkPools();
            setPools(result);
            setPoolCheck({ checking: false, at: new Date(result.checkedAt || Date.now()) });
        } catch (error) {
            setPoolCheck((now) => ({ ...now, checking: false }));
            notifyError(describeError(error, 'The network check could not be run.'));
        }
    };

    const setPoolPart = async (computer, role) => {
        try {
            setPools(await deviceService.setPoolRole(computer.id, role));
            if (role === 'lend') success(`${computer.name} will lend its memory. If pooling is not set up on it yet, it asks on that computer first.`);
            if (role === 'main') success(`${computer.name} now runs the model for the pool.`);
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
                        <Button key={id} size="xs" color={view === id ? 'primary' : 'secondary'} selected={view === id} onClick={() => id !== view && setParams(id === 'pooling' ? { view: id } : {})}><Icon name={icon} size="xs" />{label}</Button>
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

                {view === 'pooling' && devices?.length > 0 && <PoolingCard pools={pools} onPart={setPoolPart} onCheck={checkPools} checking={poolCheck.checking} checkedAt={poolCheck.at} />}
                {view === 'pooling' && <PoolGuide />}

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
