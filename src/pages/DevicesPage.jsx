import React, { useCallback, useEffect, useState } from 'react';
import { Page, Container, Card, Typography, Button, ButtonGroup, Badge, Icon, Input, Frame, Select, Divider, Switch, Data, Genie } from '@components/Components';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useNotification } from '@contexts/NotificationContext';
import { deviceService, desktopService, rentalService, skillService, describeError, formatGb, useGuide } from '../client/ai.client';
import { formatMoney } from '../client/billing.client';
import { layoutItems } from '@components/Flow';


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
            'Choose each computer\'s part in the pooling list. The first time, the desktop app on that computer asks before it sets pooling up.',
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

const PoolGuide = () => {
    const [tab, setTab] = useState('steps');
    const part = POOL_GUIDE[tab];
    return (
        <Container as="section" layout="flex-column" gap="md" padding="none" width="100%" minWidth="0">
            <Heading title="Pooling, step by step" />
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

// ---------------------------------------------------------------------------------------------
// Pooling, drawn: every computer on the account stands on one floor as what it is, joined by the cables and Wi-Fi the
// checks found. A computer is clicked to choose its part; a warning mark says what is wrong with a link when pointed at.
// The drawing is the library's Hairline kernel run in the page, so clicks and pointing reach the app.
// ---------------------------------------------------------------------------------------------
let hairlineKernel = null;
const loadHairline = () => {
    if (!hairlineKernel) {
        hairlineKernel = kitFile('kernel.js').then((code) => new Function(`${code}\nreturn HL;`)());
        hairlineKernel.catch(() => { hairlineKernel = null; });
    }
    return hairlineKernel;
};
const POOL_STYLE = `
[data-hairline="pool"]{--hairline-plate:var(--background-color);--hairline-hi:var(--text-color);--hairline-edge:var(--text-muted);--hairline-mid:var(--border-color);--hairline-lo:var(--border-light);aspect-ratio:auto;width:100%;margin:0 auto;color:var(--text-color)}
[data-hairline="pool"]>svg{position:static;width:100%;height:auto;max-height:78vh;overflow:visible}
[data-hairline="pool"] .pool-pc{transition:transform 260ms cubic-bezier(.32,.72,0,1)}
[data-hairline="pool"] .pool-pc.up{transform:translateY(-2.5px)}
[data-hairline="pool"] .pool-dim path{stroke:var(--border-color)}
[data-hairline="pool"] .pool-main path{stroke:var(--primary-color)}
[data-hairline="pool"] .pool-lend path{stroke:var(--secondary-color)}
[data-hairline="pool"] path.pool-works{stroke:var(--success-color)}
[data-hairline="pool"] path.pool-warning{stroke:var(--warning-color)}
[data-hairline="pool"] path.pool-error{stroke:var(--error-color)}
[data-hairline="pool"] path.pool-on{stroke-width:1.8px}
[data-hairline="pool"] path.pool-on.pool-plain{stroke:var(--hl-hi)}
[data-hairline="pool"] .pool-hit{fill:transparent;stroke:none;cursor:pointer;outline:none}
[data-hairline="pool"] .pool-hit:focus-visible{stroke:var(--primary-color);stroke-dasharray:2 2}
[data-hairline="pool"] text{fill:var(--text-color);stroke:none;font-family:var(--font-family);pointer-events:none}
[data-hairline="pool"] text.muted{fill:var(--text-muted)}
[data-hairline="pool"] .pool-warn{fill:var(--warning-color);stroke:var(--background-color);stroke-width:1.2px;cursor:pointer;outline:none}
[data-hairline="pool"] .pool-warn.error{fill:var(--error-color)}
[data-hairline="pool"] .pool-warn-mark.error{fill:var(--error-contrast-color)}
[data-hairline="pool"] .pool-warn-mark{fill:var(--warning-contrast-color);stroke:none;pointer-events:none}
[data-hairline="pool"] .pool-flow{fill:var(--primary-color);stroke:none;pointer-events:none}
@media (prefers-reduced-motion:reduce){[data-hairline="pool"] .pool-pc{transition:none}}
`;
const useHairline = () => {
    const [HL, setHL] = useState(null);
    useEffect(() => {
        let live = true;
        loadHairline().then((kernel) => {
            if (!live) return;
            kernel.inject(document);
            if (!document.querySelector('style[data-pool-style]')) {
                const style = document.createElement('style');
                style.setAttribute('data-pool-style', '');
                style.textContent = POOL_STYLE;
                document.head.appendChild(style);
            }
            setHL(kernel);
        }, () => live && setHL(false));
        return () => { live = false; };
    }, []);
    return HL;
};

// Where each kind of computer stands, around its own x: [left, right, back, front, height]. Its links attach to its
// sides and its top, and the box is its hit area.
const FOOT = { laptop: [-17, 17, -12, 12, 24], tablet: [-15, 15, -13, 10, 22], allinone: [-21, 21, -6.2, 13, 36], mini: [-21, 32, -6.2, 14, 33], desktop: [-19, 37, -12, 13, 33] };
const footOf = (form) => FOOT[form] || FOOT.laptop;
const anchorsOf = (form, x, y, z0) => {
    const [x0, x1, y0, y1, h] = footOf(form);
    return {
        top: [x, y + (y0 + Math.min(y1, -2)) / 2, z0 + h],
        foot: [x + x0, x + x1, y + y0, y + y1],
        middle: [x + (x0 + x1) / 2, y + (y0 + y1) / 2],
        label: [x + (x0 + x1) / 2, y + y1 + 6, 0],
        corners: [x0, x1].flatMap((cx) => [y0, y1].flatMap((cy) => [[x + cx, y + cy, 0], [x + cx, y + cy, z0 + h]]))
    };
};
const REASON_SHORT = { offline: 'Offline', paused: 'Paused', update: 'Needs an update', public: 'Public network', nonetwork: 'No network', alone: 'Not joined' };
const FORM_NAMES = { laptop: 'Laptop', tablet: 'Tablet', allinone: 'All-in-one', mini: 'Small desktop', desktop: 'Desktop' };

// Where a warning sits: its computer, its cable or its line to a router, as the server's scene names it.
const issueKey = (on) => (on.computer ? on.computer : on.cable ? [...on.cable].sort().join('|') : on.line.join('|'));
// The scene as the server sent it, read so that anything missing or of an older shape (a server not yet updated sends
// a warning's sentences as `texts`) is taken as empty or plain instead of breaking the drawing.
const list = (value) => (Array.isArray(value) ? value : []);
const readScene = (pools) => {
    const scene = pools?.scene || {};
    const known = new Set(list(pools?.computers).map((one) => one.id));
    const level = (value) => (value === 'error' ? 'error' : 'warning');
    const noteOf = (note) => (typeof note === 'string'
        ? { level: 'warning', title: 'Warning', text: note, steps: [] }
        : { level: level(note?.level), title: String(note?.title || 'Warning'), text: String(note?.text || ''), steps: list(note?.steps).map(String) });
    return {
        cables: list(scene.cables).filter((cable) => known.has(cable?.a) && known.has(cable?.b)),
        homes: list(scene.homes).filter((home) => home?.id).map((home) => ({ ...home, members: list(home.members).filter((member) => known.has(member?.id)) })),
        issues: list(scene.issues).filter((issue) => issue?.on && (issue.on.computer || list(issue.on.cable).length === 2 || list(issue.on.line).length === 2)).map((issue) => {
            const notes = (Array.isArray(issue.notes) ? issue.notes : list(issue.texts)).map(noteOf).filter((note) => note.text);
            return { on: issue.on, level: notes.some((note) => note.level === 'error') || issue.level === 'error' ? 'error' : 'warning', notes, fix: issue.fix || null };
        }).filter((issue) => issue.notes.length > 0),
        flows: list(scene.flows).filter((flow) => known.has(flow?.from) && known.has(flow?.to))
    };
};
const issuesFor = (scene, id) => scene.issues.filter(({ on }) => on.computer === id || on.cable?.includes(id) || on.line?.[1] === id).flatMap((issue) => issue.notes);
// A drawing that fails says so in a line instead of taking the page down with it.
class DrawingGuard extends React.Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidUpdate(before) {
        if (this.state.failed && before.pools !== this.props.pools) this.setState({ failed: false });
    }
    render() {
        return this.state.failed ? <Typography size="xs" color="muted">The drawing could not be shown. Press Check again, or reload the page.</Typography> : this.props.children;
    }
}
// A warning's notes: a short title and one sentence each, in the warning or error colour, and the steps when asked for.
const PoolNotes = ({ notes, steps = false }) => (
    <Container layout="flex-column" gap="sm" padding="none" width="100%">
        {notes.map((note) => (
            <Container key={`${note.title}-${note.text}`} layout="flex" align="baseline" gap="xs" padding="none" width="100%" wrap={false}>
                <Icon name={note.level === 'error' ? 'FiXCircle' : 'FiAlertTriangle'} size="xs" color={note.level === 'error' ? 'error' : 'warning'} />
                <Container layout="flex-column" gap="xxs" padding="none" minWidth="0">
                    <Typography size="xs" weight="semibold" color={note.level === 'error' ? 'error' : 'warning'}>{note.title}</Typography>
                    <Typography size="xs">{note.text}</Typography>
                    {steps && note.steps?.length > 0 && <GuideRows items={note.steps} size="xs" />}
                </Container>
            </Container>
        ))}
    </Container>
);

// One computer, drawn at (x, 0) standing on z0: its parts back to front.
const drawComputer = (HL, P, front, g, form, x, y, z0) => {
    const box = (x0, y0, x1, y1, a, b, r = 1.4, inset = 0.9) => {
        const [ring, inner] = HL.rings(x + x0, y + y0, x + x1, y + y1, r, inset);
        HL.put(HL.solid(g), HL.prism(P, front, ring, inner, z0 + a, z0 + b));
    };
    const line = (points, cls = 'lo nf') => HL.mk('path', { d: HL.open(points.map(([px, py, pz]) => P(x + px, y + py, z0 + pz))), class: cls }, g);
    const face = (x0, x1, at, a, b, cls = 'lo nf') => HL.mk('path', { d: HL.poly([[x0, at, a], [x1, at, a], [x1, at, b], [x0, at, b]].map(([px, py, pz]) => P(x + px, y + py, z0 + pz))), class: cls }, g);
    const monitor = (half, a, b) => {
        box(-7, -6, 7, 2, 0, 1, 1.6, 0.8);
        box(-1.6, -4.6, 1.6, -3, 1, a + 1, 0.8, 0.4);
        box(-half, -6.2, half, -4.6, a, b, 1.2, 0.5);
        face(-half + 2, half - 2, -4.6, a + 2, b - 2);
    };
    if (form === 'laptop') {
        box(-17, -12, 17, 12, 0, 1.8, 2, 1);
        box(-17, -12, 17, -10.4, 1.8, 24, 1.4, 0.5);
        face(-14.5, 14.5, -10.4, 4.4, 21.6);
        line([[-13, -8, 1.8], [13, -8, 1.8], [13, 1.5, 1.8], [-13, 1.5, 1.8], [-13, -8, 1.8]]);
        for (const row of [-5.6, -3.2, -0.8]) line([[-13, row, 1.8], [13, row, 1.8]]);
        line([[-5, 4, 1.8], [5, 4, 1.8], [5, 10, 1.8], [-5, 10, 1.8], [-5, 4, 1.8]]);
        return;
    }
    if (form === 'tablet') {
        line([[-11, -4, 15], [-11, -13, 0]], 'sil nf');
        line([[11, -4, 15], [11, -13, 0]], 'sil nf');
        box(-15, -2, 15, 10, 0, 1, 1.4, 0.6);
        for (const row of [1, 3.4, 5.8]) line([[-12, row, 1], [12, row, 1]]);
        box(-15, -4, 15, -2.4, 1, 22, 1.6, 0.5);
        face(-13, 13, -2.4, 3, 20);
        return;
    }
    const towerX = form === 'desktop' ? 30 : null;
    if (form === 'desktop') {
        box(towerX - 7, -12, towerX + 7, 12, 0, 30, 1.6, 0.9);
        face(towerX - 5, towerX + 5, 12, 21, 27);
        for (const z of [17, 15.5, 14]) line([[towerX - 5, 12, z], [towerX + 5, 12, z]]);
    }
    monitor(form === 'allinone' ? 21 : 19, form === 'allinone' ? 7 : 9, form === 'allinone' ? 36 : 33);
    if (form === 'mini') {
        box(16, 0, 32, 14, 0, 4.5, 2, 1);
        line([[19, 14, 2.2], [21, 14, 2.2]], 'sil nf');
    }
    box(-14, 7, 10, 13, 0, 1, 1, 0.5);
    for (const row of [9, 11]) line([[-12, row, 1], [8, row, 1]]);
};

const drawRouter = (HL, P, front, g, x, y) => {
    const box = (x0, y0, x1, y1, a, b, r = 1.2, inset = 0.6) => {
        const [ring, inner] = HL.rings(x + x0, y + y0, x + x1, y + y1, r, inset);
        HL.put(HL.solid(g), HL.prism(P, front, ring, inner, a, b));
    };
    box(-8.8, -5.2, -7.4, -3.8, 4, 15, 0.7, 0.3);
    box(7.4, -5.2, 8.8, -3.8, 4, 15, 0.7, 0.3);
    box(-11, -6, 11, 6, 0, 4, 1.8, 0.9);
    for (const dx of [-5, -2, 1]) HL.mk('path', { d: HL.open([P(x + dx, y + 6, 2), P(x + dx + 1, y + 6, 2)]), class: 'sil nf' }, g);
    // The radio: three arcs over the router.
    for (const r of [5, 9, 13]) {
        const arc = [];
        for (let a = -50; a <= 50; a += 10) arc.push(P(x + Math.sin(HL.rad(a)) * r, y - 4.5, 17 + Math.cos(HL.rad(a)) * r * 0.55));
        HL.mk('path', { d: HL.open(arc), class: 'lo nf' }, g);
    }
    return { top: [x, y - 4.5, 15], port: [x, y + 6, 1], points: [[-11, -6, 0], [11, 6, 0], [-11, -6, 15], [11, -6, 15], [11, 6, 4], [-11, 6, 4]].map(([a, b, c]) => [x + a, y + b, c]) };
};

// Flow's grid puts linked boxes beside each other; its spots are read as screen space and laid on the floor, so the
// computers fill the width instead of running down a diagonal. A screen step right is the floor's (1, -1) direction,
// a step down is (1, 1) at twice the length, since the floor is seen at half height.
const POOL_CELL = { computer: [62, 66], router: [40, 34] };
const FLOW_SCALE = 0.3;
const floorAt = (sx, sy) => [(sx + 2 * sy) / Math.SQRT2, (2 * sy - sx) / Math.SQRT2];
const poolPlaces = (computers, cables, homes) => {
    const items = [
        ...computers.map((one) => ({ id: one.id, wide: POOL_CELL.computer[0] / FLOW_SCALE, tall: POOL_CELL.computer[1] / FLOW_SCALE })),
        ...homes.map((home) => ({ id: home.id, wide: POOL_CELL.router[0] / FLOW_SCALE, tall: POOL_CELL.router[1] / FLOW_SCALE }))
    ];
    const wires = [...cables.map((cable) => ({ source: cable.a, target: cable.b })), ...homes.flatMap((home) => home.members.map((member) => ({ source: home.id, target: member.id })))];
    // A computer joined to nothing (offline, or alone on its network) is tied to the first one for the layout only, so
    // it takes a spot in the same grid instead of being set apart round the others.
    const tied = new Set(wires.flatMap((wire) => [wire.source, wire.target]));
    const anchor = items.find((item) => tied.has(item.id))?.id || items[0]?.id;
    for (const item of items) if (!tied.has(item.id) && item.id !== anchor) wires.push({ source: anchor, target: item.id });
    const laid = layoutItems(items, wires, 'grid');
    const places = new Map();
    for (const item of items) {
        const at = laid.get(item.id) || { x: 0, y: 0 };
        // A computer stands in the lower part of its spot, since it rises above where it stands.
        places.set(item.id, floorAt((at.x + item.wide / 2) * FLOW_SCALE, (at.y + item.tall * 0.62) * FLOW_SCALE));
    }
    return places;
};
// Where a cable leaves a footprint: the point of its edge nearest the other end, on the floor.
const edgeToward = (foot, toward) => [Math.min(foot[1], Math.max(foot[0], toward[0])), Math.min(foot[3], Math.max(foot[2], toward[1])), 0.9];
const cablePoints = (a, b, dip) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    let [nx, ny] = [-dy / length, dx / length];
    if (nx + ny < 0) [nx, ny] = [-nx, -ny];
    const points = [];
    for (let i = 0; i <= 16; i += 1) {
        const t = i / 16;
        const sag = Math.sin(Math.PI * t) * dip;
        points.push([a[0] + dx * t + nx * sag, a[1] + dy * t + ny * sag, i === 0 ? a[2] : i === 16 ? b[2] : 0]);
    }
    return points;
};
const airPoints = (a, b) => {
    const points = [];
    for (let i = 0; i <= 16; i += 1) {
        const t = i / 16;
        points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + Math.sin(Math.PI * t) * 14]);
    }
    return points;
};

const PoolDrawing = ({ HL, pools, onPick, onWarn, picked }) => {
    const stage = React.useRef(null);
    useEffect(() => {
        const host = stage.current;
        if (!HL || !host) return undefined;
        host.replaceChildren();
        const computers = pools.computers || [];
        const svg = HL.mk('svg', { role: 'group', 'aria-label': 'Your computers and how they are joined' }, host);
        const C = HL.Cam(45, 0.5, 1);
        const scene = readScene(pools);
        const { cables, homes } = scene;
        const raised = (one) => (one.role === 'main' ? 3 : 0);
        const places = poolPlaces(computers, cables, homes);
        const spots = new Map(computers.map((one) => [one.id, anchorsOf(one.form, ...places.get(one.id), raised(one))]));
        const routers = homes.map((home) => ({ ...home, at: places.get(home.id) }));
        HL.fit(C, [...[...spots.values()].flatMap((spot) => spot.corners), ...routers.flatMap(({ at }) => [[at[0] - 14, at[1] - 8, 0], [at[0] + 14, at[1] + 8, 30]])], 0, 0);
        const P = HL.proj(C);
        const front = HL.facing(C);
        const [floor, air, machines, names, marks] = [0, 1, 2, 3, 4].map(() => HL.mk('g', {}, svg));
        const links = [];
        const anchors = new Map();
        // A link the pool cannot use (a Public network) is drawn dim and lights nothing.
        // Each link is coloured by what the server found: works, warning, error, or plain when nothing was checked. A link the
        // pool cannot use (a Public network) lights nothing when a computer is pointed at.
        const addLink = (points, cls, ends, layer, state, open = true) => links.push({ el: HL.mk('path', { d: HL.open(points.map((point) => P(...point))), class: `${cls} pool-${state || 'plain'}` }, layer), ends, points, open });
        // Direct cables, with the plugs their computers have: Thunderbolt when both ends are, else network plugs.
        for (const cable of cables) {
            const [a, b] = [spots.get(cable.a), spots.get(cable.b)];
            const points = cablePoints(edgeToward(a.foot, b.middle), edgeToward(b.foot, a.middle), 6);
            const bolt = cable.plug === 'thunderbolt';
            addLink(points, 'sil nf', [cable.a, cable.b], floor, cable.state);
            for (const end of [points[0], points.at(-1)]) {
                const half = bolt ? 1.2 : 1.8;
                const [ring, inner] = HL.rings(end[0] - half, end[1] - half, end[0] + half, end[1] + half, bolt ? 0.9 : 0.4, 0.3);
                HL.put(HL.solid(floor), HL.prism(P, front, ring, inner, 0, bolt ? 1.8 : 2.4));
            }
            anchors.set([cable.a, cable.b].sort().join('|'), points[8]);
        }
        // Each home network: a router, reached by a cable on the floor or by a dashed radio line through the air.
        const routerParts = new Map();
        for (const router of routers) {
            const [rx, ry] = router.at;
            const part = { top: [rx, ry - 4.5, 15], foot: [rx - 11, rx + 11, ry - 6, ry + 6], middle: [rx, ry] };
            routerParts.set(router.id, part);
            for (const member of router.members) {
                const spot = spots.get(member.id);
                if (!spot) continue;
                const wired = member.way === 'wired';
                const points = wired ? cablePoints(edgeToward(part.foot, spot.middle), edgeToward(spot.foot, part.middle), 4) : airPoints(part.top, spot.top);
                addLink(points, wired ? 'sil nf' : 'sil nf dash', [router.id, member.id], wired ? floor : air, member.state, member.open);
                anchors.set(`${router.id}|${member.id}`, points[member.open ? 10 : 7]);
            }
        }
        // Computers and routers back to front (the nearest have the largest x + y): the primary computer on a plinth,
        // the ones not pooled dimmed, each with its name over everything.
        const standing = [...computers.map((one) => ({ one, at: places.get(one.id) })), ...routers.map((router) => ({ router, at: router.at }))].sort((p, q) => p.at[0] + p.at[1] - (q.at[0] + q.at[1]));
        const groups = new Map();
        for (const entry of standing) {
            if (entry.router) {
                drawRouter(HL, P, front, HL.mk('g', {}, machines), ...entry.at);
                continue;
            }
            const { one } = entry;
            const [x, y] = entry.at;
            const spot = spots.get(one.id);
            const tone = one.reason || one.role === 'off' ? 'pool-dim' : one.role === 'main' ? 'pool-main' : 'pool-lend';
            const g = HL.mk('g', { class: `pool-pc ${tone}`.trim() }, machines);
            if (one.role === 'main') {
                const [ring, inner] = HL.rings(spot.foot[0] - 4, spot.foot[2] - 4, spot.foot[1] + 4, spot.foot[3] + 4, 2.4, 1.2);
                HL.put(HL.solid(g), HL.prism(P, front, ring, inner, 0, 3));
            }
            drawComputer(HL, P, front, g, one.form, x, y, raised(one));
            const [lx, ly] = P(...spot.label);
            const state = one.reason ? REASON_SHORT[one.reason] || 'Not available' : one.role === 'main' ? 'Primary' : one.role === 'lend' ? 'Secondary' : 'Not pooled';
            HL.mk('text', { x: HL.r2(lx), 'data-y': HL.r2(ly), 'text-anchor': 'middle', 'font-weight': 600, 'data-size': 'name' }, names).textContent = one.name;
            HL.mk('text', { x: HL.r2(lx), 'data-y': HL.r2(ly), 'text-anchor': 'middle', class: 'muted', 'data-size': 'state' }, names).textContent = state;
            const hull = HL.hull([...spot.corners.map((corner) => P(...corner)), [lx - 22, ly + 12], [lx + 22, ly + 12]]);
            const hit = HL.mk('polygon', { points: hull.map((point) => point.map(HL.r2).join(',')).join(' '), class: 'pool-hit', tabindex: 0, role: 'button', 'aria-label': `${one.name}, ${state}. Choose its part.` }, g);
            groups.set(one.id, { g, hit, top: spot.top });
        }
        // What a computer reaches, lit while it is pointed at or chosen: every link on any path from it.
        const light = (id) => {
            const seen = new Set(id ? [id] : []);
            const lit = new Set();
            for (let grew = true; grew;) {
                grew = false;
                for (const link of links) {
                    if (!link.open || lit.has(link) || !link.ends.some((end) => seen.has(end))) continue;
                    lit.add(link);
                    for (const end of link.ends) if (!seen.has(end)) { seen.add(end); grew = true; }
                }
            }
            for (const link of links) link.el.classList.toggle('pool-on', lit.has(link));
            for (const [key, entry] of groups) entry.g.classList.toggle('up', key === id);
        };
        const bag = HL.disposer();
        for (const one of computers) {
            const { hit } = groups.get(one.id);
            const choose = () => {
                picked.current = one.id;
                light(one.id);
                onPick(one.id, hit);
            };
            bag.on(hit, 'pointerenter', () => light(one.id));
            bag.on(hit, 'pointerleave', () => light(picked.current));
            bag.on(hit, 'focus', () => light(one.id));
            bag.on(hit, 'blur', () => light(picked.current));
            bag.on(hit, 'click', choose);
            bag.on(hit, 'keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                choose();
            });
        }
        light(picked.current);
        // Warning marks: over a computer's top, on a cable's middle, on a Wi-Fi line. Pointing at one says what is wrong.
        const warn = (point, issue) => {
            const [wx, wy] = P(...point);
            const level = issue.level === 'error' ? ' error' : '';
            const tri = HL.mk('path', { d: `M${HL.r2(wx)},${HL.r2(wy - 5)}L${HL.r2(wx + 4.6)},${HL.r2(wy + 3)}L${HL.r2(wx - 4.6)},${HL.r2(wy + 3)}Z`, class: `pool-warn${level}`, tabindex: 0, role: 'img', 'aria-label': issue.notes.map((note) => `${note.title}. ${note.text}`).join(' ') }, marks);
            HL.mk('path', { d: `M${HL.r2(wx - 0.5)},${HL.r2(wy - 2.4)}h1v2.9h-1zM${HL.r2(wx - 0.5)},${HL.r2(wy + 1.1)}h1v1h-1z`, class: `pool-warn-mark${level}` }, marks);
            for (const type of ['pointerenter', 'focus']) bag.on(tri, type, () => onWarn(issue.notes, tri));
            for (const type of ['pointerleave', 'blur']) bag.on(tri, type, () => onWarn(null));
            // A click keeps what it says open, with the steps to fix it.
            const keep = () => onWarn(issue.notes, tri, { fix: issue.fix, kept: true });
            bag.on(tri, 'click', keep);
            bag.on(tri, 'keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                keep();
            });
        };
        for (const issue of scene.issues) {
            const key = issueKey(issue.on);
            const top = issue.on.computer ? groups.get(issue.on.computer)?.top : null;
            const point = top ? [top[0] + 14, top[1], top[2] + 4] : anchors.get(key);
            if (point) warn(issue.on.computer ? point : [point[0], point[1], point[2] + 3], issue);
        }
        // Memory on its way: dots run along each link the server says memory is lent over, toward the primary computer.
        const flows = [];
        for (const flow of scene.flows) {
            let path = null;
            if (flow.cable) {
                const link = links.find((entry) => entry.ends.includes(flow.cable[0]) && entry.ends.includes(flow.cable[1]));
                if (link) path = link.ends[0] === flow.from ? link.points : [...link.points].reverse();
            } else {
                const out = links.find((entry) => entry.ends[0] === flow.home && entry.ends[1] === flow.from);
                const into = links.find((entry) => entry.ends[0] === flow.home && entry.ends[1] === flow.to);
                if (out && into) path = [...[...out.points].reverse(), ...into.points];
            }
            if (!path) continue;
            const screen = path.map((point) => P(...point));
            // The dots ride on their own link's layer, so a computer standing in front of the link hides them as it hides the link.
            for (let k = 0; k < 3; k += 1) flows.push({ screen, offset: k / 3, dot: HL.mk('circle', { r: 1.1, class: 'pool-flow' }, flow.cable ? floor : air) });
        }
        const along = (screen, t) => {
            const spot = t * (screen.length - 1);
            const i = Math.min(screen.length - 2, Math.floor(spot));
            const f = spot - i;
            return [screen[i][0] + (screen[i + 1][0] - screen[i][0]) * f, screen[i][1] + (screen[i + 1][1] - screen[i][1]) * f];
        };
        const still = HL.reducedMotion();
        const ticking = flows.length > 0 ? HL.register(host, (dt, now) => {
            for (const flow of flows) {
                const [fx, fy] = along(flow.screen, still ? flow.offset : (now / 2600 + flow.offset) % 1);
                flow.dot.setAttribute('cx', HL.r2(fx));
                flow.dot.setAttribute('cy', HL.r2(fy));
            }
            return !still;
        }) : null;
        ticking?.wake?.();
        // The drawing's own size is what it drew. Names keep one size on screen however large the drawing is shown.
        const box = svg.getBBox();
        const width = box.width + 24;
        svg.setAttribute('viewBox', `${HL.r2(box.x - 12)} ${HL.r2(box.y - 12)} ${HL.r2(width)} ${HL.r2(box.height + 24)}`);
        const sizeNames = () => {
            const scale = Math.max(0.5, host.clientWidth / width);
            const [name, state] = [13 / scale, 11 / scale];
            for (const text of names.querySelectorAll('text')) {
                const named = text.dataset.size === 'name';
                text.setAttribute('font-size', HL.r2(named ? name : state));
                text.setAttribute('y', HL.r2(Number(text.dataset.y) + name + (named ? 0 : state * 1.35)));
            }
        };
        sizeNames();
        const watch = new ResizeObserver(sizeNames);
        watch.observe(host);
        return () => {
            watch.disconnect();
            bag.dispose();
            ticking?.unregister();
            host.replaceChildren();
        };
    }, [HL, pools, onPick, onWarn, picked]);
    return <div ref={stage} data-hairline="pool" />;
};

// The card a computer opens when clicked: what it is, what is wrong, and its part in the pool.
const PART_SHORT = { main: 'Primary', lend: 'Secondary', off: 'Not pooled' };
const ComputerCard = ({ one, main, issues, onPart }) => {
    const status = poolStatus(one, Boolean(main));
    const part = POOL_PARTS.find((entry) => entry.role === one.role) || POOL_PARTS[2];
    const unused = (one.cards || []).filter((card) => !card.usable);
    const facts = [FORM_NAMES[one.form], one.gpuMemoryMb ? `${formatGb(one.gpuMemoryMb)} graphics` : null, `${formatGb(one.memoryMb)} memory`].filter(Boolean).join(' · ');
    const row = (icon, tone, text) => (
        <Container key={text} layout="flex" align="baseline" gap="xs" padding="none" width="100%" wrap={false}>
            <Icon name={icon} size="xs" color={tone} />
            <Typography size="xs" color={tone === 'warning' ? 'warning' : 'muted'}>{text}</Typography>
        </Container>
    );
    return (
        <Container layout="flex-column" gap="sm" padding="none" width="100%">
            <Container layout="flex-column" gap="none" padding="none" width="100%">
                <Typography size="sm" weight="semibold">{one.name}</Typography>
                <Typography size="xs" color="muted">{facts}</Typography>
                {unused.length > 0 && <Typography size="xxs" color="muted">{cardsNote(unused)}</Typography>}
            </Container>
            {status && issues.length === 0 && row(STATUS_ICONS[status[1]] || 'FiInfo', STATUS_TONES.includes(status[1]) ? status[1] : 'primary', status[0])}
            {issues.length > 0 && <PoolNotes notes={issues} steps />}
            {(one.reason === 'public' || (one.homes || []).some((home) => home.public)) && (
                <Button size="xs" genieTrigger="click" genie={{ trigger: 'click', width: '460px', padding: 'md', content: <MakePrivate name={one.name} networks={[...new Set([...(one.publicNetworks || []), ...(one.homes || []).filter((home) => home.public && home.name).map((home) => home.name)])]} /> }}>
                    <Icon name="FiShield" />How to make it Private
                </Button>
            )}
            {one.reachable === false && (
                <Button size="xs" variant="ghost" genieTrigger="click" genie={{ trigger: 'click', width: '440px', padding: 'md', content: <WhyUnreachable /> }}>
                    <Icon name="FiHelpCircle" />Why can't it be reached?
                </Button>
            )}
            {one.reason === 'alone' && row('FiInfo', 'primary', one.message)}
            {!one.reason && (
                <Container layout="flex-column" gap="xs" padding="none" width="100%">
                    <ButtonGroup size="sm" justify="start" selectable={false}>
                        {POOL_PARTS.map((entry) => (
                            <Button key={entry.role} size="sm" selected={one.role === entry.role} onClick={() => one.role !== entry.role && onPart(one, entry.role)}>{PART_SHORT[entry.role]}</Button>
                        ))}
                    </ButtonGroup>
                    <Typography size="xs" color="muted">{part.hint}</Typography>
                    {main && main.id !== one.id && <Typography size="xxs" color="muted">{`Making it primary turns ${main.name} into a secondary computer.`}</Typography>}
                </Container>
            )}
        </Container>
    );
};

const PoolSection = ({ pools, onPart, onCheck, checking, children }) => {
    const HL = useHairline();
    const [open, setOpen] = useState(null);
    const [tip, setTip] = useState(null);
    const picked = React.useRef(null);
    const checkedFor = React.useRef(null);
    const pick = useCallback((id, el) => setOpen({ id, ref: { current: el } }), []);
    const hint = useCallback((texts, el, how = {}) => setTip((now) => {
        if (!texts) return now?.kept ? now : null;
        return { texts, ref: { current: el }, fix: how.fix || null, kept: Boolean(how.kept) };
    }), []);
    // The cables are known only from a check, so one runs when the section opens and again whenever another computer
    // comes online or its network arrives (the server says so as it happens), with no button pressed.
    useEffect(() => {
        if (!pools || checking) return;
        const online = (pools.computers || []).filter((one) => one.online && one.reason !== 'update').map((one) => `${one.id}:${(one.homes || []).length}`).sort().join();
        if (checkedFor.current === online) return;
        checkedFor.current = online;
        if (online.includes(',')) onCheck();
    }, [pools, checking, onCheck]);
    const computers = pools?.computers || [];
    const main = computers.find((one) => one.role === 'main') || null;
    const lenders = computers.filter((one) => one.role === 'lend' && !one.reason);
    const ready = Boolean(main) && lenders.length > 0 && lenders.every((one) => one.reachable === true);
    const together = [main, ...lenders].filter(Boolean);
    const chosen = computers.find((one) => one.id === open?.id) || null;
    const close = () => {
        setOpen(null);
        picked.current = null;
    };
    return (
        <Container as="section" layout="flex-column" gap="lg" padding="none" width="100%" minWidth="0">
            <Container layout="flex-column" gap="sm" padding="none" width="100%">
                <Heading title="Pooling computers" badge={<Badge size="xs" title="Needs the Mollama desktop app 1.0.8 or later on every pooled computer">Preview</Badge>}>
                    <Container layout="flex" align="center" gap="sm" padding="none" wrap={false}>
                        {pools?.checks?.at && <Typography size="xxs" color="muted">Checked {new Date(pools.checks.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Typography>}
                        <Button size="sm" disabled={checking} title="Read every connected computer's network again and check how they are joined" onClick={onCheck}>
                            <Icon name="FiRefreshCw" />{checking ? 'Checking…' : 'Check again'}
                        </Button>
                    </Container>
                </Heading>
                <Typography as="p" size="sm" maxWidth="760px">
                    Several of your computers can share one model that none of them could hold alone: a primary computer holds the model and runs it, and the secondary computers lend it their memory. Click a computer to choose its part.
                </Typography>
            </Container>
            {!pools && <Typography size="xs" color="muted">Reading your computers…</Typography>}
            {pools && computers.length === 0 && <Typography size="sm">Install the Mollama desktop app on your computers and sign in on each; they appear here.</Typography>}
            {pools && computers.length > 0 && HL === false && <Typography size="xs" color="muted">The drawing could not be loaded. Reload the page to try again.</Typography>}
            {pools && computers.length > 0 && HL && <DrawingGuard pools={pools}><PoolDrawing HL={HL} pools={pools} onPick={pick} onWarn={hint} picked={picked} /></DrawingGuard>}
            {pools && computers.length > 0 && (
                <Container layout="flex" align="baseline" gap="xs" padding="none" width="100%" wrap={false}>
                    <Icon name={ready ? 'FiCheckCircle' : 'FiInfo'} size="xs" color={ready ? 'success' : 'primary'} />
                    <Typography size="xs" color="muted">
                        {!main ? 'No primary computer yet: click the one with the largest graphics card and make it the primary computer. ' : `${main.name} is the primary computer${lenders.length ? `, with ${lenders.length} secondary` : ''}. `}
                        {ready ? 'The pool is ready: choose it in a chat\'s computer picker. ' : main && lenders.length > 0 ? 'Ready once the primary computer reaches every secondary one. ' : ''}
                        {together.length > 1 ? `Together: ${formatGb(together.reduce((sum, one) => sum + one.gpuMemoryMb, 0))} of graphics memory and ${formatGb(together.reduce((sum, one) => sum + one.memoryMb, 0))} of system memory.` : ''}
                        {checking ? ' Checking how your computers are joined…' : ''}
                    </Typography>
                </Container>
            )}
            <Genie visible={Boolean(chosen && open)} triggerRef={open?.ref} onClose={close} variant="popover" width="380px" padding="md" ariaLabel={chosen ? `${chosen.name}'s part in the pool` : undefined}>
                {chosen && <ComputerCard one={chosen} main={main} issues={issuesFor(readScene(pools), chosen.id)} onPart={(one, role) => { close(); onPart(one, role); }} />}
            </Genie>
            <Genie visible={Boolean(tip)} triggerRef={tip?.ref} onClose={() => setTip(null)} variant={tip?.kept ? 'popover' : 'tooltip'} role={tip?.kept ? 'dialog' : 'tooltip'} closeOnClickOutside={Boolean(tip?.kept)} width={tip?.fix ? '460px' : '320px'} padding={tip?.kept ? 'md' : 'sm'}>
                {tip && (
                    <Container layout="flex-column" gap="sm" padding="none" width="100%">
                        <PoolNotes notes={tip.texts} steps={tip.kept} />
                        {tip.kept && tip.fix?.kind === 'private' && <MakePrivate name={tip.fix.name} networks={tip.fix.networks} />}
                    </Container>
                )}
            </Genie>
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

const minutesText = (minutes) => {
    const whole = Math.max(1, Math.round(minutes));
    return whole >= 60 ? `${Math.floor(whole / 60)} h ${whole % 60} min` : `${whole} min`;
};

// Renting a graphics card: the card, how long, and the most it may cost. The whole limit is set aside at once.
// The Rent view: every kind of card, free or not, with filters and sorting; choosing a free one opens its rent form.
const MEMORY_FLOORS = [['0', 'Any graphics memory'], ['16', '16 GB or more'], ['24', '24 GB or more'], ['48', '48 GB or more'], ['80', '80 GB or more']];
const RENT_SORTS = [['price', 'Price: lowest first'], ['price-down', 'Price: highest first'], ['memory', 'Graphics memory: most first'], ['name', 'Name']];
const RENT_ORDER = {
    price: (a, b) => a.price - b.price,
    'price-down': (a, b) => b.price - a.price,
    memory: (a, b) => (b.memoryMb || 0) - (a.memoryMb || 0) || a.price - b.price,
    name: (a, b) => a.name.localeCompare(b.name)
};
const RENT_FIELDS = {
    card: { label: 'Card' },
    // Kept as numbers so the table sorts them as numbers, and written out only for display.
    memory: { label: 'Graphics memory', component: Typography, props: { size: 'xs' }, transform: (value) => ({ children: value ? formatGb(value) : 'Not stated' }) },
    price: { label: 'Price an hour', component: Typography, props: { size: 'xs' }, transform: (value) => ({ children: formatMoney(value) }) },
    now: { label: 'Now', component: Badge, props: { size: 'xs' }, transform: (value) => ({ color: value === 'Free now' ? 'success' : 'default', children: value }) },
    source: { label: 'Supplied by (admins and owners only)' }
};

const RentView = ({ offer, problem, open = 0, onRented, onShowComputers }) => {
    const [freeOnly, setFreeOnly] = useState(false);
    const [floor, setFloor] = useState('0');
    const [sort, setSort] = useState('price');
    const [find, setFind] = useState('');
    if (problem) return <Notice title="The cards for rent could not be read" text={problem} />;
    if (!offer) return <Notice title="Reading the cards for rent…" />;

    const all = [...offer.cards.map((card) => ({ ...card, free: true })), ...(offer.unavailable || []).map((card) => ({ ...card, free: false }))];
    const words = find.trim().toLowerCase();
    const shown = all
        .filter((card) => (!freeOnly || card.free) && (card.memoryMb || 0) >= Number(floor) * 1024 && (!words || card.name.toLowerCase().includes(words)))
        .sort(RENT_ORDER[sort]);
    const rows = shown.map((card) => ({
        id: card.flavor,
        card: `${card.name}${card.spot ? ' (spot)' : ''}`,
        memory: card.memoryMb || 0,
        price: card.price,
        now: card.free ? 'Free now' : card.why || 'Out of stock right now',
        ...(card.source ? { source: card.source } : {}),
        held: card
    }));
    const rentRow = {
        trigger: 'click', variant: 'popover', width: '480px', padding: 'lg',
        content: (row) => (row.held.free
            ? <RentCard offer={offer} onRented={onRented} start={row.id} open={open} />
            : <Typography as="p" size="xs" color="muted">{`${row.card} is out of stock right now. Try again later, or choose a card that is free now.`}</Typography>)
    };

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            <Typography as="p" size="xs" color="muted">
                A computer with a strong graphics card, yours by the minute. It appears under Computers as one of your computers: you download models onto it and choose it in a chat. Choose a card that is free now to rent it.
            </Typography>
            {open >= offer.rules.atOnce && (
                <Notice title={open === 1 ? 'You already have a rented computer' : `You have ${open} rented computers, the most at once`} text="End one before renting another. They are under Computers.">
                    <Button size="sm" onClick={onShowComputers}><Icon name="FiMonitor" />Show them</Button>
                </Notice>
            )}
            {open >= 2 && open < offer.rules.atOnce && (
                <Notice title={`You have ${open} rented computers running`} text="Another one is charged by the minute as well, from its own credit set aside. Make sure you need it.">
                    <Button size="sm" onClick={onShowComputers}><Icon name="FiMonitor" />Show them</Button>
                </Notice>
            )}
            <Container layout="flex" align="end" gap="sm" padding="none" width="100%">
                <Input size="sm" label="Find a card" value={find} onChange={(event) => setFind(event.target.value)} width="220px" />
                <Select size="sm" label="Graphics memory" value={floor} onChange={(value) => setFloor(String(value))} width="200px"
                    options={MEMORY_FLOORS.map(([value, label]) => ({ value, label }))} />
                <Select size="sm" label="Sort by" value={sort} onChange={setSort} width="230px"
                    options={RENT_SORTS.map(([value, label]) => ({ value, label }))} />
                <Switch size="sm" label="Only cards free now" checked={freeOnly} onChange={() => setFreeOnly(!freeOnly)} />
            </Container>
            <Typography as="p" size="xxs" color="muted">{`${shown.filter((card) => card.free).length} free now, ${shown.filter((card) => !card.free).length} out of stock right now. You have ${formatMoney(offer.balance)} of credit.`}</Typography>
            {rows.length > 0
                ? <Data data={rows} size="xs" fieldConfig={RENT_FIELDS} exclude={['id', 'held']} sortable flat width="100%" genie={rentRow} />
                : <Notice title="No card matches" text="Change the filters to see more cards." />}
        </Container>
    );
};

const RentCard = ({ offer, onRented, start = null, open = 0 }) => {
    const { success, error: notifyError } = useNotification();
    const navigate = useNavigate();
    const [flavor, setFlavor] = useState(start || offer.cards[0]?.flavor || '');
    const [hours, setHours] = useState(String(offer.rules.hours));
    const [limit, setLimit] = useState(String(offer.rules.limit / 100));
    const [busy, setBusy] = useState(false);
    const card = offer.cards.find((one) => one.flavor === flavor);
    const cents = Math.round(Number(limit) * 100);
    const problem = open >= offer.rules.atOnce ? `You have ${open} rented computers, the most at once. End one first.`
        : !card ? 'No card is free to rent right now. Try again later.'
        : !Number.isFinite(cents) || cents < card.price ? `The spending limit must cover one hour: at least ${formatMoney(card.price)}.`
            : cents > offer.balance ? `You have ${formatMoney(offer.balance)} of credit. Add credit, or lower the limit.` : '';

    const rent = async () => {
        setBusy(true);
        try {
            await rentalService.start(flavor, Number(hours), cents, card.price);
            success(`Starting your ${card.name}. It takes a few minutes; you are told when it is ready.`);
            document.querySelector('[data-genie-backdrop]')?.click();
            onRented();
        } catch (error) {
            // The card went meanwhile and only a dearer one of its kind is left: say so, and show the new price.
            if (error?.response?.data?.code === 'PRICE_CHANGED') onRented();
            notifyError(error?.response?.data?.message || describeError(error, 'The card could not be rented.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            <Typography as="h2" size="md" weight="semibold" font="secondary">Rent a graphics card</Typography>
            <Typography as="p" size="xs" color="muted">
                A computer with a strong graphics card, yours by the hour. It appears here as one of your computers; you download models onto it and choose it in a chat.
            </Typography>
            <Select size="sm" label="Card" value={flavor} onChange={setFlavor} width="100%"
                options={[
                    ...offer.cards.map((one) => ({ value: one.flavor, label: `${one.name} · ${one.memoryMb ? `${formatGb(one.memoryMb)} graphics memory · ` : ''}${formatMoney(one.price)} an hour${one.spot ? ' · spot: can be taken back at any time' : ''}` })),
                    ...(offer.unavailable || []).map((one) => ({ value: one.flavor, label: `${one.name} · ${formatMoney(one.price)} an hour · ${one.why}`, disabled: true }))
                ]} />
            {card?.spot && <Typography as="p" size="xxs" color="warning">A spot machine costs less, but it can be taken back at any moment. The rental then ends and you pay only for the minutes used.</Typography>}
            {open >= 2 && !problem && <Typography as="p" size="xxs" color="warning">{`This is your ${open === 2 ? 'third' : 'fourth'} rented computer running at once. Each one is charged by the minute.`}</Typography>}
            <Container layout="grid" columns="2" gap="sm" padding="none" width="100%">
                <Select size="sm" label="For at most" value={hours} onChange={(value) => setHours(String(value))} width="100%"
                    options={Array.from({ length: offer.rules.mostHours }, (unused, index) => ({ value: String(index + 1), label: index === 0 ? '1 hour' : `${index + 1} hours` }))} />
                <Input size="sm" label="Spending limit (US dollars)" value={limit} onChange={(event) => setLimit(event.target.value)} width="100%" />
            </Container>
            <Typography as="p" size="xxs" color={problem ? 'error' : 'muted'}>
                {problem || `${formatMoney(cents)} of your ${formatMoney(offer.balance)} credit is set aside now. You pay by the minute, and what is not used comes back. It ends, and the machine is deleted with everything on it, after ${hours === '1' ? '1 hour' : `${hours} hours`}, when ${formatMoney(cents)} is spent, or after ${offer.rules.idleMinutes} minutes with nothing running, whichever comes first.`}
            </Typography>
            <Container layout="flex" gap="xs" padding="none">
                <Button size="sm" disabled={busy || Boolean(problem)} onClick={rent}><Icon name="FiZap" />{busy ? 'Starting…' : 'Rent'}</Button>
                <Button size="sm" variant="ghost" onClick={() => navigate('/billing')}><Icon name="FiCreditCard" />Add credit</Button>
            </Container>
        </Container>
    );
};

// More time for a rental: what it adds to the end and, when the spending limit would not cover it, what more is set aside.
const ExtendRental = ({ rental, onExtended }) => {
    const { success, error: notifyError } = useNotification();
    const [hours, setHours] = useState('1');
    const [busy, setBusy] = useState(false);
    const most = Math.max(0, rental.moreHours ?? 12);
    const added = Number(hours);
    const extra = Math.max(0, Math.ceil(((rental.minutes + added * 60) * rental.price) / 60) - rental.limit);
    const ends = rental.endsAt ? new Date(new Date(rental.endsAt).getTime() + added * 3600000) : null;
    const extend = async () => {
        setBusy(true);
        try {
            await rentalService.extend(rental.id, added);
            success(`${rental.card.name} runs ${added === 1 ? 'an hour' : `${added} hours`} longer.`);
            document.querySelector('[data-genie-backdrop]')?.click();
            onExtended();
        } catch (error) {
            notifyError(error?.response?.data?.message || describeError(error, 'The rental could not be extended.'));
        } finally {
            setBusy(false);
        }
    };
    if (most === 0) return <Typography as="p" size="xs" color="muted">This rental is already as long as one can be.</Typography>;
    return (
        <Container layout="flex-column" gap="sm" padding="none" width="100%">
            <Typography as="h2" size="md" weight="semibold" font="secondary">Extend the rental</Typography>
            <Select size="sm" label="More time" value={hours} onChange={(value) => setHours(String(value))} width="100%"
                options={Array.from({ length: Math.min(12, most) }, (unused, index) => ({ value: String(index + 1), label: index === 0 ? '1 hour more' : `${index + 1} hours more` }))} />
            <Typography as="p" size="xxs" color="muted">
                {`${ends ? `It then ends at ${ends.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} at the latest. ` : ''}${extra > 0 ? `Its spending limit rises by ${formatMoney(extra)}, set aside from your credit now; what is not used comes back.` : `Its spending limit of ${formatMoney(rental.limit)} already covers it, so nothing more is set aside.`} It still ends after ${rental.idleMinutes} minutes with nothing running.`}
            </Typography>
            <Container layout="flex" gap="xs" padding="none">
                <Button size="sm" disabled={busy} onClick={extend}><Icon name="FiClock" />{busy ? 'Extending…' : 'Extend'}</Button>
            </Container>
        </Container>
    );
};

// Why Ollama does not use a graphics card the computer has (desktop app 1.0.23 on).
const CARD_WHY = {
    'mac-intel': 'Ollama uses only the graphics of Apple\'s own chips, so on an Intel Mac it runs on the processor.',
    intel: 'Ollama does not use Intel graphics.',
    driver: 'Ollama could not use it: install or update the NVIDIA driver.',
    small: 'It has too little memory of its own for a model.',
    other: 'Ollama does not use this kind of graphics.'
};
const cardsNote = (cards) => {
    const memory = cards.filter((card) => card.memoryMb > 0 && !card.shared).map((card) => `${card.name} has ${formatGb(card.memoryMb)} of its own.`);
    return [...memory, ...[...new Set(cards.map((card) => CARD_WHY[card.why] || CARD_WHY.other))]].join(' ');
};

const RENTAL_STATES = { starting: 'Starting', running: 'Rented', ending: 'Ending' };
const rentalNote = (rental) => {
    if (rental.state === 'starting') return ' Rented by the hour. It is starting, which takes a few minutes; nothing is charged if it never becomes ready.';
    if (rental.state === 'ending') return ` Its rental has ended because ${rental.why}. It leaves this list once the machine is confirmed deleted.`;
    return ' Rented by the hour. Ending it deletes the machine and everything on it.';
};

const DeviceCard = ({ device, canManage, onChanged, onRemove, onPause, here, onSetUp, rental = null, onEndRental, onExtended }) => {
    const { success, error: notifyError } = useNotification();
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ name: '', memoryGb: '', gpuName: '', gpuMemoryGb: '' });

    const { hardware, ollama } = device;
    // The graphics cards it has that Ollama does not use (read by desktop app 1.0.23 on).
    const unusedCards = (hardware.cards || []).filter((card) => !card.usable);
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
                {rental && <Badge size="xs" color={rental.state === 'running' ? 'primary' : 'warning'}>{RENTAL_STATES[rental.state] || 'Rented'}</Badge>}
            </Container>
            <Typography size="xxs" color="muted">
                {rental ? rentalNote(rental) : device.kind === 'local' ? 'The computer Mollama is running on.' : 'Linked through the Mollama desktop app.'}
                {!rental && !device.online && ' Open the Mollama desktop app on it to bring it online, or remove it if that computer is no longer yours to use.'}
                {device.paused && ' Paused: it stays connected but is given no work, and its models are out of memory, until you resume it.'}
                {device.online && !device.paused && !ollama.available && (here ? ' Ollama is not running here. Set up Ollama installs it if needed and starts it.' : ' Start Ollama on that computer, or open Mollama on it and choose Set up Ollama.')}
            </Typography>

            {!editing && rental?.state === 'starting' && (
                <Container layout="flex-column" gap="xs" padding="none" width="100%" flexFill>
                    <Fact label="Graphics card" value={rental.card.name} note={rental.card.memoryMb ? `${formatGb(rental.card.memoryMb)} of graphics memory` : null} />
                    <Fact label="Rental" value={`${formatMoney(rental.price)} an hour`} note={`${formatMoney(rental.limit)} set aside`} />
                </Container>
            )}
            {!editing && rental?.state !== 'starting' && (
                <Container layout="flex-column" gap="xs" padding="none" width="100%" flexFill>
                    <Fact
                        label={hardware.gpuShared ? 'Graphics' : 'Graphics card'}
                        value={!hardware.hasGpu ? (unusedCards.length > 0 ? unusedCards.map((card) => card.name).join(', ') : 'None found') : hardware.gpuShared ? 'Built in' : (hardware.gpuName || 'Graphics card')}
                        note={!hardware.hasGpu
                            ? `${unusedCards.length > 0 ? `${cardsNote(unusedCards)} ` : ''}Models run on the processor, which is slower.`
                            : hardware.gpuShared
                                ? `Shares the ${formatGb(hardware.memoryMb)} of system memory. About ${formatGb(hardware.gpuMemoryMb)} of it can hold a model (an estimate).`
                                : `${formatGb(hardware.gpuMemoryMb)} of graphics memory${unusedCards.length > 0 ? `. Also ${unusedCards.map((card) => card.name).join(', ')}, which Ollama does not use.` : ''}`}
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
                    {rental && (
                        <Fact label="Rental" value={`${formatMoney(rental.price)} an hour`}
                            note={`${formatMoney(rental.spent)} used of the ${formatMoney(rental.limit)} set aside`} />
                    )}
                    {rental?.state === 'running' && rental.endsAt && (
                        <Fact label="Ends" value={`in ${minutesText((new Date(rental.endsAt) - Date.now()) / 60000)} at the latest`}
                            note={`sooner at ${formatMoney(rental.limit)}, or after ${rental.idleMinutes} minutes with nothing running`} />
                    )}
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
                        {canManage && !editing && rental?.state !== 'starting' && (
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
                        {device.kind !== 'local' && !here && !rental && <Button size="xs" variant="ghost" color="error" onClick={() => onRemove(device)}><Icon name="FiTrash2" />Remove</Button>}
                        {rental && rental.state !== 'ending' && (
                            <Button size="xs" variant="ghost" genie={{ trigger: 'click', variant: 'popover', width: '360px', padding: 'lg', content: <ExtendRental rental={rental} onExtended={onExtended} /> }}>
                                <Icon name="FiClock" />Extend
                            </Button>
                        )}
                        {rental && rental.state !== 'ending' && <Button size="xs" variant="ghost" color="error" onClick={() => onEndRental(device, rental)}><Icon name="FiPower" />End rental</Button>}
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
    const [rentals, setRentals] = useState([]);
    const [offer, setOffer] = useState(null);
    const [rentProblem, setRentProblem] = useState(null);
    // Three views: the computers themselves, pooling them, and renting one. The address says which, so other pages can link.
    const [params, setParams] = useSearchParams();
    const view = ['pooling', 'rent'].includes(params.get('view')) ? params.get('view') : 'computers';
    const [rentOn, setRentOn] = useState(false);

    const load = useCallback(async () => {
        try {
            const result = await deviceService.listDevices();
            setDevices(result.devices);
            deviceService.pools().then(setPools, () => setPools({ computers: [], networks: [] }));
            rentalService.list().then((answer) => setRentals(answer.rentals || []), () => setRentals([]));
            rentalService.cards().then((answer) => {
                setOffer(answer.on ? answer : null);
                setRentOn(Boolean(answer.on));
                setRentProblem(null);
            }, (error) => {
                setOffer(null);
                const answer = error.response?.data;
                setRentOn(answer?.code === 'PROVIDER_DOWN');
                setRentProblem(answer?.code === 'PROVIDER_DOWN' ? `${answer.message}${answer.detail ? ` The provider says: ${answer.detail}` : ''}` : null);
            });
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

    // An open rental changes by the minute (what it has cost, how long is left, whether it is ready), so it is read again.
    const openRentals = rentals.filter((rental) => rental.state !== 'ended').length;
    const renting = openRentals > 0;
    useEffect(() => {
        if (!renting) return undefined;
        const timer = setInterval(load, 30000);
        return () => clearInterval(timer);
    }, [renting, load]);

    const endRental = async (device, rental) => {
        if (!(await confirm(`End the rental of ${device.name}? The machine is deleted with every model on it, and the credit not used comes back.`, { confirmLabel: 'End rental', color: 'error' }))) return;
        try {
            await rentalService.end(rental.id);
            if (deviceService.chosen() === device.id) deviceService.choose('');
            success(`${device.name} is ending. What was not used comes back to your credit once the machine is deleted.`);
            load();
        } catch (error) {
            notifyError(describeError(error, 'The rental could not be ended.'));
        }
    };

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
    const showView = (id) => id !== view && setParams(id === 'computers' ? {} : { view: id });

    return (
        <Page
            title="Devices"
            lead={`The computers that run your AI models. Mollama reads each one so it can tell you which models fit.${devices && !canManage ? " Only an admin or owner can correct a device's details." : ''}`}
            gap="xl"
            background="hex"
            backgroundFade="bottom"
            actions={(
                <Container layout="flex" align="center" gap="sm" padding="none" wrap={false}>
                    <Button size="sm" onClick={load}><Icon name="FiRefreshCw" />Refresh</Button>
                    <Button size="sm" color="secondary" variant="solid" genie={addComputer}><Icon name="FiPlus" />Add a computer</Button>
                </Container>
            )}
        >
            <ButtonGroup size="sm" justify="start" selectable={false}>
                {[['computers', 'Computers', 'FiMonitor'], ['pooling', 'Pooling', 'FiLayers'], ...(rentOn ? [['rent', 'Rent a graphics card', 'FiZap']] : [])].map(([id, label, icon]) => (
                    <Button key={id} size="sm" selected={view === id} onClick={() => showView(id)}><Icon name={icon} />{label}</Button>
                ))}
            </ButtonGroup>

            {view === 'rent' && <RentView offer={offer} problem={rentProblem} open={openRentals} onRented={() => { load(); showView('computers'); }} onShowComputers={() => showView('computers')} />}

            {devices === null && !failed && <Notice title="Reading this computer…" />}

            {failed && (
                <Notice title="Your devices could not be loaded." text="Check your connection, then try again.">
                    <Button size="sm" onClick={load}>Try again</Button>
                </Notice>
            )}

            {view !== 'rent' && devices?.length === 0 && (
                <Notice title="No device is connected to your account yet." text="Install the Mollama desktop app on a computer and sign in. That computer appears here by itself, and its models can then be used from any of your Mollama apps.">
                    <Container layout="flex" gap="xs" padding="none">
                        <Button size="sm" genie={addComputer}><Icon name="FiPlus" />Add a computer</Button>
                        {rentOn && <Button size="sm" variant="ghost" onClick={() => showView('rent')}><Icon name="FiZap" />Rent a graphics card</Button>}
                    </Container>
                </Notice>
            )}

            {view === 'pooling' && (devices?.length > 0
                ? <PoolSection pools={pools} onPart={setPoolPart} onCheck={checkPools} checking={poolCheck.checking}><PoolGuide /></PoolSection>
                : <PoolGuide />)}

            {view === 'computers' && devices?.length > 0 && (
                <Container layout="grid" columns="auto-lg" gap="lg" align="stretch" padding="none" width="100%">
                    {devices.map((device) => (
                        <DeviceCard key={device.id} device={device} canManage={canManage} onChanged={replaceDevice} onRemove={removeDevice} onPause={pauseDevice} here={device.id === here} onSetUp={setUpOllama}
                            rental={rentals.find((rental) => rental.id === device.rental && rental.state !== 'ended') || null} onEndRental={endRental} onExtended={load} />
                    ))}
                </Container>
            )}
        </Page>
    );
};

export default DevicesPage;
