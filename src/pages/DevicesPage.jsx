import React, { useCallback, useEffect, useState } from 'react';
import { Page, Container, Card, Typography, Button, ButtonGroup, Badge, Icon, Input, Frame, Select, Divider } from '@components/Components';
import { useSearchParams } from 'react-router-dom';
import { useNotification } from '@contexts/NotificationContext';
import { deviceService, desktopService, skillService, describeError, formatGb, useGuide } from '../client/ai.client';

const ADD_STEPS = [
    'Download the Mollama desktop app on the computer you want to add.',
    'Install it, open it and sign in with this account.',
    'The computer appears on this page by itself, and its models can be used from any of your Mollama apps.'
];

// Pooling: what a person should know before pooling computers for one model. The primary computer runs the model;
// secondary computers lend it their memory.
const POOL_GUIDE = {
    steps: {
        label: 'How to pool',
        figure: 'setup',
        items: [
            'Install the Mollama desktop app on every computer you want to pool, and sign in with this account on each.',
            'Put them on the same home network, by cable if you can, or connect two of them with a direct network cable.',
            'Mollama finds the computers that can pool by itself and lists them here.',
            'Choose each computer\'s part below. The first time, the desktop app on that computer asks before it sets pooling up.',
            'Choose the primary computer, which holds the model and runs it: the one with the largest graphics card, and room on its disk for the model. Set the others as secondary computers, which lend it their memory.',
            'Download the model on the primary computer, then choose the pool in a chat.'
        ]
    },
    wiring: {
        label: 'Wiring',
        figure: 'wired',
        items: [
            'Wi-Fi works too, with nothing to buy: put the computers on the same home Wi-Fi, close to the router and on its 5 GHz or 6 GHz band. Mollama lists them here the same way.',
            'What Wi-Fi costs: its delay comes and goes, so replies are slower and less even (about 6.5 words a second against 7.5 on a cable, measured on the owner\'s two computers), and the first start sends the whole model through the air, which can take much longer.',
            'What Wi-Fi risks: a weak signal, or a laptop that sleeps or moves to another access point, drops the pool and stops the reply. A guest network or some mesh systems keep devices apart, so the computers never find each other. Pooled computers talk openly, so use only Wi-Fi you own that has a password, never shared or public Wi-Fi.',
            'Most reliable: plug the computers into a small router or network switch, even an old one with no internet. Each gets a proper address and Windows remembers the network as Private, so it stays pooled after a replug. A cable straight between two computers is an "unidentified network" that Windows sets back to Public each time it is plugged in.',
            'The cable: an Ethernet network cable, Cat 6 or Cat 5e, the kind with clear square plugs that goes into a router. One to three metres is plenty. Plugged straight into both computers\' network ports, it works for any mix of computers; no special crossover cable is needed.',
            'A laptop without a network port needs a USB-C network adapter. An adapter with a USB-A plug fits a USB-C laptop through a small USB-C to USB-A adapter, not a USB-A to USB-C cable.',
            'Choose a USB 3 adapter, 1 Gb or 2.5 Gb. A USB 2 adapter is no faster than good Wi-Fi.',
            'Two cables can be joined with a small inline coupler, or both plugged into your router or a network switch.',
            'Two Macs can use one Thunderbolt cable: a real Thunderbolt or 40 Gb USB4 cable, not a charging cable. Between a Mac and a PC, use network adapters.',
            'A plain USB-C cable between two computers is not a network and does not work.',
            'A small personal or travel router makes a private network of your own with no subscription: plug the computers into it. Each computer still needs the internet to reach Mollama, so keep them on your Wi-Fi too, or let the small router share an internet connection.',
            'On a direct cable Windows may call the new network Public. The computers can still pool, but set it to Private in Windows settings if that PC is to be a secondary computer.'
        ]
    },
    benefits: {
        label: 'Benefits',
        figure: 'shelf',
        items: [
            'Runs models no single computer of yours can hold, using the memory of all of them.',
            'Puts memory to work that sits idle on your other computers.',
            'Only the primary computer downloads the model. The secondary computers lend their memory and keep no copy of it.',
            'Measured on two of the owner\'s computers over Wi-Fi: a 33B model wrote about 2.8 times faster pooled than on one computer alone.'
        ]
    },
    risks: {
        label: 'Risks',
        figure: 'gate',
        items: [
            'Pool only at home, or on a network you trust. Pooled computers talk to each other openly, so on public or shared Wi-Fi someone nearby could listen in. Mollama never pools on a network Windows marks Public, and a secondary computer answers only the primary computer.',
            'Every computer in the pool has to stay on: if one sleeps, loses its network or is turned off, the reply stops.',
            'Pooling a model that fits one computer makes it slower, not faster: a small model wrote 11 words a second pooled against 52 on one computer.',
            'A secondary computer is busy and warm while a pooled model runs.'
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
            'Keep every pooled computer plugged in while a pooled model runs. The desktop app keeps it awake.',
            'Pool two or three computers, not more: each one adds a step to every word.',
            'The first start sends the model to the other computers and takes minutes; later starts take about a minute.',
            'Set the computers to Not pooled when you are done.'
        ]
    }
};

// The part each computer plays: primary (holds the model and runs it), secondary (lends its memory) or left out.
const POOL_PARTS = [
    { role: 'main', label: 'Primary computer', hint: 'It holds the model and runs it, using the memory the secondary computers lend. Choose the one with the largest graphics card.' },
    { role: 'lend', label: 'Secondary computer', hint: 'Its memory helps the primary computer. It needs no copy of the model.' },
    { role: 'off', label: 'Not pooled', hint: 'This computer is not part of the pool.' }
];
const STATUS_ICONS = { warning: 'FiAlertTriangle', error: 'FiXCircle', success: 'FiCheckCircle', primary: 'FiCpu', secondary: 'FiClock' };
// What a computer in a pool is doing now, in a few words, and the colour of its badge.
const poolStatus = (one, hasMain) => {
    if (one.role === 'off') return null;
    if (!one.known) return ['Its desktop app cannot pool yet: pooling comes with the next Mollama desktop app release.', 'warning'];
    if (one.setup === 'asking') return ['Waiting for you to agree on that computer to set up pooling.', 'warning'];
    if (one.setup === 'downloading') return [`Setting up pooling${one.progress ? `, ${Math.round(one.progress * 100)}%` : ''}…`, 'secondary'];
    if (['declined', 'failed', 'unsupported'].includes(one.setup) || (one.detail && !one.lending)) return [one.detail || 'Pooling could not be set up on it.', 'error'];
    if (one.role === 'main') return ['Holds the model and runs it, with the memory the secondary computers lend.', 'primary'];
    if (!hasMain) return ['Ready to lend its memory. Choose which computer on this network is the primary one.', 'secondary'];
    if (one.reachable === false) return [one.detail || 'The primary computer cannot reach it.', 'error'];
    if (one.reachable === true) return ['Lending its memory. The primary computer reaches it.', 'success'];
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
    if (page.failed) return <Typography size="xs" color="muted">The drawing could not be loaded.</Typography>;
    if (!page.html) return <Typography size="xs" color="muted">Drawing…</Typography>;
    return <Frame html={page.html} title={title} width="100%" height="440px" maxHeight="760px" variables={FIGURE_PALETTE} dressed fit />;
};

// Every list is marked the same way: numbered for the steps and with the part's own mark otherwise.
const POOL_MARK = { wiring: 'FiLink', benefits: 'FiCheck', risks: 'FiAlertTriangle', tips: 'FiInfo' };

const GuideRows = ({ items, mark = null, size = 'sm' }) => (
    <Container layout="flex-column" gap="sm" padding="none" width="100%" minWidth="0">
        {items.map((item, index) => (
            <Container key={item} layout="flex" align="baseline" gap="sm" padding="none" width="100%" wrap={false}>
                <Container padding="none" minWidth="1.25rem">
                    {mark ? <Icon name={mark} size="xs" color="primary" /> : <Typography size={size} color="muted">{`${index + 1}.`}</Typography>}
                </Container>
                <Typography size={size}>{item}</Typography>
            </Container>
        ))}
    </Container>
);

const PoolGuide = ({ onBack }) => {
    const [tab, setTab] = useState('steps');
    const part = POOL_GUIDE[tab];
    return (
        <Container as="section" layout="flex-column" gap="md" padding="none" width="100%" minWidth="0">
            <Heading title="Pooling, step by step">
                <Button size="sm" variant="ghost" onClick={onBack}><Icon name="FiArrowLeft" />Back to the summary</Button>
            </Heading>
            <ButtonGroup size="sm" justify="start" selectable={false}>
                {Object.entries(POOL_GUIDE).map(([key, one]) => (
                    <Button key={key} size="sm" selected={tab === key} onClick={() => setTab(key)}>{one.label}</Button>
                ))}
            </ButtonGroup>
            <Container layout="grid" columns={2} gap="xl" padding="none" width="100%">
                <Container layout="flex-column" gap="none" padding="none" width="100%" minWidth="0">
                    <PoolFigure key={part.figure} name={part.figure} title={part.label} />
                </Container>
                <GuideRows items={part.items} mark={POOL_MARK[tab]} />
            </Container>
        </Container>
    );
};

// The same guide as plain text under the pool itself. Wiring is long and is read beside its drawing.
const POOL_NOTES = ['steps', 'benefits', 'risks', 'tips'];
const PoolNotes = ({ onDrawings }) => (
    <Container layout="flex-column" gap="lg" padding="none" width="100%" minWidth="0">
        {POOL_NOTES.map((key) => (
            <React.Fragment key={key}>
                <Divider />
                <Container layout="flex" align="start" gap="lg" padding="none" width="100%">
                    <Typography as="h3" size="sm" weight="semibold" width="12rem">{POOL_GUIDE[key].label}</Typography>
                    <Container padding="none" flexFill minWidth="17rem" maxWidth="760px">
                        <GuideRows items={POOL_GUIDE[key].items} mark={POOL_MARK[key]} />
                    </Container>
                </Container>
            </React.Fragment>
        ))}
        <Divider />
        <Container layout="flex" padding="none" width="100%">
            <Button size="sm" onClick={onDrawings}>Show the wiring guide and drawings<Icon name="FiArrowRight" /></Button>
        </Container>
    </Container>
);

// Windows marks a network Public until told otherwise, and Mollama never pools on one. This is how a person changes it.
const PRIVATE_STEPS = [
    'Do this only on a network you own and trust, such as your home Wi-Fi. Private lets other devices on that network see the computer.',
    'On that computer, open Settings, then Network & internet.',
    'Choose Wi-Fi (or Ethernet, for a cable), then the network it is connected to.',
    'Under Network profile type, choose Private network.',
    'Come back here and press Check again.'
];
// One line for an ordinary PowerShell window: it opens an administrator one (Windows asks first) to make that connection Private.
const privateCommand = (network) => `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command Set-NetConnectionProfile -InterfaceAlias ''${network.replace(/'/g, "''''")}'' -NetworkCategory Private'`;
const MakePrivate = ({ name, networks = [] }) => {
    const [copied, setCopied] = useState(null);
    const copy = async (network) => {
        try {
            await navigator.clipboard.writeText(privateCommand(network));
            setCopied(network);
        } catch {
            setCopied(null);
        }
    };
    return (
        <Container layout="flex-column" gap="sm" padding="none" width="100%">
            <Typography size="sm" weight="semibold">{`Set ${name}'s network to Private`}</Typography>
            {networks.length > 0 && (
                <>
                    <Typography size="xs" color="muted">{`The quickest way, on ${name}: paste this into PowerShell and allow it when Windows asks.`}</Typography>
                    {networks.map((network) => (
                        <Container key={network} layout="flex" align="center" gap="sm" padding="none" width="100%" wrap={false}>
                            <Container padding="none" flexFill minWidth="0">
                                <Typography size="xs" as="code" font="monospace" truncate title={privateCommand(network)}>{privateCommand(network)}</Typography>
                            </Container>
                            <Button size="xs" onClick={() => copy(network)}><Icon name={copied === network ? 'FiCheck' : 'FiCopy'} />{copied === network ? 'Copied' : 'Copy'}</Button>
                        </Container>
                    ))}
                    <Typography size="xs" color="muted">Or in Windows settings:</Typography>
                </>
            )}
            {PRIVATE_STEPS.map((step, index) => (
                <Container key={step} layout="flex" align="baseline" gap="sm" padding="none" width="100%" wrap={false}>
                    <Container padding="none" minWidth="1.25rem">
                        {index === 0 ? <Icon name="FiAlertTriangle" size="xs" color="warning" /> : <Typography size="xs" color="muted">{`${index}.`}</Typography>}
                    </Container>
                    <Typography size="xs">{step}</Typography>
                </Container>
            ))}
            <Typography size="xxs" color="muted">Then press Check again in the pooling section.</Typography>
        </Container>
    );
};

// What usually stops the primary computer from reaching a secondary one, and what to do, most likely first.
const UNREACHABLE_CHECKS = [
    ['FiShield', 'On a Mac that is the primary computer', 'macOS asks before an app may reach other computers on your network. Open System Settings, Privacy & Security, Local Network, and turn on Mollama.'],
    ['FiLock', 'A firewall on the secondary computer', 'On Windows, allow Mollama when Windows asks, or in Windows Security, Firewall & network protection, Allow an app through firewall, tick Mollama for the network you are on. On a Mac, System Settings, Network, Firewall, Options, allow Mollama.'],
    ['FiLink', 'The cable or the Wi-Fi', 'Both computers must be on the same network: the same Wi-Fi, or the cable plugged in at both ends with its lights on. A guest Wi-Fi often keeps devices apart.'],
    ['FiPower', 'Both apps open and awake', 'The Mollama app must be open on both computers, and neither asleep. Reopening the app on the secondary computer opens its gate again.'],
    ['FiRefreshCw', 'Then check again', 'Press Check again at the top of the pooling section. The line under the computer says what was found.']
];
const WhyUnreachable = () => (
    <Container layout="flex-column" gap="sm" padding="none" width="100%">
        <Typography size="sm" weight="semibold">Why the primary computer cannot reach it</Typography>
        {UNREACHABLE_CHECKS.map(([icon, title, text]) => (
            <Container key={title} layout="flex" align="baseline" gap="sm" padding="none" width="100%" wrap={false}>
                <Container padding="none" minWidth="1.25rem">
                    <Icon name={icon} size="xs" color="primary" />
                </Container>
                <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                    <Typography as="p" size="xs" weight="semibold">{title}</Typography>
                    <Typography as="p" size="xs" color="muted">{text}</Typography>
                </Container>
            </Container>
        ))}
    </Container>
);

const STATUS_TONES = ['success', 'warning', 'error'];

const PoolSection = ({ pools, onPart, onCheck, checking, checkedAt, children }) => {
    const groups = pools?.groups || [];
    const left = pools?.left || [];
    return (
        <Container as="section" layout="flex-column" gap="lg" padding="none" width="100%" minWidth="0">
            <Container layout="flex-column" gap="sm" padding="none" width="100%">
                <Heading title="Pooling computers" badge={<Badge size="xs" title="Needs the Mollama desktop app 1.0.8 or later on every pooled computer">Preview</Badge>}>
                    <Container layout="flex" align="center" gap="sm" padding="none" wrap={false}>
                        {checkedAt && <Typography size="xxs" color="muted">Checked {checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Typography>}
                        <Button size="sm" disabled={checking} title="Read every connected computer's network again and check who can pool" onClick={onCheck}>
                            <Icon name="FiRefreshCw" />{checking ? 'Checking…' : 'Check again'}
                        </Button>
                    </Container>
                </Heading>
                <Typography as="p" size="sm" maxWidth="760px">
                    Several of your computers can share one model that none of them could hold alone: a primary computer holds the model and runs it, and the secondary computers lend it their memory.
                </Typography>
            </Container>
            {!pools && <Typography size="xs" color="muted">Checking your computers…</Typography>}
            {pools && groups.length === 0 && <Typography size="sm" weight="semibold">None of your computers can pool right now.</Typography>}
            {groups.map((group) => {
                const ready = group.computers.some((one) => one.role === 'main') && group.computers.some((one) => one.role === 'lend') && group.computers.filter((one) => one.role === 'lend').every((one) => one.reachable === true);
                const main = group.computers.find((one) => one.role === 'main');
                return (
                    <Container key={group.network} layout="flex-column" gap="md" padding="none" width="100%">
                        <Divider />
                        <Container layout="flex-column" gap="xs" padding="none" width="100%">
                            <Container layout="flex" align="center" gap="sm" padding="none" width="100%">
                                <Icon name={group.via === 'cable' || group.wired ? 'FiLink' : 'FiWifi'} size="sm" color="primary" />
                                <Typography as="h3" size="sm" weight="semibold">{group.via === 'cable' ? 'Joined by a direct cable' : group.wired ? 'On your home network, by cable' : 'On your home network, by Wi-Fi'}</Typography>
                                {ready
                                    ? <Badge size="xs" color="success" title="The primary computer reached every secondary computer.">Ready to pool</Badge>
                                    : <Badge size="xs" color="warning" title="Ready once the primary computer reaches a secondary computer.">Not ready yet</Badge>}
                            </Container>
                            <Typography as="p" size="xs" color="muted">
                                {main ? `${main.name} is the primary computer. ` : 'No primary computer is chosen yet. '}
                                {ready ? 'It reached every secondary computer, so the pool appears in a chat\'s computer picker. ' : 'Ready once the primary computer reaches a secondary computer. '}
                                {`Together: ${formatGb(group.combined.gpuMemoryMb)} of graphics memory and ${formatGb(group.combined.memoryMb)} of system memory.`}
                            </Typography>
                        </Container>
                        {group.computers.map((one) => {
                            const status = poolStatus(one, group.computers.some((other) => other.id === pools.main));
                            const part = POOL_PARTS.find((entry) => entry.role === one.role) || POOL_PARTS[0];
                            return (
                                <Container key={one.id} layout="flex" justify="between" align="center" gap="md" padding="none" width="100%">
                                    <Container layout="flex-column" gap="xs" padding="none" flexFill minWidth="16rem">
                                        <Container layout="flex" align="baseline" gap="sm" padding="none" width="100%">
                                            <Typography size="sm" weight="semibold">{one.name}</Typography>
                                            <Typography size="xxs" color="muted">{[one.gpuMemoryMb ? `${formatGb(one.gpuMemoryMb)} graphics` : null, `${formatGb(one.memoryMb)} memory`].filter(Boolean).join(' · ')}</Typography>
                                        </Container>
                                        <Container layout="flex" align="baseline" gap="xs" padding="none" width="100%" wrap={false}>
                                            <Icon name={status ? STATUS_ICONS[status[1]] : 'FiInfo'} size="xs" color={status && STATUS_TONES.includes(status[1]) ? status[1] : 'primary'} />
                                            <Typography size="xs" color="muted">{status ? status[0] : part.hint}</Typography>
                                        </Container>
                                        {one.reachable === false && (
                                            <Button size="xs" variant="ghost" genieTrigger="click" genie={{ trigger: 'click', width: '440px', padding: 'md', content: <WhyUnreachable /> }}>
                                                <Icon name="FiHelpCircle" />Why can't it be reached?
                                            </Button>
                                        )}
                                    </Container>
                                    <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                                        <Select
                                            size="sm"
                                            variant="outline"
                                            width="18rem"
                                            aria-label={`${one.name}'s part in the pool`}
                                            value={one.role}
                                            options={POOL_PARTS.map((entry) => {
                                                const taken = entry.role === 'main' && pools.main && pools.main !== one.id;
                                                return { value: entry.role, label: taken ? `${entry.label} (another computer is)` : entry.label, disabled: Boolean(taken) };
                                            })}
                                            onChange={(role) => role && role !== one.role && onPart(one, role)}
                                        />
                                        <Button size="sm" variant="ghost" disabled={checking} title={checking ? 'Checking the pool…' : 'Try the pool connection again'} onClick={onCheck}>
                                            <Icon name="FiRefreshCw" />
                                        </Button>
                                    </Container>
                                </Container>
                            );
                        })}
                    </Container>
                );
            })}
            {left.length > 0 && (
                <Container layout="flex-column" gap="sm" padding="none" width="100%">
                    <Divider />
                    {left.map((one) => (
                        <Container key={one.id} layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%">
                            <Container padding="none" flexFill minWidth="16rem">
                                <Typography size="sm" weight="semibold">{`${one.name}: `}</Typography>
                                <Typography size="xs" color="muted">{one.message}</Typography>
                            </Container>
                            {one.reason === 'public' && (
                                <Button size="xs" genieTrigger="click" genie={{ trigger: 'click', width: '460px', padding: 'md', content: <MakePrivate name={one.name} networks={one.publicNetworks} /> }}>
                                    <Icon name="FiShield" />How to make it Private
                                </Button>
                            )}
                        </Container>
                    ))}
                </Container>
            )}
            {children}
        </Container>
    );
};

const Fact = ({ label, value, note = null }) => (
    <Container layout="flex" align="baseline" gap="sm" padding="none" width="100%" wrap={false}>
        <Typography as="p" size="xs" color="muted" width="8rem" minWidth="8rem">{label}</Typography>
        <Container padding="none" flexFill minWidth="0">
            <Typography size="xs">{value}</Typography>
            {note && <Typography size="xs" color="muted">{` · ${note}`}</Typography>}
        </Container>
    </Container>
);

const Heading = ({ title, badge = null, children }) => (
    <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%">
        <Container layout="flex" align="center" gap="sm" padding="none" minWidth="0">
            <Typography as="h2" size="md" weight="semibold" font="secondary">{title}</Typography>
            {badge}
        </Container>
        {children}
    </Container>
);

// One pattern for the state of a list: what is the case, what to do about it, and one button.
const Notice = ({ title, text = null, children }) => (
    <Container layout="flex-column" gap="sm" padding="none" width="100%">
        <Container layout="flex-column" gap="xs" padding="none" width="100%" maxWidth="640px">
            <Typography as="p" size="sm" weight="semibold">{title}</Typography>
            {text && <Typography as="p" size="xs" color="muted">{text}</Typography>}
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
        <Container layout="flex-column" gap="md" padding="none" width={vertical ? 'auto' : '100%'}>
            {channels.map((channel) => (
                <Container key={channel.id} layout="flex-column" gap="sm" padding="none" width="100%">
                    {channels.length > 1 && (
                        <Container layout="flex" align="center" gap="sm" padding="none">
                            <Typography as="h3" size="sm" weight="semibold">{channel.title}</Typography>
                            <Badge size="xs" color={channel.id === 'staging' ? 'warning' : 'success'}>{channel.opens}</Badge>
                        </Container>
                    )}
                    {desktopService.systems.map((system) => {
                        const file = `${channel.name}${system.ending}`;
                        return (
                            <Container key={system.id} layout="flex" justify="between" align="center" gap="md" padding="none" width="100%" wrap={false}>
                                <Container layout="flex" align="center" gap="sm" padding="none" minWidth="0" wrap={false}>
                                    <Icon name={system.icon} size="sm" color="primary" />
                                    <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                                        <Typography size="sm" weight="semibold">{system.label}</Typography>
                                        {(!ready(file) || published?.version) && <Typography size="xxs" color="muted">{!ready(file) ? 'Not available yet' : `Version ${published.version}`}</Typography>}
                                    </Container>
                                </Container>
                                <Button size="xs" disabled={!ready(file)} aria-label={`Download for ${system.label}`} onClick={() => window.open(desktopService.address(file), '_blank', 'noopener')}>
                                    <Icon name="FiDownload" />Download
                                </Button>
                            </Container>
                        );
                    })}
                </Container>
            ))}
        </Container>
    );
};

const AddComputer = () => (
    <Container layout="flex-column" gap="md" padding="none" width="100%">
        <Typography as="h2" size="md" weight="semibold" font="secondary">Add a computer</Typography>
        <GuideRows items={ADD_STEPS} />
        <Divider />
        <DesktopDownloads />
    </Container>
);

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
        <Container layout="flex" align="center" gap="sm" padding="none" width="100%">
            <Typography as="p" size="xs" color="muted" width="8rem" minWidth="8rem">Mollama app</Typography>
            <Badge size="xs" color={ready ? 'warning' : 'default'} title={ready ? `Version ${published.version} is available` : undefined}>Version {current}</Badge>
            {ready ? (
                <Button size="xs" title="Downloads the installer in your browser. Run it to update; your sign-in and settings stay." onClick={() => window.open(desktopService.address(file), '_blank', 'noopener')}>
                    <Icon name="FiDownload" />Update to {published.version}
                </Button>
            ) : (
                <Button size="xs" disabled={checking} title={published && !published.version ? 'The list of versions could not be read just now.' : published ? 'This is the newest version.' : undefined} onClick={check}>
                    <Icon name={checking ? 'FiLoader' : 'FiRefreshCw'} />{checking ? 'Checking…' : published && !published.version ? 'Could not check' : published ? 'Up to date' : 'Check for updates'}
                </Button>
            )}
        </Container>
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

    const hasFoot = device.kind !== 'local' || (here && device.online && !device.paused && !ollama.available) || (canManage && !editing);

    return (
        <Card layout="flex-column" gap="md" padding="lg" width="100%" minWidth="0" hover={false}>
            <Container layout="flex" align="center" gap="sm" padding="none" width="100%">
                <Typography as="h3" size="sm" weight="semibold" truncate>{device.name}</Typography>
                {deviceService.ready(device) && <Icon name="FiCheckCircle" size="sm" color="success" title="Ready to use right now" aria-label="Ready to use right now" />}
                <Badge size="xs" color={device.paused ? 'warning' : device.online ? 'success' : 'default'}>{device.paused ? 'Paused' : device.online ? 'Online' : 'Offline'}</Badge>
                {device.online && !device.paused && (
                    <Badge size="xs" color={ollama.available ? 'success' : 'error'}>
                        {ollama.available ? `Ollama ${ollama.version}` : 'Ollama is not running'}
                    </Badge>
                )}
                {device.edited && <Badge size="xs" color="warning">Corrected by hand</Badge>}
            </Container>
            <Typography size="xxs" color="muted">
                {device.kind === 'local' ? 'The computer Mollama is running on.' : 'Linked through the Mollama desktop app.'}
                {!device.online && ' Open the Mollama desktop app on it to bring it online, or remove it if that computer is no longer yours to use.'}
                {device.paused && ' Paused: it stays connected but is given no work, and its models are out of memory, until you resume it.'}
                {device.online && !device.paused && !ollama.available && (here ? ' Ollama is not running here. Set up Ollama installs it if needed and starts it.' : ' Start Ollama on that computer, or open Mollama on it and choose Set up Ollama.')}
            </Typography>

            {!editing && (
                <Container layout="flex-column" gap="xs" padding="none" width="100%" flexFill>
                    <Fact
                        label={hardware.gpuShared ? 'Graphics' : 'Graphics card'}
                        value={!hardware.hasGpu ? 'None found' : hardware.gpuShared ? 'Built in' : (hardware.gpuName || 'Graphics card')}
                        note={!hardware.hasGpu
                            ? 'Models run on the processor, which is slower'
                            : hardware.gpuShared
                                ? `Shares the ${formatGb(hardware.memoryMb)} of system memory. About ${formatGb(hardware.gpuMemoryMb)} of it can hold a model (an estimate).`
                                : `${formatGb(hardware.gpuMemoryMb)} of graphics memory`}
                    />
                    <Fact label="System memory" value={formatGb(hardware.memoryMb)} />
                    <Fact
                        label="Free disk"
                        value={hardware.diskFreeMb === null ? 'Unknown' : `${formatGb(hardware.diskFreeMb)} free`}
                        note={hardware.diskTotalMb ? `of ${formatGb(hardware.diskTotalMb)}` : null}
                    />
                    <Fact
                        label="Processor"
                        value={hardware.cpu || 'Unknown'}
                        note={hardware.cpuThreads ? `${hardware.cpuThreads} threads` : null}
                    />
                    <Fact
                        label="Models installed"
                        value={ollama.available ? String(ollama.modelCount) : 'Unknown'}
                        note={ollama.available && ollama.modelCount === 0 ? 'None yet' : null}
                    />
                    {here && <AppUpdate />}
                </Container>
            )}

            {editing && (
                <Container layout="flex-column" gap="sm" padding="none" width="100%" flexFill>
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
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
                        {device.edited && (
                            <Button size="sm" variant="ghost" onClick={useDetected} disabled={busy}>Use what Mollama reads</Button>
                        )}
                    </Container>
                </Container>
            )}

            {hasFoot && (
                <>
                    <Divider />
                    <Container layout="flex" gap="xs" padding="none" width="100%">
                        {canManage && !editing && (
                            <>
                                <Button size="xs" variant="ghost" onClick={readAgain} disabled={busy} {...guide.tip('devices.read')}>
                                    <Icon name="FiRefreshCw" />{busy ? 'Reading…' : 'Read this computer again'}
                                </Button>
                                <Button size="xs" variant="ghost" onClick={startEditing} disabled={busy} {...guide.tip('devices.correct')}>
                                    <Icon name="FiEdit2" />Correct these details
                                </Button>
                            </>
                        )}
                        {here && device.online && !device.paused && !ollama.available && <Button size="xs" variant="ghost" onClick={onSetUp}>Set up Ollama</Button>}
                        {device.kind !== 'local' && (device.online || device.paused) && (
                            <Button size="xs" variant="ghost" onClick={() => onPause(device)}>
                                <Icon name={device.paused ? 'FiPlay' : 'FiPause'} />{device.paused ? 'Resume' : 'Pause'}
                            </Button>
                        )}
                        {device.kind !== 'local' && !here && <Button size="xs" variant="ghost" color="error" onClick={() => onRemove(device)}><Icon name="FiTrash2" />Remove</Button>}
                    </Container>
                </>
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
    const [drawings, setDrawings] = useState(false);
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

    // A computer's part in a pool: secondary (lends its memory) or primary (runs the model with the others' memory).
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
            if (role === 'lend') success(`${computer.name} is now a secondary computer and will lend its memory. If pooling is not set up on it yet, it asks on that computer first.`);
            if (role === 'main') success(`${computer.name} is now the primary computer: it runs the model for the pool.`);
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

    const addComputer = { trigger: 'click', variant: 'popover', width: '480px', padding: 'lg', content: <AddComputer /> };
    const pooling = drawings ? <PoolGuide onBack={() => setDrawings(false)} /> : <PoolNotes onDrawings={() => setDrawings(true)} />;

    return (
        <Page
            title="Devices"
            lead={`The computers that run your AI models. Mollama reads each one so it can tell you which models fit.${devices && !canManage ? " Only an admin or owner can correct a device's details." : ''}`}
            gap="xl"
            background="dots"
            backgroundFade="bottom"
            actions={(
                <Container layout="flex" align="center" gap="sm" padding="none" wrap={false}>
                    <Button size="sm" onClick={load}><Icon name="FiRefreshCw" />Refresh</Button>
                    <Button size="sm" color="secondary" variant="solid" genie={addComputer}><Icon name="FiPlus" />Add a computer</Button>
                </Container>
            )}
        >
            <ButtonGroup size="sm" justify="start" selectable={false}>
                {[['computers', 'Computers', 'FiMonitor'], ['pooling', 'Pooling', 'FiLayers']].map(([id, label, icon]) => (
                    <Button key={id} size="sm" selected={view === id} onClick={() => id !== view && setParams(id === 'pooling' ? { view: id } : {})}><Icon name={icon} />{label}</Button>
                ))}
            </ButtonGroup>

            {devices === null && !failed && <Notice title="Reading this computer…" />}

            {failed && (
                <Notice title="Your devices could not be loaded." text="Check your connection, then try again.">
                    <Button size="sm" onClick={load}>Try again</Button>
                </Notice>
            )}

            {devices?.length === 0 && (
                <Notice title="No device is connected to your account yet." text="Install the Mollama desktop app on a computer and sign in. That computer appears here by itself, and its models can then be used from any of your Mollama apps.">
                    <Button size="sm" genie={addComputer}><Icon name="FiPlus" />Add a computer</Button>
                </Notice>
            )}

            {view === 'pooling' && (devices?.length > 0
                ? <PoolSection pools={pools} onPart={setPoolPart} onCheck={checkPools} checking={poolCheck.checking} checkedAt={poolCheck.at}>{pooling}</PoolSection>
                : pooling)}

            {view === 'computers' && devices?.length > 0 && (
                <Container layout="grid" columns="auto-lg" gap="lg" align="stretch" padding="none" width="100%">
                    {devices.map((device) => (
                        <DeviceCard key={device.id} device={device} canManage={canManage} onChanged={replaceDevice} onRemove={removeDevice} onPause={pauseDevice} here={device.id === here} onSetUp={setUpOllama} />
                    ))}
                </Container>
            )}
        </Page>
    );
};

export default DevicesPage;
