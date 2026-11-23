import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useNotification } from '@contexts/NotificationContext';
import { Page, Container, Card, Button, ButtonGroup, Typography, Icon, Badge, Input, Select, Divider, Data, Flow, TreeView, ProgressBar } from '@components/Components';
import { deviceService, modelService, desktopService, describeError, useActivity } from '../client/ai.client';
import { CopyButton } from './ChatPage';

const FIRST_PROMPT_KEY = 'mollama-first-prompt';

const node = (id, label, column, row, color, shape = 'rectangle') => ({
    id, type: 'editable', position: { x: column * 220, y: row * 100 }, data: { label, color, shape }
});
const edge = (source, target, label) => ({ id: `${source}-${target}`, source, target, label, type: 'smoothstep' });

const DEMOS = [
    {
        id: 'table',
        icon: 'FiGrid',
        chip: 'Compare options',
        prompt: 'Compare three laptops for a student: price, weight and battery life.',
        reply: 'Here are three that fit a student budget. The Air is the lightest; the Vivobook is the cheapest.',
        render: () => (
            <Data
                flat
                size="sm"
                width="100%"
                variant="table"
                sortable={false}
                searchable={false}
                filterable={false}
                paginated={false}
                data={[
                    { laptop: 'Vivobook 15', price: '$549', weight: '1.7 kg', battery: '8 hours' },
                    { laptop: 'IdeaPad Slim 5', price: '$699', weight: '1.5 kg', battery: '11 hours' },
                    { laptop: 'MacBook Air', price: '$999', weight: '1.2 kg', battery: '15 hours' }
                ]}
            />
        )
    },
    {
        id: 'diagram',
        icon: 'FiGitBranch',
        chip: 'Draw a process',
        prompt: 'Draw how an online order gets from checkout to the customer.',
        reply: 'The order is checked for payment first. A refused payment ends the flow early.',
        render: () => (
            <Flow
                height="280px"
                connectable={false}
                deletable={false}
                enableNodeCreation={false}
                nodes={[
                    node('placed', 'Order placed', 0, 0, 'primary'),
                    node('paid', 'Payment OK?', 1, 0, 'warning', 'diamond'),
                    node('packed', 'Packed', 2, 0, 'secondary'),
                    node('sent', 'Delivered', 3, 0, 'success', 'circle'),
                    node('refused', 'Refused', 2, 1, 'error')
                ]}
                edges={[edge('placed', 'paid'), edge('paid', 'packed', 'yes'), edge('packed', 'sent'), edge('paid', 'refused', 'no')]}
            />
        )
    },
    {
        id: 'tree',
        icon: 'FiFolder',
        chip: 'Plan a structure',
        prompt: 'Lay out the folders for a small company website.',
        reply: 'Pages live in one folder, shared pieces in another, and pictures stay out of the code.',
        render: () => (
            <TreeView
                size="sm"
                data={{
                    website: {
                        label: 'website',
                        children: {
                            pages: { label: 'pages', children: { 'home.html': { label: 'home.html', children: {} }, 'about.html': { label: 'about.html', children: {} }, 'contact.html': { label: 'contact.html', children: {} } } },
                            parts: { label: 'parts', children: { 'header.html': { label: 'header.html', children: {} }, 'footer.html': { label: 'footer.html', children: {} } } },
                            images: { label: 'images', children: {} },
                            'styles.css': { label: 'styles.css', children: {} }
                        }
                    }
                }}
            />
        )
    },
    {
        id: 'status',
        icon: 'FiBarChart2',
        chip: 'Track progress',
        prompt: 'Show where the spring launch stands as a small dashboard.',
        reply: 'Design is done, the site is most of the way there, and testing has only just started.',
        render: () => (
            <Container layout="grid" columns={3} gap="sm" padding="none" width="100%">
                {[['Design', 100, 'success', 'Done'], ['Website', 70, 'primary', 'On track'], ['Testing', 15, 'warning', 'Just started']].map(([title, value, color, state]) => (
                    <Card key={title} layout="flex-column" gap="xs" padding="sm" minWidth="0">
                        <Container layout="flex" justify="between" align="center" gap="xs" padding="none" width="100%" wrap={false}>
                            <Typography size="xs" weight="semibold">{title}</Typography>
                            <Badge size="xs" color={color}>{state}</Badge>
                        </Container>
                        <Typography size="lg" weight="semibold" font="secondary">{value}%</Typography>
                        <ProgressBar value={value} size="sm" color={color} width="100%" />
                    </Card>
                ))}
            </Container>
        )
    }
];

const FEATURES = [
    { icon: 'FiLock', title: 'Stays on this computer', text: 'Replies are written by a model running on your own hardware, not by a cloud service.' },
    { icon: 'FiMessageSquare', title: 'Chat that keeps going', text: 'Close the tab and the reply carries on. Queue the next question while one is being written. Dictate instead of typing.' },
    { icon: 'FiFileText', title: 'Answers from your documents', text: 'Attach a PDF, Word document or spreadsheet, or pick one from FilesystemOne. A model only sees the files you attach.' },
    { icon: 'FiSearch', title: 'Web search with checked links', text: 'Mollama opens each page a search finds and test-loads each file, and a model may only show the ones that worked.' },
    { icon: 'FiUser', title: 'Your own versions of a model', text: 'Save an installed model under a new name with your instructions and a creativity level, and edit them whenever you like.' },
    { icon: 'FiHardDrive', title: 'Your files, one account', text: 'The same sign-in opens your FilesystemOne files, so you can attach them to a chat.' }
];

const STEPS = [
    ['Install Ollama', 'One installer. Mollama finds it by itself.'],
    ['Pick a model', 'Choose from the ones that fit and press Download.'],
    ['Ask', 'Open Chat and type. Nothing to configure first.']
];

const GRAPHICS_CARDS = [
    { value: 'none', label: 'No graphics card', gb: 0 },
    { value: 'shared', label: 'Graphics share the system memory (Apple M1 to M4 chips)', gb: 'shared' },
    { value: '4', label: '4 GB card (GTX 1650, RTX 3050 4GB)', gb: 4 },
    { value: '6', label: '6 GB card (RTX 2060, RTX 3050 6GB)', gb: 6 },
    { value: '8', label: '8 GB card (RTX 3060 Ti, 4060, 4060 Ti, RX 7600)', gb: 8 },
    { value: '12', label: '12 GB card (RTX 3060, 4070, RX 7700 XT)', gb: 12 },
    { value: '16', label: '16 GB card (RTX 4060 Ti 16GB, 4080, RX 7800 XT)', gb: 16 },
    { value: '24', label: '24 GB card (RTX 3090, 4090, RX 7900 XTX)', gb: 24 },
    { value: '32', label: '32 GB card (RTX 5090)', gb: 32 },
    { value: 'other', label: 'Another card: I will type its memory', gb: null }
];
// A chip that shares its memory gives the graphics about two thirds of it, the same share the desktop app reports.
const sharedGb = (memoryGb) => Math.round(((memoryGb * 2) / 3) * 10) / 10;
const VERDICT_COLORS = { gpu: 'success', mixed: 'warning', cpu: 'warning', too_large: 'error' };
const gbText = (megabytes) => `${(megabytes / 1024) >= 10 ? Math.round(megabytes / 1024) : Number((megabytes / 1024).toFixed(1))} GB`;
const speedText = (range) => (range ? `about ${range[0]} to ${range[1]} tokens a second` : null);

const HELP = [
    {
        system: 'Windows',
        steps: [
            { label: 'System memory, in PowerShell', code: '[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)' },
            { label: 'Graphics memory on an NVIDIA card, in PowerShell', code: 'nvidia-smi --query-gpu=name,memory.total --format=csv' },
            { label: 'Any graphics card: open Task Manager, then Performance, then GPU, and read "Dedicated GPU memory".' }
        ],
        warning: 'Windows lists (dxdiag, wmic, Device Manager) often show 4 GB for cards that have more. Trust Task Manager or nvidia-smi.'
    },
    {
        system: 'macOS',
        steps: [
            { label: 'System memory, in Terminal', code: 'system_profiler SPHardwareDataType | grep Memory' },
            { label: 'Apple silicon: the graphics chip shares system memory. Choose "Another card" and enter about two thirds of your memory.' }
        ]
    },
    {
        system: 'Linux',
        steps: [
            { label: 'System memory, in a terminal', code: "free -g | awk '/Mem:/ {print $2}'" },
            { label: 'Graphics memory on an NVIDIA card', code: 'nvidia-smi --query-gpu=name,memory.total --format=csv' },
            { label: 'Other graphics cards', code: 'lspci | grep -i vga' }
        ]
    }
];

const Wordmark = () => (
    <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
        <Icon name="FiCpu" size="md" color="primary" />
        <Typography size="md" weight="bold" font="secondary">Mollama</Typography>
    </Container>
);

const SpecHelp = () => (
    <Container layout="flex-column" gap="md" padding="md" width="680px" maxWidth="92vw" backgroundColor="surface" wrap={false}>
        {HELP.map((entry) => (
            <Container key={entry.system} layout="flex-column" gap="xs" padding="none" width="100%" wrap={false}>
                <Typography as="h3" size="xs" weight="semibold" font="secondary">{entry.system}</Typography>
                {entry.steps.map((step) => (
                    <Container key={step.label} layout="flex-column" gap="xs" padding="none" width="100%" wrap={false}>
                        <Typography size="xxs" color="muted">{step.label}</Typography>
                        {step.code && (
                            <Card layout="flex" align="center" justify="between" gap="sm" padding="xs" width="100%" backgroundColor="background" wrap={false}>
                                <Container padding="none" flexFill minWidth="0">
                                    <Typography size="xxs" font="monospace">{step.code}</Typography>
                                </Container>
                                <CopyButton text={step.code} />
                            </Card>
                        )}
                    </Container>
                ))}
                {entry.warning && (
                    <Container layout="flex" align="start" gap="xs" padding="none" wrap={false}>
                        <Icon name="FiAlertTriangle" size="xs" color="warning" />
                        <Typography size="xxs" color="warning">{entry.warning}</Typography>
                    </Container>
                )}
            </Container>
        ))}
    </Container>
);

const Section = ({ id, title, lead, aside = null, children }) => (
    <Container as="section" id={id} layout="flex-column" gap="lg" padding="none" width="100%" wrap={false}>
        <Container layout="flex" align="end" justify="between" gap="md" padding="none" width="100%">
            <Container layout="flex-column" gap="xs" padding="none" maxWidth="640px" wrap={false}>
                <Typography as="h2" size="xl" weight="semibold" font="secondary">{title}</Typography>
                {lead && <Typography as="p" size="sm" color="muted" margin="none">{lead}</Typography>}
            </Container>
            {aside}
        </Container>
        {children}
    </Container>
);

const Calculator = ({ user }) => {
    const navigate = useNavigate();
    const { error: notifyError } = useNotification();
    const activity = useActivity();
    const [memory, setMemory] = useState('');
    const [card, setCard] = useState('8');
    const [cardMemory, setCardMemory] = useState('');
    const [result, setResult] = useState(null);
    const [problem, setProblem] = useState(null);
    const [busy, setBusy] = useState(false);
    const [mine, setMine] = useState(null);

    const clear = () => {
        setMemory('');
        setCard('8');
        setCardMemory('');
        setResult(null);
        setProblem(null);
    };

    const check = useCallback(async (memoryGb, graphicsGb, shared = false) => {
        if (!Number.isFinite(memoryGb) || memoryGb < 1 || memoryGb > 2048) {
            setProblem('Enter system memory as a number of gigabytes from 1 to 2048, for example 16.');
            return;
        }
        if (!Number.isFinite(graphicsGb) || graphicsGb < 0 || graphicsGb > 512) {
            setProblem('Enter graphics memory as a number of gigabytes from 0 to 512, for example 8. Use 0 for no graphics card.');
            return;
        }
        setProblem(null);
        setBusy(true);
        try {
            setResult(await modelService.getPublicCatalogue(Math.round(memoryGb * 1024), Math.round(graphicsGb * 1024), shared));
        } catch (error) {
            setProblem(describeError(error, 'The list could not be worked out. Try again.'));
        } finally {
            setBusy(false);
        }
    }, []);

    const loadMine = useCallback(async () => {
        try {
            const devices = await deviceService.listDevices();
            const first = devices.devices[0];
            const installed = await modelService.installedOn(first?.id);
            const hardware = first?.hardware;
            setMine({
                device: first?.name,
                deviceId: first?.id,
                installed: new Set(installed.models.map((model) => model.name)),
                canManage: Boolean(installed.permissions?.manage)
            });
            return hardware;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        if (!user) {
            setMine(null);
            return;
        }
        loadMine().then((hardware) => {
            if (!hardware?.memoryMb) return;
            const memoryGb = Math.round(hardware.memoryMb / 1024);
            const graphicsGb = hardware.hasGpu ? Math.round((hardware.gpuMemoryMb / 1024) * 10) / 10 : 0;
            const known = hardware.gpuShared ? GRAPHICS_CARDS.find((option) => option.gb === 'shared') : GRAPHICS_CARDS.find((option) => option.gb === graphicsGb);
            setMemory(String(memoryGb));
            setCard(known ? known.value : 'other');
            setCardMemory(known ? '' : String(graphicsGb));
            check(memoryGb, graphicsGb, Boolean(hardware.gpuShared));
        });
    }, [user, loadMine, check]);

    const submit = () => {
        const chosen = GRAPHICS_CARDS.find((option) => option.value === card);
        if (chosen.gb === 'shared') return check(Number(memory), sharedGb(Number(memory)), true);
        return check(Number(memory), chosen.gb === null ? Number(cardMemory) : chosen.gb);
    };

    const download = async (tag) => {
        try {
            await modelService.startDownload(tag, mine?.deviceId);
            activity.refresh();
        } catch (error) {
            notifyError(describeError(error, 'The download could not be started.'));
        }
    };

    const shown = result ? result.models.filter((model) => !model.cloudOnly) : [];
    const runsFully = shown.filter((model) => model.fit.verdict === 'gpu' || model.fit.verdict === 'cpu').slice(0, 6);
    const withMemory = shown.filter((model) => model.fit.verdict === 'mixed').slice(0, 3);
    const tooLarge = shown.filter((model) => !model.fit.fits).slice(0, 3);
    const compatible = result ? result.fitting ?? shown.filter((model) => model.fit.fits).length : 0;
    const reserved = result?.reserved || { gpuMemoryMb: 1536, memoryMb: 4096 };

    const modelCard = (model) => {
        const downloading = activity.downloads.some((job) => job.model === model.tag);
        const installed = mine?.installed.has(model.tag);
        return (
            <Card key={model.tag} layout="flex-column" gap="sm" padding="md" width="100%" height="100%" minWidth="0" wrap={false}>
                <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%" wrap={false}>
                    <Typography as="h4" size="sm" weight="semibold" truncate>{model.name}</Typography>
                    {model.pickLabel && <Badge size="xs" color="primary" title={model.pickWhy}>{model.pickLabel}</Badge>}
                </Container>
                <Typography size="xs" color="muted">{model.description}</Typography>
                <Container padding="none" flexFill />
                <Container layout="flex" align="center" gap="xs" padding="none">
                    <Badge size="xs" color={VERDICT_COLORS[model.fit.verdict]}>{model.fit.label}</Badge>
                    {model.pool?.copies && <Badge size="xs" color="primary" title="Mollama can pool several of your computers on the same home network into one, more slowly than a single computer.">{`Fits on ${model.pool.copies} computers like this, pooled`}</Badge>}
                    {model.moe && <Badge size="xs" color="tertiary">Mixture of experts</Badge>}
                </Container>
                <Typography size="xs">
                    {[`${gbText(model.sizeMb)} download`, `needs ${gbText(model.fit.memoryNeededMb)} to run`, speedText(model.fit.tokensPerSecond)].filter(Boolean).join(', ')}
                </Typography>
                {mine && (installed || downloading || (mine.canManage && model.fit.fits)) && (
                    <Container layout="flex" justify="end" align="center" gap="sm" padding="none" width="100%" wrap={false}>
                        {installed && <Badge size="xs" color="success">Installed</Badge>}
                        {!installed && downloading && <Badge size="xs" color="primary">Downloading</Badge>}
                        {mine.canManage && !installed && !downloading && model.fit.fits && (
                            <Button size="sm" onClick={() => download(model.tag)}><Icon name="FiDownload" />Download</Button>
                        )}
                    </Container>
                )}
            </Card>
        );
    };

    const group = (title, models, muted = false) => models.length > 0 && (
        <Container layout="flex-column" gap="sm" padding="none" width="100%" wrap={false}>
            <Typography as="h3" size="sm" weight="semibold" color={muted ? 'muted' : 'default'}>{title}</Typography>
            <Container layout="grid" columns="auto-lg" gap="md" padding="none" width="100%" align="stretch">{models.map(modelCard)}</Container>
        </Container>
    );

    return (
        <Section
            id="fit"
            title="See which models your computer can run"
            lead={mine?.device
                ? `Filled in from ${mine.device}. Change the numbers to try another machine.`
                : 'Enter two numbers to see which AI models your computer can run, how fast they would be, and why. No account needed.'}
        >
            <Card layout="flex-column" gap="md" padding="lg" width="100%">
                <Container layout="grid" columns="auto" gap="md" padding="none" width="100%" align="start">
                    <Input size="md" label="System memory (GB)" helpText="For example 16" value={memory} onChange={(event) => setMemory(event.target.value)} width="100%" />
                    <Select size="md" label="Graphics card" options={GRAPHICS_CARDS.map(({ value, label }) => ({ value, label }))} value={card} onChange={setCard} width="100%" />
                    {card === 'other' && (
                        <Input size="md" label="Graphics memory (GB)" helpText="For example 10" value={cardMemory} onChange={(event) => setCardMemory(event.target.value)} width="100%" />
                    )}
                </Container>
                {problem && <Typography size="xs" color="error">{problem}</Typography>}
                <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                    <Button size="sm" variant="ghost" genie={{ content: <SpecHelp />, trigger: 'click', padding: 'none' }}>
                        <Icon name="FiHelpCircle" />Where do I find these?
                    </Button>
                    <Container layout="flex" align="center" gap="sm" padding="none" wrap={false}>
                        <Button size="md" variant="ghost" title="Clear" aria-label="Clear" disabled={busy || (!memory && !cardMemory && !result && !problem)} onClick={clear}>
                            <Icon name="FiX" />
                        </Button>
                        <Button size="md" color="primary" variant="solid" disabled={busy || !memory.trim()} title={!memory.trim() ? 'Enter your system memory first' : undefined} onClick={submit}>
                            <Icon name="FiCpu" />{busy ? 'Working it out…' : 'Show what fits'}
                        </Button>
                    </Container>
                </Container>
            </Card>

            {result && (
                <Container layout="flex-column" gap="lg" padding="none" width="100%" wrap={false}>
                    {result.notes.length > 0 && (
                        <Container layout="flex-column" gap="xs" padding="none" width="100%" wrap={false}>
                            {result.notes.map((note) => (
                                <Container key={note} layout="flex" align="start" gap="xs" padding="none" wrap={false}>
                                    <Icon name="FiInfo" size="sm" color="primary" />
                                    <Typography size="xs">{note}</Typography>
                                </Container>
                            ))}
                        </Container>
                    )}
                    {group(result.hardware.gpuMemoryMb ? 'Runs fully on the graphics card' : 'Runs on the processor', runsFully)}
                    {group('Runs on the graphics card with help from system memory', withMemory)}
                    {group('Too large for this machine', tooLarge, true)}
                    <Container layout="flex" align="center" justify="between" gap="md" padding="none" width="100%">
                        <Container padding="none" flexFill minWidth="0">
                            <Typography size="sm" weight="medium">
                                {compatible} of {result.total ?? shown.length} model sizes on ollama.com are compatible with {gbText(result.hardware.memoryMb)} of {result.hardware.gpuShared ? 'memory shared with the graphics' : `memory${result.hardware.gpuMemoryMb ? ` and a ${gbText(result.hardware.gpuMemoryMb)} graphics card` : ' with no graphics card'}`}.{user ? '' : ' Sign in to see the full list.'}
                            </Typography>
                        </Container>
                        <Button size="md" onClick={() => navigate(user ? '/models' : '/login')}>
                            {user ? 'See the full list' : 'Sign in'}
                        </Button>
                    </Container>
                </Container>
            )}

            <Divider />
            <Container layout="grid" columns={3} gap="xl" padding="none" width="100%">
                <Container layout="flex-column" gap="xs" padding="none" minWidth="0" wrap={false}>
                    <Typography as="h3" size="sm" weight="semibold">Why a 30B model can run on an 8 GB card</Typography>
                    <Typography size="xs" color="muted">
                        Some large models are a team of specialists and only a few work on each word. The whole team still has to be held in memory,
                        so whatever does not fit on the graphics card sits in system memory. For these models, system memory matters as much as graphics memory.
                    </Typography>
                </Container>
                <Container layout="flex-column" gap="xs" padding="none" minWidth="0" wrap={false}>
                    <Typography as="h3" size="sm" weight="semibold">Room left for everything else</Typography>
                    <Typography size="xs" color="muted">
                        A model only counts as fitting in what is left after {gbText(reserved.gpuMemoryMb)} of graphics memory is kept for your screen and other apps,
                        and {gbText(reserved.memoryMb)} of system memory for the rest of the computer.
                    </Typography>
                </Container>
                <Container layout="flex-column" gap="xs" padding="none" minWidth="0" wrap={false}>
                    <Typography as="h3" size="sm" weight="semibold">The quality level shown</Typography>
                    <Typography size="xs" color="muted">
                        Every model is listed at the standard version Ollama downloads: packed to about a quarter of its full size with little loss in quality.
                        Higher-quality versions exist and need more memory than shown here.
                    </Typography>
                </Container>
            </Container>
        </Section>
    );
};

// Getting started means installing the desktop app, so each button downloads it for one kind of computer.
const GetStarted = () => {
    const [published, setPublished] = useState(null);
    const channel = desktopService.channels()[0];
    const order = ['windows', 'linux', 'mac'];

    useEffect(() => {
        let live = true;
        desktopService.published().then((release) => { if (live) setPublished(release); });
        return () => { live = false; };
    }, []);

    return (
        <ButtonGroup size="md" justify="start" selectable={false} spaced>
            {order.map((id) => desktopService.systems.find((system) => system.id === id)).map((system) => {
                const file = `${channel.name}${system.ending}`;
                const ready = published === null || published.files.includes(file);
                return (
                    <Button
                        key={system.id}
                        size="md"
                        disabled={!ready}
                        title={ready ? `Download the Mollama desktop app for ${system.label}` : `The ${system.label} app is not available yet`}
                        onClick={() => window.open(desktopService.address(file), '_blank', 'noopener')}
                    >
                        <Icon name={system.icon} />Download for {system.label}
                    </Button>
                );
            })}
        </ButtonGroup>
    );
};

const HomePage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [demo, setDemo] = useState(DEMOS[0]);
    const [prompt, setPrompt] = useState('');
    const start = user ? '/chat' : '/signup';
    const mainAction = user ? 'Open chat' : 'Create an account';

    const choose = (item) => {
        setDemo(item);
        setPrompt('');
    };
    // An empty field asks the example on show.
    const send = () => {
        try {
            sessionStorage.setItem(FIRST_PROMPT_KEY, prompt.trim() || demo.prompt);
        } catch {
            return navigate(start);
        }
        return navigate(start);
    };
    const showFit = () => document.getElementById('fit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <Page
            frame
            gap="4xl"
            background="dots"
            backgroundFade="bottom"
            brand={<Wordmark />}
            actions={(
                <>
                    {!user && <Button size="sm" variant="ghost" onClick={() => navigate('/login')}>Sign in</Button>}
                    {user && <Button size="sm" variant="ghost" onClick={() => navigate('/dashboard')}>Dashboard</Button>}
                    <Button size="sm" color="secondary" variant="solid" onClick={() => navigate(start)}>{mainAction}</Button>
                </>
            )}
        >
            <Container as="section" layout="grid" columns={2} gap="2xl" padding="none" width="100%" align="start" marginTop="xl">
                <Container layout="flex-column" gap="lg" padding="none" minWidth="0" wrap={false}>
                    <Typography as="h1" size="3xl" weight="semibold" font="secondary">
                        Chat with AI models on your own computers
                    </Typography>
                    <Typography as="p" size="md" margin="none">
                        Mollama is a web app for Ollama. It shows which models fit your graphics card and memory, downloads them with one button,
                        and answers with tables, diagrams and files as well as text.
                    </Typography>
                    <Container layout="flex" align="center" gap="sm" padding="none">
                        <Button size="lg" color="secondary" variant="solid" onClick={() => navigate(start)}>{mainAction}</Button>
                        <Button size="lg" onClick={showFit}>Check your computer</Button>
                    </Container>
                    <Typography size="xs" color="muted">Desktop app for Windows, macOS and Linux.</Typography>
                </Container>

                <Card layout="flex-column" gap="md" padding="lg" width="100%" minWidth="0" wrap={false}>
                    <ButtonGroup size="xs" justify="start">
                        {DEMOS.map((item) => (
                            <Button key={item.id} size="xs" selected={demo.id === item.id} onClick={() => choose(item)}>
                                <Icon name={item.icon} />{item.chip}
                            </Button>
                        ))}
                    </ButtonGroup>
                    <Container layout="flex" justify="end" padding="none" width="100%" wrap={false}>
                        <Card padding="sm" bordered={false} backgroundColor="surface-alt" maxWidth="85%">
                            <Typography size="xs">{demo.prompt}</Typography>
                        </Card>
                    </Container>
                    <Container layout="flex-column" gap="sm" padding="none" width="100%" minWidth="0" wrap={false}>
                        <Typography size="xxs" color="muted">The reply, laid out by the model</Typography>
                        <Typography size="sm">{demo.reply}</Typography>
                        <Container key={demo.id} padding="none" width="100%" minWidth="0">{demo.render()}</Container>
                    </Container>
                    <Divider />
                    <Container layout="flex" align="center" gap="sm" padding="none" width="100%" wrap={false}>
                        <Input
                            size="md"
                            flexFill
                            width="100%"
                            placeholder="Or type your own question"
                            aria-label="Try a first question"
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') send(); }}
                        />
                        <Button size="md" title={user ? 'Ask in chat' : 'Create an account to ask'} onClick={send}>
                            <Icon name="FiArrowUp" />
                        </Button>
                    </Container>
                </Card>
            </Container>

            <Calculator user={user} />

            <Section title="What Mollama adds to a local model" lead="Everything a local model needs to be useful, in one app you run yourself.">
                <Container layout="grid" columns={3} gap="xl" padding="none" width="100%">
                    {FEATURES.map((item) => (
                        <Container key={item.title} layout="flex" align="start" gap="sm" padding="none" minWidth="0" wrap={false}>
                            <Icon name={item.icon} size="md" color="primary" />
                            <Container layout="flex-column" gap="xs" padding="none" minWidth="0" wrap={false}>
                                <Typography as="h3" size="sm" weight="semibold">{item.title}</Typography>
                                <Typography size="xs" color="muted">{item.text}</Typography>
                            </Container>
                        </Container>
                    ))}
                </Container>
            </Section>

            <Section title="Three steps to a first answer" lead="From nothing installed to your first answer, without touching a command line.">
                <Container layout="grid" columns={3} gap="xl" padding="none" width="100%">
                    {STEPS.map(([title, text], index) => (
                        <Container key={title} layout="flex" align="start" gap="md" padding="none" minWidth="0" wrap={false}>
                            <Typography size="xl" weight="semibold" font="secondary" color="muted">{index + 1}</Typography>
                            <Container layout="flex-column" gap="xs" padding="none" minWidth="0" wrap={false}>
                                <Typography as="h3" size="sm" weight="semibold">{title}</Typography>
                                <Typography size="xs" color="muted">{text}</Typography>
                            </Container>
                        </Container>
                    ))}
                </Container>
                <Container layout="flex-column" gap="sm" padding="none" width="100%" wrap={false}>
                    <Typography size="xs" color="muted">The desktop app links a computer to your account.</Typography>
                    <GetStarted />
                </Container>
            </Section>

            <Container as="footer" layout="flex-column" gap="lg" padding="none" width="100%" wrap={false}>
                <Divider />
                <Container layout="flex" align="center" justify="between" gap="md" padding="none" width="100%">
                    <Container layout="flex" align="center" gap="md" padding="none">
                        <Wordmark />
                        <Typography size="xs" color="muted">Local AI that stays on the machine it runs on.</Typography>
                    </Container>
                    <Button size="md" color="secondary" variant="solid" onClick={() => navigate(start)}>{mainAction}</Button>
                </Container>
            </Container>
        </Page>
    );
};

// The desktop app opens on the dashboard, or on a short sign-in prompt, not on the public home page.
export const DesktopHome = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    if (user) return <Navigate to="/dashboard" replace />;
    return (
        <Page layout="flex" align="center" justify="center" background="dots" backgroundFade="radial">
            <Card layout="flex-column" padding="xl" align="center" gap="lg" width="100%" maxWidth="420px">
                <Wordmark />
                <Container layout="flex-column" align="center" gap="xs" padding="none" width="100%" wrap={false}>
                    <Typography as="h1" size="lg" weight="semibold" font="secondary" align="center">Sign in to Mollama</Typography>
                    <Typography size="xs" color="muted" align="center">Use your models and devices from this computer.</Typography>
                </Container>
                <Container layout="flex" justify="center" gap="sm" padding="none">
                    <Button size="md" color="secondary" variant="solid" onClick={() => navigate('/login')}>Sign in</Button>
                    <Button size="md" onClick={() => navigate('/signup')}>Create an account</Button>
                </Container>
            </Card>
        </Page>
    );
};

export default HomePage;
