import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSearchParams } from 'react-router-dom';
import { Page, Container, Card, Typography, Button, ButtonGroup, Badge, Divider, Icon, Input, Select, Genie, Pagination } from '@components/Components';
import { useNotification } from '@contexts/NotificationContext';
import { toolService, skillService, deviceService, describeError, onReturn } from '../client/ai.client';

const STALE_MS = 60 * 1000;
// Each listed app's own logo, where the icon sets have one. The few without one get a plain icon for what they do.
const APP_ICONS = {
    Notion: 'SiNotion', Atlassian: 'SiAtlassian', Airtable: 'SiAirtable', Coda: 'SiCoda', Linear: 'SiLinear', ClickUp: 'SiClickup', Trello: 'SiTrello', Todoist: 'SiTodoist',
    'monday.com': 'TbBrandMonday', GitHub: 'SiGithub', GitLab: 'SiGitlab', Sentry: 'SiSentry', Netlify: 'SiNetlify', Cloudflare: 'SiCloudflare', 'Cloudflare Docs': 'SiCloudflare',
    Supabase: 'SiSupabase', Neon: 'SiNeon', PostHog: 'SiPosthog', Context7: 'SiUpstash', Miro: 'SiMiro', Webflow: 'SiWebflow', Wix: 'SiWix', 'WordPress.com': 'SiWordpress',
    Calendly: 'SiCalendly', Stripe: 'SiStripe', 'Hugging Face': 'SiHuggingface', Zapier: 'SiZapier', Make: 'SiMake',
    DeepWiki: 'FiBookOpen', Exa: 'FiSearch', Firecrawl: 'FiSearch', Tavily: 'FiSearch',
    Blender: 'SiBlender', 'Chrome DevTools': 'SiGooglechrome', Playwright: 'FiMousePointer', Docker: 'SiDocker', Xcode: 'SiXcode', Godot: 'SiGodotengine', FreeCAD: 'SiFreecad',
    'Ableton Live': 'FiMusic', 'Files on this computer': 'FiFolder', 'Excel files': 'FiGrid', Git: 'SiGit', 'Fetch a web page': 'FiDownloadCloud', Memory: 'FiDatabase',
    'Date and time': 'FiClock', 'Step-by-step thinking': 'FiList'
};
const MADE_BY = { maker: 'Made by the app\'s own maker', standard: 'Made by the group behind the tool-server standard', community: 'Made by the community' };
const HEALTH_COLORS = { healthy: 'success', unchecked: 'default', signin: 'warning', empty: 'warning', busy: 'warning', offline: 'default', waiting: 'warning' };

// A sign-in page opens in a tab of its own. The tab is opened at the click, before anything is asked of the server,
// because browsers block a tab opened later. Inside the desktop app the link is handed to the person's browser instead.
const openTab = () => {
    if (window.desktop) return null;
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    return tab;
};
const sendTo = (tab, url) => {
    if (tab && !tab.closed) tab.location.replace(url);
    else window.location.assign(url);
};

const Section = ({ title, note, children }) => (
    <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%" wrap={false}>
        <Container layout="flex-column" gap="none" padding="none" minWidth="0">
            <Typography as="h2" size="sm" weight="semibold">{title}</Typography>
            {note && <Typography size="xxs" color="muted">{note}</Typography>}
        </Container>
        {children}
    </Container>
);

// What a local tool server needs, checked against what the desktop app found on this computer.
const PROGRAM_INFO = {
    node: { name: 'Node.js', page: 'https://nodejs.org/' },
    uv: { name: 'uv', page: 'https://docs.astral.sh/uv/getting-started/installation/' },
    docker: { name: 'Docker', page: 'https://www.docker.com/products/docker-desktop/' },
    git: { name: 'Git', page: 'https://git-scm.com/downloads' },
    python: { name: 'Python', page: 'https://www.python.org/downloads/' }
};
const APP_INFO = { blender: 'Blender', chrome: 'Google Chrome', freecad: 'FreeCAD', godot: 'Godot', ableton: 'Ableton Live', xcode: 'Xcode', dockerdesktop: 'Docker Desktop', git: 'Git' };
const programFound = (scan, id) => (id === 'xcode' ? scan?.apps?.xcode : scan?.programs?.[id]?.found);
const appFound = (scan, id) => (id === 'git' ? scan?.programs?.git?.found : id === 'dockerdesktop' ? (scan?.apps?.dockerdesktop || scan?.programs?.docker?.found) : scan?.apps?.[id]);
// Ready: on a computer the app supports, with its program and its app found. Unknown (no scan yet) is not ready.
const readiness = (entry, scan) => {
    if (!scan) return { ready: false, known: false, missing: [] };
    if (entry.only === 'macOS' && scan.platform !== 'darwin') return { ready: false, known: true, unavailable: true, missing: [] };
    const missing = [];
    if (entry.requires?.program && !programFound(scan, entry.requires.program)) missing.push(PROGRAM_INFO[entry.requires.program]?.name || entry.requires.program);
    if (entry.requires?.app && entry.requires.app !== entry.requires.program && !appFound(scan, entry.requires.app)) missing.push(APP_INFO[entry.requires.app] || entry.requires.app);
    return { ready: missing.length === 0, known: true, missing };
};
const openPage = (address) => window.open(address, '_blank', 'noopener');

const Check = ({ ok, children, action }) => (
    <Container layout="flex" align="center" gap="xs" padding="none" width="100%" wrap={false}>
        <Icon name={ok ? 'FiCheckCircle' : 'FiCircle'} size="xs" color={ok ? 'success' : 'warning'} />
        <Typography size="xs" color={ok ? 'default' : 'muted'}>{children}</Typography>
        {action}
    </Container>
);

// What this computer has for local tool servers, read by the desktop app: found programs, with an install page for
// each missing one, and Check again after installing.
const ComputerScan = ({ scan, scanning, onScan }) => (
    <Card layout="flex-column" gap="xs" padding="sm" width="100%" hover={false}>
        <Container layout="flex" align="center" justify="between" gap="xs" padding="none" width="100%" wrap={false}>
            <Container layout="flex" align="center" gap="xs" padding="none" wrap={false} minWidth="0">
                <Icon name="FiCpu" size="sm" color="primary" />
                <Typography size="sm" weight="semibold">This computer has</Typography>
                {!scan && <Typography size="xs" color="muted">{scanning ? 'Looking…' : 'Not checked yet.'}</Typography>}
            </Container>
            <Button size="xs" color="secondary" disabled={scanning} title="Look again, after installing something" onClick={onScan}><Icon name="FiRefreshCw" size="xs" />{scanning ? 'Checking…' : 'Check again'}</Button>
        </Container>
        {scan && (
            <Container layout="grid" columns={5} gap="xs" padding="none" width="100%">
                {Object.entries(PROGRAM_INFO).map(([id, info]) => {
                    const found = scan.programs?.[id]?.found;
                    return (
                        <Check key={id} ok={found} action={!found && <Button size="xs" variant="ghost" title={`Opens the ${info.name} download page`} onClick={() => openPage(info.page)}>Install</Button>}>
                            {found ? `${info.name} ${scan.programs[id].version || ''}` : info.name}
                        </Check>
                    );
                })}
            </Container>
        )}
    </Card>
);

// Everything about adding one local app, inside the Genie of its button: what it needs (ticked off where found), its
// own steps, a folder when it works on one, what it will run, its caution, and Add.
const LocalSetup = ({ entry, scan, bridge, adding, onAdd }) => {
    const [folder, setFolder] = useState('');
    const state = readiness(entry, scan);
    const args = entry.args.replace('<folder>', folder.includes(' ') ? `"${folder}"` : folder);
    const program = entry.requires?.program;
    const appId = entry.requires?.app;
    const blocked = state.unavailable || (entry.folder && !folder.trim()) || (program && scan && !programFound(scan, program));
    return (
        <Container layout="flex-column" gap="xs" padding="none" width="100%">
            <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                <Icon name={APP_ICONS[entry.name] || 'FiMonitor'} size="sm" color="primary" />
                <Typography size="sm" weight="semibold">Set up {entry.name}</Typography>
            </Container>
            <Typography size="xxs" color="muted">{MADE_BY[entry.by]}</Typography>
            {state.unavailable && <Typography size="xs" color="warning">{entry.name} works on {entry.only} only.</Typography>}
            {program && program !== 'xcode' && (
                <Check ok={programFound(scan, program)} action={!programFound(scan, program) && PROGRAM_INFO[program] && <Button size="xs" color="secondary" onClick={() => openPage(PROGRAM_INFO[program].page)}><Icon name="FiDownload" size="xs" />Install</Button>}>
                    {programFound(scan, program) ? `${PROGRAM_INFO[program]?.name} is installed` : `${PROGRAM_INFO[program]?.name || program} is needed`}
                </Check>
            )}
            {appId && appId !== program && (
                <Check ok={appFound(scan, appId)}>
                    {appFound(scan, appId) ? `${APP_INFO[appId]} is on this computer` : `${APP_INFO[appId]} was not found here. Install it, or set up anyway if it is installed somewhere else.`}
                </Check>
            )}
            {entry.steps.map((step, index) => <Typography key={step} size="xs">{index + 1}. {step}</Typography>)}
            {entry.folder && (
                <Container layout="flex" align="end" gap="xs" padding="none" width="100%" wrap={false}>
                    <Input size="sm" label="Folder it may use" value={folder} onChange={(event) => setFolder(event.target.value)} width="100%" />
                    {bridge?.pickFolder && <Button size="sm" color="secondary" onClick={async () => { const chosen = await bridge.pickFolder(); if (chosen) setFolder(chosen); }}><Icon name="FiFolder" size="xs" />Choose</Button>}
                </Container>
            )}
            <Typography size="xxs" color="muted">It will run: <Typography as="span" size="xxs" font="monospace">{entry.command} {entry.folder && !folder ? entry.args : args}</Typography></Typography>
            {entry.caution && (
                <Container layout="flex" align="start" gap="xs" padding="none" wrap={false}>
                    <Icon name="FiAlertTriangle" size="xs" color="warning" />
                    <Typography size="xs">{entry.caution}</Typography>
                </Container>
            )}
            <Container layout="flex" justify="end" padding="none" width="100%">
                <Button size="sm" color="primary" disabled={adding || blocked} title={blocked ? (entry.folder && !folder.trim() ? 'Choose the folder first' : 'Install what it needs first') : undefined} onClick={() => onAdd({ name: entry.name, command: entry.command, args })}>
                    <Icon name="FiPlus" size="xs" />{adding ? 'Adding…' : `Add ${entry.name}`}
                </Button>
            </Container>
        </Container>
    );
};

// What an app's MCP setup instructions give, read into a name, a program and what to pass to it: a JSON block
// ({"mcpServers": {"blender": {"command": "uvx", "args": ["blender-mcp"]}}} or one server alone), a line that adds it
// to another app (claude mcp add blender -- uvx blender-mcp), or the command line itself.
const quoteArg = (arg) => (/\s/.test(arg) ? `"${arg}"` : arg);
const readSnippet = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        const json = JSON.parse(raw.startsWith('"') ? `{${raw}}` : raw);
        const holder = json.mcpServers || json.servers || json.mcp?.servers || json;
        const [name, server] = holder.command ? ['', holder] : Object.entries(holder).find(([, one]) => one && typeof one === 'object' && one.command) || [];
        if (server?.command) return { name: name || '', command: String(server.command), args: (server.args || []).map((arg) => quoteArg(String(arg))).join(' '), env: Object.keys(server.env || {}) };
    } catch {
        // Not JSON: a command line.
    }
    const words = raw.replace(/\\\n/g, ' ').match(/"[^"]*"|'[^']*'|\S+/g) || [];
    const add = words.findIndex((word, at) => word === 'add' && words[at - 1] === 'mcp');
    if (add >= 0 && words.includes('--')) {
        const name = words.slice(add + 1, words.indexOf('--')).filter((word, at, list) => !word.startsWith('-') && !(list[at - 1] || '').startsWith('-')).pop() || '';
        const [command, ...args] = words.slice(words.indexOf('--') + 1);
        return command ? { name, command, args: args.join(' '), env: [] } : null;
    }
    const [command, ...args] = words;
    return command ? { name: '', command, args: args.join(' '), env: [] } : null;
};

// Adding a local tool server by hand, from an app's own MCP instructions, inside the Genie of its button.
const LocalOwn = ({ adding, onAdd }) => {
    const [form, setForm] = useState({ name: '', command: '', args: '' });
    const [pasted, setPasted] = useState('');
    const [needsEnv, setNeedsEnv] = useState([]);
    const fillFrom = (text) => {
        setPasted(text);
        const read = readSnippet(text);
        if (!read) return;
        setForm((now) => ({ name: now.name || (read.name ? read.name.charAt(0).toUpperCase() + read.name.slice(1) : ''), command: read.command, args: read.args }));
        setNeedsEnv(read.env);
    };
    const runs = [form.command.trim(), form.args.trim()].filter(Boolean).join(' ');
    return (
        <Container layout="flex-column" gap="xs" padding="none" width="100%">
            <Typography size="sm" weight="semibold">Add your own app on this computer</Typography>
            <Typography size="xs" color="muted">For an app that is not in the list. Its maker's MCP setup instructions say how to start its tool server: paste what they give, or fill in the three boxes yourself. What you enter stays on this computer.</Typography>
            <Input size="sm" multiline rows={3} label="Paste from the app's instructions (optional)" helpText='A JSON block with "command" and "args", a line like claude mcp add blender -- uvx blender-mcp, or the command itself. The boxes below fill in.' value={pasted} onChange={(e) => fillFrom(e.target.value)} width="100%" />
            <Input size="sm" label="Name" helpText="What it is called in Mollama, for example Blender" value={form.name} onChange={(e) => setForm((now) => ({ ...now, name: e.target.value }))} width="100%" />
            <Input size="sm" label="Program that starts its tool server" helpText="Usually uvx (needs uv) or npx (needs Node.js), sometimes docker or the app's own program" value={form.command} onChange={(e) => setForm((now) => ({ ...now, command: e.target.value }))} width="100%" />
            <Input size="sm" label="What to pass to it" helpText="Everything after the program, for example blender-mcp, or -y @playwright/mcp@latest" value={form.args} onChange={(e) => setForm((now) => ({ ...now, args: e.target.value }))} width="100%" />
            {runs && <Typography size="xxs" color="muted">It will run: <Typography as="span" size="xxs" font="monospace">{runs}</Typography></Typography>}
            {/<[^>]*>/.test(form.args) && <Typography size="xs" color="warning">Replace the part in angle brackets with your own value first, such as a folder.</Typography>}
            {needsEnv.length > 0 && (
                <Container layout="flex" align="start" gap="xs" padding="none" wrap={false}>
                    <Icon name="FiAlertTriangle" size="xs" color="warning" />
                    <Typography size="xs">Its instructions also set {needsEnv.join(', ')}. Mollama cannot pass settings like these yet, so it may not start; set them on this computer first if its maker allows.</Typography>
                </Container>
            )}
            <Container layout="flex" justify="end" padding="none" width="100%">
                <Button size="sm" color="primary" disabled={adding || !form.name.trim() || !form.command.trim() || /<[^>]*>/.test(form.args)} title={!form.name.trim() || !form.command.trim() ? 'Give it a name and the program first' : undefined} onClick={async () => { if (await onAdd(form)) { setForm({ name: '', command: '', args: '' }); setPasted(''); setNeedsEnv([]); } }}>
                    <Icon name="FiPlus" size="xs" />{adding ? 'Adding…' : 'Add and check it'}
                </Button>
            </Container>
        </Container>
    );
};

// Adding an online app by its address, or a listed one that needs a key, inside the Genie of its button.
const RemoteAdd = ({ entry = null, adding, onAdd }) => {
    const [form, setForm] = useState({ name: entry?.name || '', address: entry?.address || '', key: '' });
    const keyed = Boolean(entry?.key);
    return (
        <Container layout="flex-column" gap="xs" padding="none" width="100%">
            <Typography size="sm" weight="semibold">{keyed ? `Add ${entry.name} with a key` : 'Add an app by its address'}</Typography>
            {keyed ? (
                <>
                    <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                        <Typography size="xxs" color="muted">{entry.key.cost}</Typography>
                        <Button size="xs" color="secondary" title="Opens in a new tab" onClick={() => openPage(entry.key.page)}><Icon name="FiExternalLink" size="xs" />Open the key page</Button>
                    </Container>
                    {entry.key.steps.map((step, index) => <Typography key={step} size="xs">{index + 1}. {step}</Typography>)}
                </>
            ) : (
                <>
                    <Typography size="xs" color="muted">The MCP address from the app's own help pages. Leave the key empty to sign in with your account after adding.</Typography>
                    <Input size="sm" label="Name" value={form.name} onChange={(e) => setForm((now) => ({ ...now, name: e.target.value }))} width="100%" />
                    <Input size="sm" label="Tool server address" helpText="Starts with https://" value={form.address} onChange={(e) => setForm((now) => ({ ...now, address: e.target.value }))} width="100%" />
                </>
            )}
            <Input size="sm" label={keyed ? 'Key' : 'Key (only if the app gave you one)'} type="password" value={form.key} onChange={(e) => setForm((now) => ({ ...now, key: e.target.value }))} width="100%" />
            <Typography size="xxs" color="muted">A key is stored sealed on Mollama's server and is never shown again or sent to a model.</Typography>
            <Container layout="flex" justify="end" padding="none" width="100%">
                <Button size="sm" color="primary" disabled={adding || !form.name.trim() || !/^https:\/\/\S+$/.test(form.address.trim()) || (keyed && !form.key.trim())} onClick={async () => { if (await onAdd(form)) setForm({ name: entry?.name || '', address: entry?.address || '', key: '' }); }}>
                    <Icon name="FiPlus" size="xs" />{adding ? 'Adding…' : 'Add'}
                </Button>
            </Container>
        </Container>
    );
};

const ServerCard = ({ server, icon, where, busy, onCheck, onSignIn, onRemove }) => {
    const [showTools, setShowTools] = useState(false);
    const { health } = server;
    const ready = health.state === 'healthy';
    const canSignIn = server.kind === 'remote' && ['signin', 'refused'].includes(health.state);

    return (
        <Card layout="flex-column" gap="xs" padding="sm" width="100%" minWidth="0" hover={false}>
            <Container layout="flex" align="center" justify="between" gap="xs" padding="none" width="100%" wrap={false}>
                <Container layout="flex" align="center" gap="xs" padding="none" wrap={false} minWidth="0">
                    <Icon name={icon} size="sm" color="primary" />
                    <Typography size="sm" weight="semibold" truncate>{server.name}</Typography>
                </Container>
                <Badge size="xs" color={HEALTH_COLORS[health.state] || 'error'}>{health.label}</Badge>
            </Container>
            <Typography size="xxs" color="muted" truncate title={where}>{where}</Typography>

            {!ready && health.needs.map((need) => <Typography key={need} size="xxs">{need}</Typography>)}
            {!ready && health.detail && <Typography size="xxs" color="muted">Reported: {health.detail}</Typography>}

            <Container layout="flex" align="center" justify="between" gap="xs" padding="none" width="100%" wrap={false}>
                {server.tools.length > 0 ? (
                    <Button size="xs" color="secondary" flat onClick={() => setShowTools((shown) => !shown)}>
                        <Icon name={showTools ? 'FiChevronDown' : 'FiChevronRight'} size="xs" />
                        {server.tools.length === 1 ? '1 tool' : `${server.tools.length} tools`}
                    </Button>
                ) : <Typography size="xxs" color="muted">No tools yet</Typography>}
                <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                    {canSignIn && <Button size="xs" color="primary" disabled={busy} title="Opens the app's sign-in page in a new tab" onClick={() => onSignIn(server)}><Icon name="FiLogIn" size="xs" />Sign in</Button>}
                    <Button size="xs" color="secondary" disabled={busy} onClick={() => onCheck(server)}><Icon name="FiRefreshCw" size="xs" />{busy ? 'Checking…' : 'Check'}</Button>
                    <Button size="xs" color="error" disabled={busy} onClick={() => onRemove(server)}><Icon name="FiTrash2" size="xs" />Remove</Button>
                </Container>
            </Container>

            {showTools && server.tools.map((tool) => (
                <Container key={tool.name} layout="flex" align="center" justify="between" gap="xs" padding="none" width="100%" wrap={false}>
                    <Typography size="xxs" truncate title={tool.description || tool.name}>{tool.title || tool.name}</Typography>
                    <Icon name={tool.readOnly ? 'FiEye' : 'FiEdit3'} size="xs" color={tool.readOnly ? 'muted' : 'warning'} title={tool.readOnly ? 'Only reads' : 'Can change things'} aria-label={tool.readOnly ? 'Only reads' : 'Can change things'} />
                </Container>
            ))}
        </Card>
    );
};

const tokensOf = (skill) => `${skill.tokens >= 1000 ? `${(skill.tokens / 1000).toFixed(1)}k` : skill.tokens} tokens`;
const LACKS = {
    commands: 'It tells the model to run commands, and Mollama has no function yet that does what they do.',
    files: 'It refers to files of its own that are not in Mollama yet.'
};
// The steps for running a skill on the person's own computer, with nothing of Mollama's in between.
const PROGRAMS = {
    python: 'Python 3: https://www.python.org/downloads/',
    node: 'Node.js, which brings `npm` and `npx`: https://nodejs.org/',
    uv: 'uv: https://docs.astral.sh/uv/',
    docker: 'Docker Desktop: https://www.docker.com/products/docker-desktop/',
    brew: 'Homebrew, on macOS or Linux: https://brew.sh/',
    git: 'Git: https://git-scm.com/downloads',
    libreoffice: 'LibreOffice: https://www.libreoffice.org/download/',
    poppler: 'poppler: https://poppler.freedesktop.org/',
    shell: 'A Unix shell. macOS and Linux have one; on Windows use Git Bash, which comes with Git, or WSL.'
};
const localSteps = (skill) => {
    const setup = skill.setup;
    if (!setup) return '';
    const from = setup.address ? [setup.address] : setup.repos.map((repo) => `https://github.com/${repo}`);
    const steps = [];
    if (setup.programs.length > 0) steps.push(`Install what it calls:\n${setup.programs.map((id) => `   - ${PROGRAMS[id]}`).join('\n')}`);
    if (setup.libraries.length > 0) steps.push(`Install its Python libraries: \`pip install ${setup.libraries.join(' ')}\``);
    if (setup.install.length > 0) steps.push(`Get the skill with its author's own command, in a terminal:\n${setup.install.map((line) => `   - \`${line}\``).join('\n')}`);
    else if (from.length > 0) steps.push(`Get the skill's files from ${from.join(' or ')} (the green Code button, then Download ZIP), and unpack them into a folder.`);
    if (setup.runs) steps.push('Open a terminal in the skill\'s folder. When the model gives you a command, run it there and paste back what it prints.');
    else steps.push('Nothing needs installing: this skill is instructions only, so it works with any model, including one running on your own computer.');
    return `**On your own computer**\n\n${steps.map((step, at) => `${at + 1}. ${step}`).join('\n')}`;
};
const partly = (skill) => `Its guidance works in a chat. ${(skill.needs || []).map((need) => LACKS[need]).filter(Boolean).join(' ')}`;

const SkillCard = ({ skill, onView, children }) => (
    <Card padding="sm" width="100%" minWidth="0" hover={false}>
        <Container layout="flex-column" gap="xs" padding="none" width="100%" minWidth="0">
            <Container layout="flex" wrap={false} align="center" justify="between" gap="xs" padding="none" width="100%">
                <Typography size="xs" weight="semibold" truncate title={skill.name}>{skill.name}</Typography>
                <Typography size="xxs" color="muted">{tokensOf(skill)}</Typography>
            </Container>
            <Typography size="xxs" color="muted" truncate title={skill.description}>{skill.description || 'No description.'}</Typography>
            <Container layout="flex" wrap={false} align="center" justify="between" gap="xs" padding="none" width="100%">
                {skill.needs?.length > 0 ? <Badge size="xs" color="warning" title={partly(skill)}>Guidance only</Badge>
                    : skill.toolServers?.some((tool) => !tool.ready) ? <Badge size="xs" color="warning" title="It uses tool servers that are not connected and ready on your account. Connect them on the Remote tab.">Needs {skill.toolServers.filter((tool) => !tool.ready).map((tool) => tool.name).join(', ')}</Badge>
                    : <Container padding="none" />}
                <ButtonGroup size="xs" selectable={false} wrap={false} justify="end">
                    <Button size="xs" variant="ghost" onClick={(event) => onView(skill, event.currentTarget)}>View</Button>
                    {children}
                </ButtonGroup>
            </Container>
        </Container>
    </Card>
);

const SkillsView = () => {
    const { success, error: showError, confirm } = useNotification();
    const [data, setData] = useState(null);
    const [failed, setFailed] = useState(false);
    const [find, setFind] = useState('');
    const [source, setSource] = useState('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);
    const [address, setAddress] = useState('');
    const [adding, setAdding] = useState(false);
    const [open, setOpen] = useState(null);
    const trigger = useRef(null);

    const load = useCallback(() => {
        skillService.list().then((result) => {
            setData(result);
            setFailed(false);
        }).catch(() => setFailed(true));
    }, []);
    useEffect(() => {
        load();
    }, [load]);

    const viewSkill = async (skill, element) => {
        trigger.current = element;
        setOpen({ ...skill, text: null });
        try {
            const whole = (await skillService.read(skill.id)).skill;
            setOpen((now) => (now && now.id === whole.id ? whole : now));
        } catch (error) {
            setOpen(null);
            showError(describeError(error, 'This skill could not be opened.'));
        }
    };
    const add = async () => {
        setAdding(true);
        try {
            const added = (await skillService.add(address.trim())).skill;
            success(`${added.name} was added. Turn it on in a chat's Skills.`);
            setAddress('');
            load();
        } catch (error) {
            showError(describeError(error, 'This skill could not be added.'));
        }
        setAdding(false);
    };
    const remove = async (skill) => {
        if (!(await confirm(`Remove ${skill.name}? Chats that use it carry on without it.`, { confirmLabel: 'Remove', color: 'error' }))) return;
        try {
            await skillService.remove(skill.id);
            success(`${skill.name} was removed.`);
            load();
        } catch (error) {
            showError(describeError(error, 'This skill could not be removed.'));
        }
    };
    const readAgain = async (skill) => {
        try {
            await skillService.add(skill.credit);
            success(`${skill.name} was read again from its address.`);
            load();
        } catch (error) {
            showError(describeError(error, 'This skill could not be read again.'));
        }
    };

    if (failed) {
        return (
            <Card padding="md" width="100%" hover={false}>
                <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%" wrap={false}>
                    <Typography size="sm" weight="semibold">The skills could not be loaded.</Typography>
                    <Button size="sm" onClick={load}>Try again</Button>
                </Container>
            </Card>
        );
    }
    if (!data) return <Typography size="xs" color="muted">Loading the skills…</Typography>;

    const mine = (data.skills || []).filter((skill) => skill.source === 'mine');
    const suggested = (data.skills || []).filter((skill) => skill.suggested);
    const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const library = (data.skills || [])
        .filter((skill) => skill.source !== 'mine' && (source === 'all' || skill.source === source))
        .filter((skill) => words.every((word) => `${skill.name} ${skill.description}`.toLowerCase().includes(word)));
    const pages = Math.max(1, Math.ceil(library.length / pageSize));
    const shown = library.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            <Container layout="flex" align="start" gap="lg" padding="none" width="100%" wrap={false}>
                <Container layout="flex-column" gap="md" padding="none" flexFill minWidth="0">
                    <Section title="Suggested for small models" note="Short skills that work as a conversation and need nothing extra, so a small model can follow them." />
                    <Container layout="grid" columns={3} gap="sm" padding="none" width="100%">
                        {suggested.map((skill) => <SkillCard key={skill.id} skill={skill} onView={viewSkill} />)}
                    </Container>

                    <Section title={`Library (${library.length})`} note="Skills from open projects. A chat is sent only the skills turned on for it, and nothing else. Turn them on in a chat's Skills, up to eight at a time; each switch is saved as you flip it.">
                        <Container layout="flex" wrap={false} align="center" gap="xs" padding="none" width="460px">
                            <Input type="search" size="sm" width="100%" placeholder="Search skills" value={find} onChange={(event) => { setFind(event.target.value); setPage(1); }} aria-label="Search skills" />
                            <Select
                                size="sm"
                                width="220px"
                                value={source}
                                options={[{ value: 'all', label: 'All projects' }, ...(data.sources || []).filter((entry) => entry.id !== 'mine').map((entry) => ({ value: entry.id, label: `${entry.name} (${entry.count})` }))]}
                                onChange={(chosen) => { setSource(String(chosen?.target?.value ?? chosen)); setPage(1); }}
                                aria-label="Show skills from"
                            />
                        </Container>
                    </Section>
                    {shown.length === 0 && <Typography size="xs" color="muted">No skill matches.</Typography>}
                    <Container layout="grid" columns={3} gap="sm" padding="none" width="100%">
                        {shown.map((skill) => <SkillCard key={skill.id} skill={skill} onView={viewSkill} />)}
                    </Container>
                    {library.length > 12 && (
                        <Pagination page={Math.min(page, pages)} pages={pages} onPage={setPage} pageSize={pageSize} pageSizes={[12, 24, 48]} onPageSize={(size) => { setPageSize(size); setPage(1); }} size="xs" padding="none" />
                    )}

                </Container>
                <Divider orientation="vertical" />
                <Container layout="flex-column" gap="sm" padding="none" width="340px" minWidth="340px">
                    <Section title={`My skills (${mine.length})`} note="Skills you add yourself. They are kept with your account, so every app you sign in to has them." />
                    <Card padding="sm" width="100%" hover={false}>
                        <Container layout="flex-column" gap="xs" padding="none" width="100%">
                            <Input type="search" size="sm" width="100%" label="Add a skill by its address" placeholder="https://github.com/owner/project/tree/main/skills/name" value={address} onChange={(event) => setAddress(event.target.value)} />
                            <Typography size="xxs" color="muted">Paste the address of a SKILL.md file, or of the folder on GitHub that holds one. Only its text is read.</Typography>
                            <Container layout="flex" justify="end" padding="none" width="100%">
                                <Button size="sm" color="primary" disabled={adding || !/^https:\/\/\S+$/.test(address.trim()) || mine.length >= (data.maxOwnSkills || 50)} onClick={add}>{adding ? 'Reading…' : 'Add'}</Button>
                            </Container>
                        </Container>
                    </Card>
                    {mine.length === 0 && <Typography size="xs" color="muted">You have not added any skills yet. Once you add one it appears here, and you can turn it on in a chat.</Typography>}
                    {mine.map((skill) => (
                        <SkillCard key={skill.id} skill={skill} onView={viewSkill}>
                            <Button size="xs" variant="ghost" title="Read the skill again from its address" onClick={() => readAgain(skill)}>Read again</Button>
                            <Button size="xs" variant="ghost" color="error" onClick={() => remove(skill)}>Remove</Button>
                        </SkillCard>
                    ))}
                    <Typography size="xxs" color="muted">A skill becomes instructions your models follow, so add only skills from people you trust, and read one before you use it.</Typography>
                </Container>
            </Container>

            <Genie visible={Boolean(open)} onClose={() => setOpen(null)} triggerRef={trigger} variant="popover" width="720px" maxWidth="94vw" maxHeight="84vh" padding="sm">
                {open && (
                    <Container layout="flex-column" wrap={false} gap="xs" padding="xs" width="100%">
                        <Container layout="flex" wrap={false} align="center" justify="between" gap="sm" padding="none" width="100%">
                            <Typography size="sm" weight="semibold">{open.name}</Typography>
                            <Typography size="xxs" color="muted">{tokensOf(open)}</Typography>
                        </Container>
                        {open.description && <Typography size="xs" color="muted">{open.description}</Typography>}
                        {open.credit && <Typography size="xxs" color="muted">{`From ${open.credit}`}</Typography>}
                        {open.needs?.length > 0 && <Typography size="xxs" color="warning">{partly(open)}</Typography>}
                        {(open.toolServers || []).map((tool) => (
                            <Container key={tool.name} layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                                <Icon name={tool.ready ? 'FiCheckCircle' : 'FiCircle'} size="xs" color={tool.ready ? 'success' : 'warning'} />
                                <Typography size="xxs">{tool.ready ? `Uses the ${tool.name} tool server, which is connected and ready.` : `Uses the ${tool.name} tool server, which is not connected and ready on your account yet.`}</Typography>
                                {!tool.ready && <Typography size="xxs" href="/tools">Connect it</Typography>}
                            </Container>
                        ))}
                        {open.setup && <Typography as="div" size="xxs" color="muted"><ReactMarkdown remarkPlugins={[remarkGfm]}>{localSteps(open)}</ReactMarkdown></Typography>}
                        <Divider margin="xs" />
                        {open.text === null
                            ? <Typography size="xs" color="muted">Reading the skill…</Typography>
                            : <Typography as="div" size="xs"><ReactMarkdown remarkPlugins={[remarkGfm]}>{open.text}</ReactMarkdown></Typography>}
                    </Container>
                )}
            </Genie>
        </Container>
    );
};

const ToolsPage = () => {
    const { success, error: showError, confirm } = useNotification();
    const [params, setParams] = useSearchParams();
    // The view is in the address, left out on the first one, so Back returns to the previous tab.
    const view = ['local', 'skills'].includes(params.get('view')) ? params.get('view') : 'remote';
    const [servers, setServers] = useState(null);
    const [devices, setDevices] = useState([]);
    const [apps, setApps] = useState([]);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState({});
    const [here, setHere] = useState(null);
    const [adding, setAdding] = useState(null);
    const [find, setFind] = useState('');
    const [localApps, setLocalApps] = useState([]);
    const localBridge = window.desktop?.tools || null;
    // What this computer has, read by the desktop app when the Local view opens and on Check again.
    const [scan, setScan] = useState(null);
    const [scanning, setScanning] = useState(false);
    const runScan = useCallback(async () => {
        if (!localBridge?.scan) return;
        setScanning(true);
        try {
            setScan(await localBridge.scan());
        } catch {
            setScan(null);
        }
        setScanning(false);
    }, [localBridge]);
    useEffect(() => {
        if (view === 'local' && !scan) runScan();
    }, [view]);

    const replace = (server) => setServers((current) => (current || []).map((one) => (one.id === server.id ? server : one)));
    const check = useCallback(async (server) => {
        setBusy((current) => ({ ...current, [server.id]: true }));
        try {
            replace((await toolService.check(server.id)).server);
        } catch (error) {
            showError(describeError(error, 'This tool server could not be checked.'));
        } finally {
            setBusy((current) => ({ ...current, [server.id]: false }));
        }
    }, [showError]);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const listed = await toolService.list();
            setServers(listed.servers);
            listed.servers
                .filter((server) => !server.health.checkedAt || Date.now() - new Date(server.health.checkedAt).getTime() > STALE_MS)
                .forEach(check);
        } catch {
            setFailed(true);
        }
    }, [check]);

    useEffect(() => {
        load();
        toolService.catalogue().then((catalogue) => { setApps(catalogue.apps || []); setLocalApps(catalogue.localApps || []); }).catch(() => undefined);
        deviceService.listDevices().then((computers) => setDevices(computers.devices || [])).catch(() => undefined);
        window.desktop?.deviceState?.().then((state) => setHere(state?.deviceId || null));
        return onReturn(load);
    }, [load]);

    const tellResult = useCallback((result) => {
        if (result === 'done') success('Signed in. The tools are ready to use.');
        else showError('The sign-in did not finish. Choose Sign in to try again.');
    }, [success, showError]);

    // The sign-in tab ends up back on this page. It passes the result to the tab the person started from and closes;
    // if no other tab is listening, it stays open as the Tools page.
    useEffect(() => {
        const channel = new BroadcastChannel('mollama-tools');
        const result = params.get('signin');
        let timer = null;
        channel.onmessage = (event) => {
            if (event.data?.heard) return;
            if (event.data?.signin) {
                channel.postMessage({ heard: true });
                tellResult(event.data.signin);
                load();
            }
        };
        if (result) {
            setParams({}, { replace: true });
            const waiting = new BroadcastChannel('mollama-tools');
            waiting.onmessage = (event) => {
                if (!event.data?.heard) return;
                clearTimeout(timer);
                timer = null;
                window.close();
            };
            waiting.postMessage({ signin: result });
            timer = setTimeout(() => { tellResult(result); waiting.close(); }, 600);
        }
        return () => channel.close();
    }, []);

    const signIn = async (server, tab = openTab()) => {
        setBusy((current) => ({ ...current, [server.id]: true }));
        try {
            const started = await toolService.signIn(server.id);
            if (started.url) sendTo(tab, started.url);
            else {
                tab?.close();
                replace(started.server);
            }
        } catch (error) {
            tab?.close();
            showError(describeError(error, 'The sign-in could not be started.'));
        }
        setBusy((current) => ({ ...current, [server.id]: false }));
    };

    const remove = async (server) => {
        if (!await confirm(`Remove ${server.name}? Its tools will no longer be available in any chat.`, { confirmLabel: 'Remove', color: 'error' })) return;
        try {
            await toolService.remove(server.id);
            if (server.kind === 'local' && server.device === here) await localBridge?.remove?.(server.localId);
            setServers((current) => current.filter((one) => one.id !== server.id));
        } catch (error) {
            showError(describeError(error, 'This tool server could not be removed.'));
        }
    };

    const addRemote = async (form) => {
        setAdding('remote');
        try {
            const { server } = await toolService.add({ kind: 'remote', name: form.name.trim(), address: form.address.trim(), ...(form.key.trim() ? { key: form.key.trim() } : {}) });
            setServers((current) => [...(current || []), server]);
            success(`${server.name} is added.`);
            setAdding(null);
            return true;
        } catch (error) {
            showError(describeError(error, 'This app could not be added. Check that the address starts with https.'));
            setAdding(null);
            return false;
        }
    };

    // One step for a listed app: add it, then go straight to its sign-in page when it asks for an account.
    const addApp = async (entry) => {
        setAdding(entry.address);
        const tab = entry.signIn === 'account' ? openTab() : null;
        try {
            const { server } = await toolService.add({ kind: 'remote', name: entry.name, address: entry.address });
            setServers((current) => [...(current || []), server]);
            if (server.health.state === 'signin') await signIn(server, tab);
            else tab?.close();
        } catch (error) {
            tab?.close();
            showError(describeError(error, 'This app could not be added.'));
        }
        return setAdding(null);
    };

    const addLocal = async (form) => {
        setAdding(form.name);
        try {
            const made = await localBridge.add({ name: form.name.trim(), command: form.command.trim(), args: form.args.trim() });
            if (!made?.localId) throw new Error('not saved');
            const { server } = await toolService.add({ kind: 'local', name: form.name.trim(), device: here, localId: made.localId });
            setServers((current) => [...(current || []), server]);
            success(`${server.name} is added and being checked.`);
            setAdding(null);
            return true;
        } catch (error) {
            showError(describeError(error, 'This tool server could not be added on this computer.'));
            setAdding(null);
            return false;
        }
    };

    const pick = (next) => {
        if (next !== view) setParams(next === 'remote' ? {} : { view: next });
    };
    const computerName = (id) => devices.find((device) => device.id === id)?.name || 'a computer that is no longer linked';
    const remotes = (servers || []).filter((server) => server.kind === 'remote');
    const locals = (servers || []).filter((server) => server.kind === 'local');
    const cardProps = { onCheck: check, onSignIn: signIn, onRemove: remove };
    const listed = new Map(apps.map((entry) => [entry.address, entry]));
    const added = new Set(remotes.map((server) => server.address));
    const words = find.trim().toLowerCase();
    const shownApps = apps.filter((entry) => !added.has(entry.address) && (!words || `${entry.name} ${entry.group} ${entry.does}`.toLowerCase().includes(words)));
    const addedLocal = new Set(locals.map((server) => server.name));
    // Apps whose program and app were found come first, then the rest; a macOS-only one on another system goes last.
    const shownLocal = localApps.filter((entry) => !addedLocal.has(entry.name))
        .map((entry) => ({ entry, state: readiness(entry, scan) }))
        .sort((a, b) => Number(b.state.ready) - Number(a.state.ready) || Number(Boolean(a.state.unavailable)) - Number(Boolean(b.state.unavailable)));
    const canAddLocal = Boolean(localBridge && here);

    return (
        <Page layout="flex-column" padding="none" gap="none" background="dots" backgroundFade="bottom">
            <Container layout="flex-column" align="center" gap="none" padding="none" width="100%" height="100vh" wrap={false} overflow="hidden">
                <Container layout="flex" justify="between" align="center" gap="md" padding="lg" width="100%" maxWidth="1360px" wrap={false}>
                    <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                        <Typography as="h1" size="2xl" weight="bold" animation="blur" animationDuration={600}>Tools</Typography>
                        <Typography size="xs" color="muted">
                            {view === 'skills'
                                ? 'Instructions that teach a model how to do a kind of work. Read them here, add your own, and turn them on in a chat.'
                                : view === 'remote'
                                ? 'Apps that live online. Mollama connects to them from its own server, so they work from any of your devices at any time.'
                                : 'Apps on your own computer. Mollama reaches them through the Mollama desktop app there, so that computer has to be on with the desktop app open.'}
                        </Typography>
                    </Container>
                    <ButtonGroup size="sm" selectable={false} wrap={false} justify="end">
                        <Button size="sm" color={view === 'remote' ? 'primary' : 'secondary'} selected={view === 'remote'} onClick={() => pick('remote')}><Icon name="FiGlobe" size="xs" />Remote{remotes.length > 0 ? ` (${remotes.length})` : ''}</Button>
                        <Button size="sm" color={view === 'local' ? 'primary' : 'secondary'} selected={view === 'local'} onClick={() => pick('local')}><Icon name="FiMonitor" size="xs" />Local{locals.length > 0 ? ` (${locals.length})` : ''}</Button>
                        <Button size="sm" color={view === 'skills' ? 'primary' : 'secondary'} selected={view === 'skills'} onClick={() => pick('skills')}><Icon name="FiZap" size="xs" />Skills</Button>
                    </ButtonGroup>
                </Container>
                <Container layout="flex" justify="center" padding="none" width="100%" flexFill minHeight="0" overflow="auto">
                    <Container layout="flex-column" gap="md" padding="lg" width="100%" maxWidth="1360px" wrap={false}>
                        {view === 'skills' && <SkillsView />}
                        {servers === null && !failed && view !== 'skills' && <Typography size="xs" color="muted">Loading your tools…</Typography>}
                        {failed && view !== 'skills' && (
                            <Card padding="md" width="100%" hover={false}>
                                <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%" wrap={false}>
                                    <Typography size="sm" weight="semibold">Your tools could not be loaded.</Typography>
                                    <Button size="sm" onClick={load}>Try again</Button>
                                </Container>
                            </Card>
                        )}

                        {servers && view === 'remote' && (
                            <Container layout="flex-column" gap="md" padding="none" width="100%">
                            <Container layout="flex" align="start" gap="lg" padding="none" width="100%" wrap={false}>
                                <Container layout="flex-column" gap="md" padding="none" flexFill minWidth="0">
                                {apps.length > 0 && (
                                    <>
                                        <Section title="Apps ready to add" note="Each one is the maker's own tool server. Add it, then sign in to it.">
                                            <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                                                <Container padding="none" width="200px">
                                                    <Input type="search" size="xs" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an app" width="100%" />
                                                </Container>
                                                <Button size="xs" color="secondary" genieTrigger="click" genie={{ trigger: 'click', width: '380px', padding: 'sm', content: <RemoteAdd adding={adding === 'remote'} onAdd={addRemote} /> }}>
                                                    <Icon name="FiLink" size="xs" />Add by address
                                                </Button>
                                            </Container>
                                        </Section>
                                        {shownApps.length === 0 && <Typography size="xs" color="muted">{words ? 'No listed app matches. It can still be added by its address below.' : 'Every listed app is added.'}</Typography>}
                                        <Container layout="grid" columns={3} gap="sm" padding="none" width="100%">
                                            {shownApps.map((entry) => (
                                                <Card key={entry.address} layout="flex-column" gap="xs" padding="sm" width="100%" minWidth="0" hover={false} shadow={false}>
                                                    <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%" wrap={false}>
                                                        <Container layout="flex" align="center" gap="xs" padding="none" wrap={false} minWidth="0">
                                                            <Icon name={APP_ICONS[entry.name] || 'FiGlobe'} size="sm" color="primary" />
                                                            <Typography size="sm" weight="semibold" truncate>{entry.name}</Typography>
                                                        </Container>
                                                        {entry.keyNeeded ? (
                                                            <Button size="xs" color="primary" genieTrigger="click" genie={{ trigger: 'click', width: '380px', padding: 'sm', content: <RemoteAdd entry={entry} adding={adding === 'remote'} onAdd={addRemote} /> }}>
                                                                <Icon name="FiKey" size="xs" />Add with a key
                                                            </Button>
                                                        ) : (
                                                            <Button size="xs" color="primary" disabled={adding === entry.address} onClick={() => addApp(entry)}>
                                                                <Icon name="FiPlus" size="xs" />{adding === entry.address ? 'Adding…' : 'Add'}
                                                            </Button>
                                                        )}
                                                    </Container>
                                                    <Typography size="xs">{entry.does}.</Typography>
                                                </Card>
                                            ))}
                                        </Container>
                                    </>
                                )}

                                </Container>
                                <Divider orientation="vertical" />
                                <Container layout="flex-column" gap="sm" padding="none" width="340px" minWidth="340px">
                                    <Section title="Connected" note="What your models can use. Anything not ready says what it needs." />
                                    {remotes.length === 0 && <Typography size="xs" color="muted">Nothing connected yet.</Typography>}
                                    {remotes.map((server) => <ServerCard key={server.id} server={server} icon={APP_ICONS[listed.get(server.address)?.name] || 'FiGlobe'} where={server.address} busy={Boolean(busy[server.id])} {...cardProps} />)}
                                </Container>
                            </Container>
                            </Container>
                        )}

                        {servers && view === 'local' && (
                            <Container layout="flex-column" gap="md" padding="none" width="100%">
                            <Container layout="flex" align="start" gap="lg" padding="none" width="100%" wrap={false}>
                                <Container layout="flex-column" gap="md" padding="none" flexFill minWidth="0">
                                {canAddLocal && localBridge?.scan && <ComputerScan scan={scan} scanning={scanning} onScan={runScan} />}
                                {!canAddLocal && (
                                    <Card padding="sm" width="100%" hover={false}>
                                        <Typography size="xs" color="muted">
                                            {window.desktop
                                                ? (localBridge ? 'Sign in on this computer first, so it is linked to your account.' : 'This version of the Mollama desktop app cannot run local tools yet. Update it, then open this page again.')
                                                : 'A local app is added from the Mollama desktop app on the computer it is installed on. Open this page there.'}
                                        </Typography>
                                    </Card>
                                )}
                                {localApps.length > 0 && (
                                    <>
                                        <Section title="Apps you can set up" note={scan ? 'Ready ones come first: what they need was found on this computer. Each button shows the steps and adds it.' : 'Tool servers that run on your own computer. Each button shows what it needs and adds it.'}>
                                            {canAddLocal && (
                                                <Button size="xs" color="secondary" genieTrigger="click" genie={{ trigger: 'click', width: '380px', padding: 'sm', content: <LocalOwn adding={adding === 'own'} onAdd={(form) => addLocal(form)} /> }}>
                                                    <Icon name="FiPlus" size="xs" />Add your own
                                                </Button>
                                            )}
                                        </Section>
                                        <Container layout="grid" columns={3} gap="sm" padding="none" width="100%">
                                            {shownLocal.map(({ entry, state }) => (
                                                <Card key={entry.name} layout="flex-column" gap="xs" padding="sm" width="100%" minWidth="0" hover={false} shadow={false}>
                                                    <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%" wrap={false}>
                                                        <Container layout="flex" align="center" gap="xs" padding="none" wrap={false} minWidth="0">
                                                            <Icon name={APP_ICONS[entry.name] || 'FiMonitor'} size="sm" color="primary" />
                                                            <Typography size="sm" weight="semibold" truncate>{entry.name}</Typography>
                                                        </Container>
                                                        <Button size="xs" color={state.ready ? 'primary' : 'secondary'} disabled={!canAddLocal} title={canAddLocal ? undefined : 'Open this page in the Mollama desktop app on that computer'} genieTrigger="click" genie={canAddLocal ? { trigger: 'click', width: '400px', padding: 'sm', content: <LocalSetup entry={entry} scan={scan} bridge={localBridge} adding={adding === entry.name} onAdd={addLocal} /> } : null}>
                                                            <Icon name={state.ready ? 'FiPlus' : 'FiTool'} size="xs" />{state.ready ? 'Add' : 'Set up'}
                                                        </Button>
                                                    </Container>
                                                    <Typography size="xs">{entry.does}.</Typography>
                                                    {(state.unavailable || state.known) && (
                                                        <Container layout="flex" padding="none">
                                                            {state.unavailable
                                                                ? <Badge size="xs" color="secondary">{entry.only} only</Badge>
                                                                : state.ready
                                                                    ? <Badge size="xs" color="success">Everything it needs is here</Badge>
                                                                    : <Badge size="xs" color="warning">Needs {state.missing.join(' and ')}</Badge>}
                                                        </Container>
                                                    )}
                                                </Card>
                                            ))}
                                        </Container>
                                    </>
                                )}

                                </Container>
                                <Divider orientation="vertical" />
                                <Container layout="flex-column" gap="sm" padding="none" width="340px" minWidth="340px">
                                    <Section title="Connected" note="Tool servers on your computers. Anything not ready says what it needs." />
                                    {locals.length === 0 && <Typography size="xs" color="muted">Nothing connected yet.</Typography>}
                                    {locals.map((server) => <ServerCard key={server.id} server={server} icon={APP_ICONS[server.name] || 'FiMonitor'} where={`On ${computerName(server.device)}`} busy={Boolean(busy[server.id])} {...cardProps} />)}
                                </Container>
                            </Container>
                            </Container>
                        )}
                    </Container>
                </Container>
            </Container>
        </Page>
    );
};

export default ToolsPage;
