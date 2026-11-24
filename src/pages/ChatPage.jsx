import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import {
    Page, Container, Card, Typography, Button, ButtonGroup, FloatingActionButton, Badge, Divider, Input, Select, Switch, Icon, Genie,
    ProgressBar, CircularProgress, Data, Flow, TreeView, Image, Video, Audio, PdfViewer, Slides, Sheet, Model3D, Editor, Frame
} from '@components/Components';
import { parseFlow } from '@components/Flow';
import { readAppTheme } from '@components/Frame';
import { useNotification } from '@contexts/NotificationContext';
import { useAuth } from '@contexts/AuthContext';
import { chatService, deviceService, fileService, modelService, promptService, skillService, pickerMemory, describeError, downloadText, useGuide } from '../client/ai.client';
import { appService } from '../client/app.client';
import { MemoryManager, MemoryRow } from './ModelsPage';

const FIT_COLORS = { gpu: 'success', mixed: 'warning', cpu: 'warning', too_large: 'error', cloud: 'primary' };
const FIRST_MESSAGE = 'Explain what you can help me with in three sentences.';
const MAX_ARTICLES = 10;
const READABLE = /\.(txt|md|markdown|csv|tsv|json|jsonl|log|pdf|docx|xml|ya?ml|html?|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|sql|sh|css|ini|toml|png|jpe?g|webp|gif)$/i;
const FILE_ICONS = { pdf: 'FiFileText', docx: 'FiFileText', md: 'FiFileText', txt: 'FiFileText', csv: 'FiGrid', tsv: 'FiGrid', json: 'FiSettings', yaml: 'FiSettings', yml: 'FiSettings', png: 'FiImage', jpg: 'FiImage', jpeg: 'FiImage', gif: 'FiImage', mp4: 'FiFilm', mp3: 'FiMusic', js: 'FiCode', py: 'FiCode', html: 'FiCode' };

const formatSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const formatDate = (value) => (value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const formatTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const today = date.toDateString() === new Date().toDateString();
    return date.toLocaleString(undefined, today ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const textOf = (node) => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(textOf).join('');
    return node?.props?.children ? textOf(node.props.children) : '';
};

const Row = ({ icon, iconColor = 'primary', label, title, size = 'xs', color = 'default', selected = false, disabled = false, onClick, children }) => (
    <Container
        layout="flex"
        wrap={false}
        align="center"
        gap="sm"
        padding="sm"
        width="100%"
        hoverable={!disabled}
        backgroundColor={selected ? 'surface-alt' : 'transparent'}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-current={selected ? 'true' : undefined}
        title={title || label}
        onClick={disabled ? undefined : onClick}
        onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'Enter') onClick?.();
            // Space presses a row as it presses a button, unless the key was meant for a control inside the row.
            if (event.key === ' ' && event.target === event.currentTarget) {
                event.preventDefault();
                onClick?.();
            }
        }}
    >
        {icon && <Icon name={icon} size="xs" color={disabled ? 'text' : iconColor} />}
        <Container padding="none" flexFill minWidth="0">
            <Typography as="div" size={size} truncate color={disabled ? 'muted' : color} weight={selected ? 'semibold' : 'normal'}>
                {label}
            </Typography>
        </Container>
        {children}
    </Container>
);

const Pop = ({ label, icon, endIcon = null, mark = null, open, onOpen, onClose, width = '320px', tall = false, fab = false, iconOnly = false, iconEnd = false, children, ...button }) => {
    const trigger = useRef(null);
    const closedAt = useRef(0);
    const close = useCallback(() => {
        closedAt.current = Date.now();
        onClose();
    }, [onClose]);

    const toggle = () => {
        if (open) close();
        else if (Date.now() - closedAt.current > 250) onOpen();
    };

    return (
        <>
            {fab ? (
                <FloatingActionButton ref={trigger} icon={icon} onClick={toggle} {...button} />
            ) : (
                <Button ref={trigger} size="sm" variant="ghost" selected={open} onClick={toggle} title={iconOnly ? label : undefined} aria-label={iconOnly ? label : undefined} {...button}>
                    {icon && !iconEnd && <Icon name={icon} size="xs" />}
                    {mark}
                    {!iconOnly && label}
                    {icon && iconEnd && <Icon name={icon} size="xs" />}
                    {endIcon && <Icon name={endIcon} size="xs" />}
                </Button>
            )}
            {createPortal(
                <Genie key={width} visible={open} onClose={close} triggerRef={trigger} variant="popover" width={width} maxWidth="94vw" maxHeight={tall ? '88vh' : '72vh'} padding="xs">
                    {open && (
                        <Container layout="flex-column" wrap={false} gap="sm" padding="sm" width="100%" maxHeight={tall ? '82vh' : '66vh'} overflow="auto">
                            {children}
                        </Container>
                    )}
                </Genie>,
                document.body
            )}
        </>
    );
};

export const CopyButton = ({ text, label = 'Copy', size = 'xxs', color = 'primary', round = false }) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };
    return (
        <Button size={size} variant="ghost" color={color} round={round} title={copied ? 'Copied' : label} aria-label={label} onClick={copy}>
            <Icon name={copied ? 'FiCheck' : 'FiCopy'} />
        </Button>
    );
};

const NOTICE_INK = { muted: 'text', warning: 'warning', error: 'error' };
// Every status, limit and error on this page is this one line: an icon, 14px text and, where the person must act, buttons.
const Notice = ({ icon = 'FiInfo', tone = 'muted', busy = false, detail = null, mono = false, actions = null, children, ...rest }) => (
    <Container layout="flex" wrap={false} align="start" gap="md" padding="none" width="100%" {...rest}>
        {busy ? <CircularProgress size="xs" /> : <Icon name={icon} size="xs" color={NOTICE_INK[tone] || 'text'} />}
        <Container layout="flex-column" gap="xs" padding="none" flexFill minWidth="0">
            <Typography as="p" size="xs" color={tone === 'error' ? 'error' : tone === 'muted' ? 'muted' : 'default'}>{children}</Typography>
            {detail && <Typography as="p" size="xxs" color="muted" font={mono ? 'monospace' : 'primary'}>{detail}</Typography>}
            {actions && <Container layout="flex" align="center" gap="xs" padding="none">{actions}</Container>}
        </Container>
    </Container>
);

// Thinking, tool steps and drafts fold into one quiet row with a hairline under it, so they never read louder than the answer.
const Fold = ({ icon = null, label, tone = 'tertiary', startOpen = false, children }) => {
    const [open, setOpen] = useState(startOpen);
    return (
        <Container layout="flex-column" gap="xs" padding="none" width="100%">
            <Button size="sm" variant="ghost" color={tone} align="start" flat width="100%" aria-expanded={open} onClick={() => setOpen((shown) => !shown)}>
                <Icon name={open ? 'FiChevronDown' : 'FiChevronRight'} size="xs" />
                {icon && <Icon name={icon} size="xs" />}
                <Typography size="xs" color="muted" margin="none" truncate minWidth="0">{label}</Typography>
            </Button>
            {open && <Container layout="flex-column" gap="xs" padding="sm" width="100%">{children}</Container>}
            <Divider />
        </Container>
    );
};

const CODE_EXTENSIONS = {
    python: 'py', py: 'py', javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx', json: 'json', html: 'html', css: 'css',
    bash: 'sh', shell: 'sh', sh: 'sh', powershell: 'ps1', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', cs: 'cs', go: 'go', rust: 'rs',
    ruby: 'rb', php: 'php', yaml: 'yaml', yml: 'yaml', xml: 'xml', markdown: 'md', md: 'md', swift: 'swift', kotlin: 'kt'
};

const CodeView = ({ code, language }) => {
    const text = String(code ?? '').replace(/\n$/, '');
    const kind = String(language || '').toLowerCase();
    const lines = Math.min(Math.max(text.split('\n').length, 2), 24);
    const height = `${lines * 20 + 24}px`;
    return (
        <Card backgroundColor="surface" bordered={false} shadow={false} hover={false} layout="flex-column" gap="xs" padding="xs" width="100%" marginBottom="sm">
            <Container layout="flex" align="center" justify="between" padding="none" width="100%">
                <Typography size="xxs" color="muted">{kind || 'code'}</Typography>
                <CopyButton text={text} />
            </Container>
            <Editor mode="code" readOnly showToolbar={false} minimap={false} content={text} filePath={`snippet.${CODE_EXTENSIONS[kind] || 'txt'}`} width="100%" height={height} minHeight={height} />
        </Card>
    );
};

const CodeBlock = ({ children }) => {
    const language = String(children?.props?.className || '').match(/language-([\w+-]+)/)?.[1];
    return <CodeView code={textOf(children)} language={language} />;
};

const BlockContext = React.createContext({ send: null, live: false });

const BLOCK_COMPONENTS = {
    Container, Card, Typography, Button, ButtonGroup, FloatingActionButton, Badge, Divider, Icon, ProgressBar, CircularProgress,
    Data, Flow, TreeView, Image, Video, Audio, PdfViewer, Slides, Sheet, Model3D, Editor, Input, Select, Switch
};
const MEDIA = { Image: 'image', Video: 'video', Audio: 'audio', PdfViewer: 'PDF', Slides: 'slide deck', Sheet: 'sheet', Model3D: '3D model' };
const isRemote = (value) => /^https?:\/\//i.test(String(value || ''));
const safeLink = (value) => (/^(https?:|mailto:)/i.test(String(value || '')) ? value : null);
const safeSource = (value) => (/^(https?:\/\/|data:(image|audio|video|model|application\/pdf))/i.test(String(value || '')) ? value : null);

const BOX_PROPS = [
    'layout', 'columns', 'gap', 'padding', 'justify', 'align', 'wrap', 'flexFill', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth',
    'backgroundColor', 'background', 'backgroundTone', 'backgroundIntensity', 'backgroundSize', 'backgroundMotion', 'backgroundFade'
];
const BLOCK_SPEC = {
    Container: { children: 'nodes', props: [...BOX_PROPS, 'hoverable'] },
    Card: { children: 'nodes', props: [...BOX_PROPS, 'bordered', 'borderColor', 'borderStrength', 'radius', 'shadow', 'hover'] },
    Divider: { props: ['label', 'color', 'variant', 'size'] },
    Typography: { children: 'text', props: ['size', 'weight', 'color', 'font', 'as', 'href', 'truncate'] },
    Badge: { children: 'text', props: ['color', 'size'] },
    Icon: { props: ['name', 'color', 'size'], required: ['name'] },
    Button: { children: 'text', props: ['color', 'variant', 'size', 'icon', 'send', 'disabled', 'width', 'align', 'flat'] },
    ButtonGroup: { children: 'nodes', props: [] },
    FloatingActionButton: { props: ['icon', 'color', 'size', 'position', 'badge', 'badgeColor', 'draggable', 'send'], required: ['icon'] },
    ProgressBar: { props: ['value', 'max', 'label', 'showPercentage', 'color', 'size', 'striped', 'animated'], required: ['value'] },
    CircularProgress: { props: ['size', 'color'] },
    Data: { props: ['data', 'src', 'variant', 'fields'] },
    Flow: { props: ['content', 'height', 'arrange', 'minimap', 'background'] },
    TreeView: { props: ['items'], required: ['items'] },
    Image: { props: ['src', 'content', 'alt', 'width', 'height'] },
    Video: { props: ['src', 'title'], required: ['src'] },
    Audio: { props: ['src', 'title'], required: ['src'] },
    PdfViewer: { props: ['src'], required: ['src'] },
    Slides: { props: ['src', 'height'], required: ['src'] },
    Sheet: { props: ['src', 'height'], required: ['src'] },
    Model3D: { props: ['content', 'src', 'format', 'fileName', 'autoRotate', 'height'] },
    Editor: { props: ['content', 'src', 'mode', 'language'] },
    Input: { props: ['label', 'placeholder', 'multiline', 'rows'] },
    Select: { props: ['label', 'placeholder', 'options'] },
    Switch: { props: ['label', 'defaultChecked'] },
    Frame: { props: ['content', 'template', 'height', 'title', 'palette'] }
};
const NODE_KEYS = ['component', 'props', 'children'];
const FLOW_ARRANGE = ['lr', 'tb', 'grid', 'circle'];
const FLOW_BACKGROUNDS = ['dots', 'lines', 'cross'];
// A diagram is handed to Flow as the text the model wrote, in Flow's own format, so everything that format can say
// (connector styles, arrowheads, groups, sizes, places) is drawn as written.
const flowText = (content) => `<Flow>\n${String(content ?? '')}\n</Flow>`;
const FIELD_COMPONENTS = { Badge, Typography, ProgressBar };
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' || typeof value === 'number';

const checkNode = (node, parent = null) => {

    const name = node.component;
    const spec = BLOCK_SPEC[name];
    if (!spec) return `"${name}" is not a component.`;
    const extra = Object.keys(node).find((key) => !NODE_KEYS.includes(key));
    if (extra) return `${name} has the key "${extra}". Only component, props and children are allowed; everything else belongs inside props.`;
    if (node.props !== undefined && !isObject(node.props)) return `${name}: "props" must be an object.`;
    const props = node.props || {};

    const missing = (spec.required || []).find((prop) => props[prop] === undefined || props[prop] === null || props[prop] === '');
    if (missing && !(name === 'Image' || name === 'Model3D' || name === 'Editor')) return `${name} needs the attribute "${missing}".`;
    const blank = !isText(node.children) || String(node.children).trim() === '';
    if (spec.children === 'text' && blank && !(name === 'Button' && isText(props.icon))) return `${name} has no text. Write it between the tags: <${name}>text</${name}>.`;
    const empty = node.children === undefined || node.children === null || node.children === '' || (Array.isArray(node.children) && node.children.length === 0);
    if (!spec.children && !empty) return `${name} cannot hold other tags.`;

    if (name === 'ProgressBar' && !Number.isFinite(Number(props.value))) return 'ProgressBar: "value" must be a number.';
    if (name === 'FloatingActionButton' && parent !== 'Card') return 'FloatingActionButton must be placed directly inside a Card.';
    if (name === 'Image' && !props.src && !props.content) return 'Image needs "src" or "content".';
    const webSource = isText(props.src) && String(props.src).trim() !== '';
    if (webSource && ['Model3D', 'Editor', 'Data', 'PdfViewer', 'Slides', 'Sheet', 'Video', 'Audio'].includes(name) && !isRemote(props.src)) return `${name}: src must be an https address.`;
    const hasContent = typeof props.content === 'string' && props.content.trim() !== '';
    if (name === 'Frame' && !hasContent && !(isText(props.template) && String(props.template).includes('/'))) return 'Frame needs a page between its tags, or a template written as skill/file.';
    if (name === 'Model3D' && !webSource && !hasContent) return 'Model3D needs src, or the text of an OBJ or STL file between its tags.';
    if (name === 'Model3D' && webSource && !MODEL_FORMATS.includes(String(props.format || extensionOf(props.src)).toLowerCase())) return `Model3D can show these file types: ${MODEL_FORMATS.join(', ')}.`;
    if (name === 'Editor' && !webSource && !hasContent) return 'Editor needs src, or its text between its tags.';
    if (name === 'Data' && !webSource) {
        if (!Array.isArray(props.data) || props.data.length === 0 || !props.data.every(isObject)) return 'Data needs src, or at least one <Row /> inside it.';
        if (props.fields !== undefined && !isObject(props.fields)) return 'Data: "fields" must be an object keyed by column.';
    }
    if (name === 'TreeView') {
        const bad = (items) => !Array.isArray(items) || items.some((item) => !isObject(item) || !isText(item.label) || (item.children !== undefined && bad(item.children)));
        if (bad(props.items)) return 'TreeView needs <Item label="..." /> tags inside it, each with a label.';
    }
    if (name === 'Flow') {
        const flow = parseFlow(flowText(props.content));
        if (flow.error) return `Flow: ${flow.error}`;
        if (!flow.nodes.some((node) => node.type !== 'group')) return 'Flow needs at least one <Node id="..." label="..." /> inside it.';
    }
    if (name === 'Select' && props.options !== undefined && (!Array.isArray(props.options) || props.options.some((option) => !isObject(option) || !isText(option.label)))) {
        return 'Select: "options" must be a list of {"value", "label"} objects.';
    }
    return null;
};

// Boxes the model gave no place to are arranged by Flow itself once it has measured them, so a large box never sits
// on top of its neighbour. Boxes the model placed with x and y stay where it put them.
const ChatFlow = ({ content, height, arrange, minimap, background }) => {
    const flow = useRef(null);
    const text = flowText(content);
    const placed = useMemo(() => parseFlow(text).nodes.length > 0 && /<\s*(Node|Group)\b[^>]*\sx\s*=/i.test(text), [text]);
    const kind = FLOW_ARRANGE.includes(String(arrange).toLowerCase()) ? String(arrange).toLowerCase() : 'lr';
    useEffect(() => {
        if (placed) return undefined;
        let tries = 0;
        let timer = null;
        const run = () => {
            const instance = flow.current?.instance?.();
            const boxes = instance?.getNodes?.() || [];
            const measured = boxes.length > 0 && boxes.every((box) => instance.getInternalNode?.(box.id)?.measured?.width);
            // Once every box has been measured it is arranged; if that never comes, it is arranged all the same.
            if (measured || tries >= 40) {
                // Arranged twice: rich text in a box (a table, code) can still be growing at the first measure.
                if (boxes.length > 0) timer = setTimeout(() => { flow.current?.arrange(kind); timer = setTimeout(() => flow.current?.arrange(kind), 600); }, 60);
                return;
            }
            tries += 1;
            timer = setTimeout(run, 80);
        };
        timer = setTimeout(run, 120);
        return () => clearTimeout(timer);
    }, [text, kind, placed]);
    const pattern = FLOW_BACKGROUNDS.includes(String(background).toLowerCase()) ? String(background).toLowerCase() : null;
    return (
        <Flow
            ref={flow}
            content={text}
            readOnly
            toolbar="view"
            height={height || '380px'}
            minimap={minimap === true}
            background={String(background).toLowerCase() !== 'none'}
            {...(pattern ? { backgroundVariant: pattern } : {})}
        />
    );
};

const treeData = (items = []) => {
    const out = {};
    items.forEach((item, index) => {
        const label = String(item.label);
        out[out[label] ? `${label} (${index + 1})` : label] = { label, children: treeData(item.children) };
    });
    return out;
};

const dataFields = (fields = {}) => {
    const out = {};
    for (const [field, config] of Object.entries(fields)) {
        if (!isObject(config)) continue;
        const Component = FIELD_COMPONENTS[config.component];
        const colors = isObject(config.colors) ? config.colors : null;
        out[field] = { label: isText(config.label) ? String(config.label) : undefined };
        if (!Component) continue;
        out[field].component = Component;
        out[field].props = {};
        out[field].transform = (value) => (config.component === 'ProgressBar'
            ? { value: Number(value) || 0, max: 100, showPercentage: true, width: '100%' }
            : { children: String(value), color: colors?.[String(value)] });
    }
    return out;
};

const LocalField = ({ Component, ...props }) => {
    const [value, setValue] = useState('');
    return <Component {...props} value={value} onChange={(next) => setValue(next?.target ? next.target.value : next)} />;
};

// A switch in a reply keeps its own on and off, so flipping it shows.
const LocalSwitch = ({ defaultChecked, ...props }) => {
    const [on, setOn] = useState(defaultChecked === true);
    return <Switch {...props} checked={on} onChange={(next) => setOn(typeof next === 'boolean' ? next : Boolean(next?.target?.checked))} />;
};

// A page written in a reply, shown in a sealed frame. With a template, the template is one of a skill's files, and
// each /*NAME*/ marker in it is filled by the Part of that name: another of the skill's files, or the text inside the
// Part. Nothing is drawn while the reply is still being written, so the page is built once, from the whole of it.
// How each kind of place a model can run is marked in the picker: a computer, an online service, or a pool of computers.
const DEVICE_ICONS = { cloud: 'FiCloud', pool: 'FiLayers' };

const FRAME_PART = /<Part\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Part\s*>)/gi;
const skillFiles = new Map();
const loadSkillFile = (address) => {
    const [skill, ...rest] = String(address).trim().split('/');
    const key = `${skill}/${rest.join('/')}`;
    if (!skillFiles.has(key)) {
        const request = skillService.file(skill, rest.join('/')).then((result) => result.text);
        skillFiles.set(key, request);
        request.catch(() => skillFiles.delete(key));
    }
    return skillFiles.get(key);
};
// A page is either a skill's file (template) with its /*NAME*/ markers filled by the Parts, or the text between the
// tags, whose own markers the Parts fill: a page built by a skill keeps the kit files it holds out of the chat that way.
const buildFrame = async (content, template) => {
    const own = !isText(template) || !String(template).trim();
    if (own && !/\/\*[A-Z][A-Z0-9_]*\*\//.test(String(content ?? ''))) return String(content ?? '');
    let page = own ? String(content ?? '').replace(FRAME_PART, '') : await loadSkillFile(template);
    for (const match of String(content ?? '').matchAll(FRAME_PART)) {
        const part = readAttributes(match[1].replace(/\/\s*$/, ''));
        if (!isText(part.name)) continue;
        const fill = isText(part.file) ? await loadSkillFile(part.file) : String(match[2] ?? '').replace(/^\s*\n/, '').replace(/\s+$/, '');
        page = page.replace(`/*${part.name}*/`, () => `\n${fill}\n`);
    }
    return page;
};
// palette="ground:background, muted:text 65%" gives the page's own colour variables the app theme's colours: each pair
// is a variable of the page and a theme colour, with an optional strength.
// With fallbacks, each theme colour also carries the colour it has now, for a saved page opened outside the app.
const framePalette = (palette, fallbacks = {}) => {
    if (!isText(palette)) return null;
    const pairs = String(palette).split(',').map((pair) => pair.split(':').map((part) => part.trim())).filter((pair) => pair.length === 2 && /^[\w-]+$/.test(pair[0]));
    const variables = {};
    for (const [name, value] of pairs) {
        const [token, strength] = value.split(/\s+/);
        if (!/^[a-z]+$/.test(token)) continue;
        const colour = fallbacks[token] ? `var(--app-${token}, ${String(fallbacks[token]).replace(/[;{}<>]/g, '')})` : `var(--app-${token})`;
        variables[name] = /^\d{1,3}%$/.test(strength || '') ? `color-mix(in srgb, ${colour} ${strength}, transparent)` : colour;
    }
    return Object.keys(variables).length > 0 ? variables : null;
};
// A saved page keeps its palette, so it takes the theme of the app it is opened in (Mollama's or FilesystemOne's frame
// hands it the --app- colours) and today's colours anywhere else.
const savedFrame = async (content, template, palette) => {
    const page = await buildFrame(content, template);
    const variables = framePalette(palette, readAppTheme());
    if (!variables) return page;
    const style = `<style>:root,:root[data-theme]{${Object.entries(variables).map(([name, value]) => `--${name}:${value} !important;`).join('')}}</style>`;
    if (/<\/head>/i.test(page)) return page.replace(/<\/head>/i, () => `${style}</head>`);
    if (/<html[^>]*>/i.test(page)) return page.replace(/<html[^>]*>/i, (root) => `${root}<head>${style}</head>`);
    return `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${page}</body></html>`;
};
const ChatFrame = ({ content, template, height, title, palette, live }) => {
    const variables = useMemo(() => framePalette(palette), [palette]);
    const [state, setState] = useState({ loading: true });
    useEffect(() => {
        if (live) return undefined;
        let current = true;
        setState({ loading: true });
        buildFrame(content, template).then(
            (html) => { if (current) setState({ html }); },
            () => { if (current) setState({ problem: 'A file this page is built from could not be loaded.' }); }
        );
        return () => { current = false; };
    }, [content, template, live]);
    if (live) return <Typography size="xs" color="muted">Building the page…</Typography>;
    if (state.problem) return <Typography size="xs" color="warning">[Not drawn: {state.problem}]</Typography>;
    if (state.loading) return <CircularProgress size="sm" />;
    return <Frame html={state.html} height={isText(height) ? String(height) : '520px'} title={isText(title) ? String(title) : 'Page'} variables={variables} dressed={Boolean(variables)} fit />;
};

const MODEL_FORMATS = ['glb', 'gltf', 'obj', 'stl', 'fbx', 'ply', 'dae', '3mf', 'vox', '3ds'];
const extensionOf = (address) => {
    try {
        return new URL(address).pathname.split('.').pop().toLowerCase();
    } catch {
        return '';
    }
};

const webFiles = new Map();
const loadWebFile = (address) => {
    if (!webFiles.has(address)) {
        const request = fileService.remote(address);
        webFiles.set(address, request);
        request.catch(() => webFiles.delete(address));
    }
    return webFiles.get(address);
};

const useWebFile = (address, kind) => {
    const [state, setState] = useState({ loading: true });
    useEffect(() => {
        let current = true;
        if (kind === 'direct') {
            setState({ value: address });
            return undefined;
        }
        setState({ loading: true });
        loadWebFile(address)
            .then(async (blob) => {
                const start = (await blob.slice(0, 400).text()).trimStart().toLowerCase();
                if (kind !== 'text' && (start.startsWith('<!doctype html') || start.startsWith('<html'))) {
                    if (current) setState({ problem: 'This address is a web page, not a file, so it cannot be shown here. Open it in a new tab.' });
                    return;
                }
                const value = kind === 'blob' ? blob : await blob.text();
                if (current) setState({ value });
            })
            .catch(async (error) => {
                let problem = 'The file could not be loaded from its address.';
                try {
                    const data = error?.response?.data;
                    const parsed = data instanceof Blob ? JSON.parse(await data.text()) : data;
                    if (parsed?.message) problem = `${parsed.message} ${parsed.action || ''}`.trim();
                } catch {
                    problem = 'The file could not be loaded from its address.';
                }
                if (current) setState({ problem });
            });
        return () => {
            current = false;
        };
    }, [address, kind]);
    return state;
};

const EDITOR_LANGUAGES = ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'md', 'txt', 'bash', 'sh', 'python', 'py', 'sql', 'yml', 'yaml', 'ruby', 'go', 'rust', 'c', 'cpp', 'java', 'math'];
const LANGUAGE_NAMES = { javascript: 'js', typescript: 'ts', shell: 'sh', console: 'sh', zsh: 'sh', powershell: 'sh', markdown: 'md', text: 'txt', xml: 'html', svg: 'html', rb: 'ruby', rs: 'rust', golang: 'go', 'c++': 'cpp' };
const HTML_LINE = /^\s*<(?:[A-Za-z][\w-]*(?:[\s>/]|$)|\/[A-Za-z]|!--)/;
const HTML_TAG = /<!--[\s\S]*?-->|<\/?[A-Za-z][^<>]*>/;
const PASS_THROUGH = new Set(['p', 'div', 'center', 'section', 'article', 'header', 'footer', 'main', 'span', 'font', 'sub', 'sup', 'small', 'u', 'mark', 'abbr', 'picture', 'figure', 'figcaption', 'nobr', 'body']);
const BLOCK_TAGS = new Set(['p', 'div', 'center', 'section', 'article', 'header', 'footer', 'main', 'figure', 'figcaption']);

const escapeText = (text) => text.replace(/[<{}]/g, (mark) => `\\${mark}`);
const resolveAddress = (value, base) => {
    try {
        return new URL(value, base || undefined).href;
    } catch {
        return /^(https?:|data:|#|mailto:)/i.test(value) ? value : null;
    }
};

const htmlToMarkdown = (html, base) => {
    const state = { unsupported: false };
    const walk = (node) => {
        if (node.nodeType === 3) return escapeText(node.textContent.replace(/\s+/g, ' '));
        if (node.nodeType !== 1) return '';
        const tag = node.tagName.toLowerCase();
        const inner = () => [...node.childNodes].map(walk).join('');
        if (tag === 'img') {
            const address = resolveAddress(node.getAttribute('src') || '', base);
            return address ? `![${(node.getAttribute('alt') || '').replace(/[[\]]/g, '')}](${address})` : '';
        }
        if (tag === 'source') return '';
        if (tag === 'br') return '  \n';
        if (tag === 'hr') return '\n\n---\n\n';
        if (tag === 'a') {
            const address = resolveAddress(node.getAttribute('href') || '', base);
            const label = inner().trim();
            return address && label ? `[${label}](${address})` : label;
        }
        if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${inner().trim()}\n\n`;
        if (tag === 'strong' || tag === 'b') return inner().trim() ? `**${inner().trim()}**` : '';
        if (tag === 'em' || tag === 'i') return inner().trim() ? `*${inner().trim()}*` : '';
        if (tag === 'del' || tag === 's' || tag === 'strike') return inner().trim() ? `~~${inner().trim()}~~` : '';
        if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') return `\`${node.textContent.replace(/`/g, '')}\``;
        if (tag === 'li') return `\n- ${inner().trim()}`;
        if (tag === 'ul' || tag === 'ol') return `\n${inner()}\n\n`;
        if (tag === 'summary') return `\n\n**${inner().trim()}**\n\n`;
        if (tag === 'details' || tag === 'blockquote') return `\n\n${inner().trim()}\n\n`;
        if (PASS_THROUGH.has(tag)) return BLOCK_TAGS.has(tag) ? `\n\n${inner().trim()}\n\n` : inner();
        state.unsupported = true;
        return '';
    };
    const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
    const markdown = walk(body).replace(/[ \t]+\n/g, (space) => (space.startsWith('  ') ? '  \n' : '\n')).replace(/\n{3,}/g, '\n\n').trim();
    return state.unsupported ? null : markdown;
};

const safeLine = (line, base) => line.split(/(`[^`\n]*`)/).map((piece, index) => {
    if (index % 2 === 1) return piece;
    const linked = piece.replace(/<(https?:\/\/[^>\s]+)>/g, '[$1]($1)');
    if (!HTML_TAG.test(linked)) return escapeText(linked);
    const converted = htmlToMarkdown(linked, base);
    if (converted !== null) return `${/^\s/.test(linked) ? ' ' : ''}${converted}${/\s$/.test(linked) ? ' ' : ''}`;
    return linked.split(/(<!--.*?-->|<\/?[A-Za-z][^<>\n]*>)/).map((part, position) => (position % 2 === 1 ? `\`${part}\`` : escapeText(part))).join('');
}).join('');

const LINK_DEFINITION = /^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*$/gm;
const FULL_REFERENCE = /(!?)\[((?:[^\[\]\n]|!?\[[^\[\]\n]*\](?:\([^()\n]*\)|\[[^\[\]\n]*\])?)*)\]\[([^\]\n]*)\]/g;
const inlineLinks = (part, links) => {
    let text = part.replace(LINK_DEFINITION, "").replace(/\[\^([^\]\n]+)\]:?/g, "($1)");
    for (let pass = 0; pass < 3; pass++) {
        text = text.replace(FULL_REFERENCE, (whole, bang, label, reference) => {
            const target = links.get((reference || label).toLowerCase());
            return target ? `${bang}[${label}](${target})` : whole;
        });
    }
    return text.replace(/(!?)\[([^\[\]\n]+)\](?![[(:])/g, (whole, bang, label) => {
        const target = links.get(label.toLowerCase());
        return target ? `${bang}[${label}](${target})` : whole;
    });
};

const editorMarkdown = (source, base = null) => {
    const links = new Map([...String(source).matchAll(LINK_DEFINITION)].map((match) => [match[1].toLowerCase(), match[2]]));
    return editorParts(source, links, base);
};

const editorParts = (source, links, base) => String(source).split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?(?:^(?:```|~~~)[ \t]*$|(?![\s\S])))/m).map((part, index) => {
    if (index % 2 === 1) {
        return part.replace(/^(```|~~~)[ \t]*([^\s`]*)[^\n]*/, (_, fence, name) => {
            const wanted = name.toLowerCase();
            const language = EDITOR_LANGUAGES.includes(wanted) ? wanted : LANGUAGE_NAMES[wanted] || '';
            return `\`\`\`${language}`;
        }).replace(/~~~[ \t]*$/, '```');
    }
    const out = [];
    let block = null;
    const close = () => {
        if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
        const converted = htmlToMarkdown(block.join('\n'), base);
        if (converted === null) out.push('```html', ...block, '```', '');
        else if (converted) out.push(converted, '');
        block = null;
    };
    for (const line of inlineLinks(part, links).split('\n')) {
        if (block) {
            if (line.trim() === '') close();
            else block.push(line);
        } else if (HTML_LINE.test(line)) block = [line];
        else out.push(safeLine(line, base));
    }
    if (block) close();
    return out.join('\n');
}).join('');

const DocumentPanel = ({ mode, text, address = null }) => (mode === 'document'
    ? <Editor mode="document" minHeight="120px" readOnly showToolbar={false} content={text} />
    : (
        <Container layout="block" padding="none" width="100%" maxHeight="70vh" overflow="auto">
            <Editor mode="markdown" minHeight="120px" readOnly showToolbar={false} content={editorMarkdown(text, address)} />
        </Container>
    ));

const SourceLine = ({ address }) => (
    <Typography size="xxs" color="muted" href={address} target="_blank" rel="noreferrer noopener" truncate>Source: {address}</Typography>
);

const UnverifiedAddresses = createContext(() => false);

const WebFile = ({ address, kind, children }) => {
    const file = useWebFile(address, kind);
    const unverified = useContext(UnverifiedAddresses)(address);
    return (
        <Container layout="flex-column" gap="xs" padding="none" width="100%">
            {file.loading && <Typography size="xs" color="muted">Loading the file from the web…</Typography>}
            {file.problem && <Typography size="xs" color="warning">{file.problem}{unverified ? ' The model wrote this address itself; it did not come from the web search.' : ''}</Typography>}
            {file.value !== undefined && children(file.value)}
            <SourceLine address={address} />
        </Container>
    );
};

const BlobAddress = ({ blob, children }) => {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        const next = URL.createObjectURL(blob);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [blob]);
    return url ? children(url) : null;
};

const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quoted) {
            if (char === '"' && text[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else if (char === '"') quoted = false;
            else cell += char;
        } else if (char === '"') quoted = true;
        else if (char === ',') {
            row.push(cell);
            cell = '';
        } else if (char === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else if (char !== '\r') cell += char;
    }
    if (cell !== '' || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    const [header = [], ...lines] = rows.filter((line) => line.some((value) => value !== ''));
    return lines.map((line) => Object.fromEntries(header.map((name, index) => [name || `column ${index + 1}`, line[index] ?? ''])));
};

const tableRows = (text, address) => {
    if (extensionOf(address) === 'json' || /^\s*[[{]/.test(text)) {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : Object.values(parsed).find(Array.isArray) || [];
        return list.filter(isObject);
    }
    return parseCsv(text);
};

const WebTable = ({ text, address, variant, fields }) => {
    const rows = useMemo(() => {
        try {
            return tableRows(text, address).slice(0, 500);
        } catch {
            return [];
        }
    }, [text, address]);
    if (rows.length === 0) return <Typography size="xs" color="warning">This file does not hold a table that can be shown. Use a CSV file or a JSON list.</Typography>;
    return <Data size="sm" width="100%" variant={variant} data={rows} fieldConfig={dataFields(fields)} />;
};

const InlineModel = ({ content, format = 'obj', fileName, ...props }) => {
    const { success, error: notifyError } = useNotification();
    const [saving, setSaving] = useState(false);
    const kind = ['obj', 'stl'].includes(String(format).toLowerCase()) ? String(format).toLowerCase() : 'obj';
    const name = /\.(obj|stl)$/i.test(String(fileName || '')) ? fileName : `${String(fileName || 'model').replace(/[\\/]/g, '-')}.${kind}`;
    const [url, setUrl] = useState(null);
    useEffect(() => {
        const next = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [content]);

    const save = async (folder) => {
        setSaving(false);
        try {
            const saved = await fileService.save(folder, name, content);
            success(`Saved to ${saved.path}`);
        } catch (error) {
            notifyError(describeError(error, 'The model could not be saved.'));
        }
    };

    return (
        <Container layout="flex-column" gap="xs" padding="none" width="100%">
            {url && <Model3D src={url} format={kind} height="360px" {...props} />}
            <Container layout="flex" align="center" gap="xs" padding="none">
                <Typography size="xxs" color="muted">{name}</Typography>
                <Button size="xs" variant="ghost" title="Download" aria-label="Download" onClick={() => downloadText(name, content)}><Icon name="FiDownload" size="xs" /></Button>
                <Pop label="Save to my files" icon="FiHardDrive" size="xs" open={saving} onOpen={() => setSaving(true)} onClose={() => setSaving(false)} width="440px">
                    <FileBrowser mode="save" onPick={save} onBack={() => setSaving(false)} />
                </Pop>
            </Container>
        </Container>
    );
};

// What a reply drew or showed that can be kept as a file in FilesystemOne: each piece is either text the reply holds
// (or builds, for a page made from a skill's files) or a file at a web address, which the server fetches and saves.
const fileSafe = (text, fallback) => String(text || '').replace(/[\\/:*?"<>|\0]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback;
const nameFromAddress = (address, fallback) => {
    try {
        return fileSafe(decodeURIComponent(new URL(address).pathname.split('/').pop() || ''), fallback);
    } catch {
        return fallback;
    }
};
const csvOf = (rows) => {
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
    const cell = (value) => {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [keys.join(','), ...rows.map((row) => keys.map((key) => cell(row?.[key])).join(','))].join('\n');
};
const assetsOf = (node, found = []) => {
    if (!node || isText(node)) return found;
    if (Array.isArray(node)) {
        node.forEach((child) => assetsOf(child, found));
        return found;
    }
    const name = node.component;
    const props = node.props || {};
    const remote = isText(props.src) && /^https:\/\//i.test(String(props.src)) ? String(props.src) : null;
    const add = (asset) => found.push({ ...asset, kind: name });
    if (name === 'Frame') add({ name: `${fileSafe(props.title, 'page')}.html`, build: () => savedFrame(props.content, props.template, props.palette) });
    else if (name === 'Flow' && isText(props.content)) add({ name: 'diagram.flow', text: `<Flow${isText(props.arrange) ? ` arrange="${props.arrange}"` : ''}>\n${String(props.content).trim()}\n</Flow>\n` });
    else if (name === 'Data' && remote) add({ name: nameFromAddress(remote, 'table.csv'), address: remote });
    else if (name === 'Data' && Array.isArray(props.data) && props.data.length > 0) add({ name: 'table.csv', text: csvOf(props.data) });
    else if (name === 'Image' && remote) add({ name: nameFromAddress(remote, 'picture'), address: remote });
    else if (name === 'Image' && isText(props.content) && /<svg[\s>]/i.test(String(props.content))) add({ name: `${fileSafe(props.alt, 'drawing')}.svg`, text: String(props.content) });
    else if (['Video', 'Audio', 'PdfViewer', 'Slides', 'Sheet'].includes(name) && remote) add({ name: nameFromAddress(remote, name.toLowerCase()), address: remote });
    else if (name === 'Model3D' && remote) add({ name: nameFromAddress(remote, 'model'), address: remote });
    else if (name === 'Model3D' && isText(props.content)) add({ name: `${fileSafe(props.fileName, 'model').replace(/\.(obj|stl)$/i, '')}.${String(props.format || 'obj').toLowerCase() === 'stl' ? 'stl' : 'obj'}`, text: String(props.content) });
    else if (name === 'Editor' && remote) add({ name: nameFromAddress(remote, 'file.txt'), address: remote });
    else if (name === 'Editor' && isText(props.content)) add({ name: `${props.mode === 'code' ? 'code' : 'document'}.${props.mode === 'code' ? CODE_EXTENSIONS[String(props.language || '').toLowerCase()] || 'txt' : 'md'}`, text: String(props.content) });
    if (node.children) assetsOf(node.children, found);
    return found;
};
// Every piece of one reply: the components it drew, and the pictures its words showed from the web.
const replyAssets = (content) => {
    const text = String(content || '');
    const drawn = [...text.matchAll(/```component\n([\s\S]*?)```/g)].flatMap((match) => readComponents(match[1]).filter((item) => item.node).flatMap((item) => assetsOf(item.node)));
    const pictures = [...text.matchAll(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g)].map((match) => ({ name: nameFromAddress(match[1], 'picture'), address: match[1], kind: 'Image' }));
    return [...drawn, ...pictures];
};
const saveAsset = async (asset, folder) => {
    if (asset.address) return (await fileService.saveAddress(folder, asset.name, asset.address)).path;
    const text = asset.build ? await asset.build() : asset.text;
    return (await fileService.save(folder, asset.name, text)).path;
};
// A button that saves the given pieces into a folder the person picks. A name already taken there is kept and the
// new file gets a new name.
const SaveAssets = ({ assets, label = 'Save to my files' }) => {
    const { success, error: notifyError } = useNotification();
    const [open, setOpen] = useState(false);
    const save = async (folder) => {
        setOpen(false);
        const saved = [];
        const failed = [];
        for (const asset of assets) {
            try {
                saved.push(await saveAsset(asset, folder));
            } catch (error) {
                failed.push(`${asset.name}: ${describeError(error, 'it could not be saved')}`);
            }
        }
        if (saved.length > 0) success(saved.length === 1 ? `Saved to ${saved[0]}` : `Saved ${saved.length} files to ${folder}`);
        if (failed.length > 0) notifyError(`Not saved: ${failed.join('; ')}`);
    };
    if (assets.length === 0) return null;
    return (
        <Pop label={label} icon="FiHardDrive" size="xs" open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} width="440px" title={assets.map((asset) => asset.name).join(', ')}>
            <FileBrowser mode="save" onPick={save} onBack={() => setOpen(false)} />
        </Pop>
    );
};

// Saves every piece of a reply at once, when it has more than one.
const ReplySaveAll = ({ content }) => {
    const assets = useMemo(() => replyAssets(content), [content]);
    return assets.length > 1 ? <SaveAssets assets={assets} label={`Save all ${assets.length} to my files`} /> : null;
};

const renderBlock = (node, context, key, parent = null) => {
    if (node === null || node === undefined) return null;
    if (isText(node)) return node;
    if (Array.isArray(node)) return node.map((child, index) => renderBlock(child, context, index, parent));

    const name = node.component;
    const problem = checkNode(node, parent);
    if (problem) return <Typography key={key} size="xs" color="warning">[Not drawn: {problem}]</Typography>;
    const spec = BLOCK_SPEC[name];
    const props = Object.fromEntries(Object.entries(node.props || {}).filter(([prop]) => spec.props.includes(prop)));
    const children = spec.children ? renderBlock(node.children, context, 'children', name) : undefined;

    if (name === 'Container') return <Container key={key} padding="none" gap="sm" {...props}>{children}</Container>;
    if (name === 'Card') return <Card key={key} hover={false} shadow={false} padding="md" gap="sm" {...props}>{children}</Card>;
    if (name === 'Divider') return <Divider key={key} margin="sm" {...props} />;
    if (name === 'Typography') {
        const href = 'href' in props ? safeLink(props.href) : null;
        delete props.href;
        const link = href ? { href, target: '_blank', rel: 'noreferrer noopener' } : {};
        return <Typography key={key} size="sm" {...props} {...link}>{children}</Typography>;
    }
    if (name === 'Badge') return <Badge key={key} size="sm" {...props}>{children}</Badge>;
    if (name === 'Icon') return <Icon key={key} size="sm" {...props} />;
    if (name === 'Button') {
        const { send, icon, ...rest } = props;
        const label = isText(node.children) ? String(node.children).trim() : '';
        const message = isText(send) && String(send).trim() ? String(send) : label;
        const onClick = message && context.send && !context.live ? () => context.send(message) : undefined;
        return (
            <Button key={key} size="sm" {...rest} onClick={onClick}>
                {isText(icon) && <Icon name={String(icon)} size="xs" />}
                {label}
            </Button>
        );
    }
    if (name === 'ButtonGroup') return <ButtonGroup key={key} spaced selectable={false} justify="start">{children}</ButtonGroup>;
    if (name === 'FloatingActionButton') {
        const { send, color, ...rest } = props;
        const onClick = isText(send) && String(send).trim() && context.send && !context.live ? () => context.send(String(send)) : undefined;
        return <FloatingActionButton key={key} parentType="card" variant={color || 'primary'} {...rest} onClick={onClick} />;
    }
    if (name === 'ProgressBar') return <ProgressBar key={key} width="100%" showLabel={Boolean(props.label) || props.showPercentage === true} {...props} value={Number(props.value)} />;
    if (name === 'CircularProgress') return <CircularProgress key={key} {...props} />;
    if (name === 'Data' && props.src) {
        return <WebFile key={key} address={props.src} kind="table">{(text) => <WebTable text={text} address={props.src} variant={props.variant} fields={props.fields} />}</WebFile>;
    }
    if (name === 'Data') return <Data key={key} size="sm" width="100%" variant={props.variant} data={props.data} fieldConfig={dataFields(props.fields)} />;
    if (name === 'Flow') return <ChatFlow key={key} {...props} />;
    if (name === 'TreeView') return <TreeView key={key} size="sm" data={treeData(props.items)} />;
    if (name === 'Editor' && props.src) {
        const extension = extensionOf(props.src);
        const asText = props.mode === 'markdown' || props.mode === 'document' || (!props.mode && ['md', 'markdown'].includes(extension));
        return (
            <WebFile key={key} address={props.src} kind="text">
                {(text) => (asText
                    ? <DocumentPanel mode={props.mode} text={text.slice(0, 200000)} address={props.src} />
                    : <CodeView code={text.slice(0, 200000)} language={props.language || extension} />)}
            </WebFile>
        );
    }
    if (name === 'Editor') {
        if (props.mode === 'code') return <CodeView key={key} code={String(props.content)} language={props.language} />;
        return <DocumentPanel key={key} mode={props.mode} text={String(props.content)} />;
    }
    if (name === 'Input') return <LocalField key={key} Component={Input} size="sm" {...props} />;
    if (name === 'Select') return <LocalField key={key} Component={Select} size="sm" {...props} options={props.options || []} />;
    if (name === 'Switch') return <LocalSwitch key={key} {...props} />;
    if (name === 'Model3D' && props.src) {
        const { src, content: _content, format, fileName: _fileName, ...rest } = props;
        const kind = String(format || extensionOf(src)).toLowerCase();
        return <WebFile key={key} address={src} kind="blob">{(blob) => <BlobAddress blob={blob}>{(url) => <Model3D src={url} format={kind} height="360px" {...rest} />}</BlobAddress>}</WebFile>;
    }
    if (name === 'Model3D') return <InlineModel key={key} {...props} />;
    if (name === 'Frame') return <ChatFrame key={key} live={context.live} {...props} />;
    if (name === 'PdfViewer') {
        return <WebFile key={key} address={props.src} kind="blob">{(blob) => <PdfViewer blob={blob} readOnly compact height="70vh" />}</WebFile>;
    }
    if (name === 'Slides' || name === 'Sheet') {
        const View = name === 'Slides' ? Slides : Sheet;
        const fileName = decodeURIComponent(String(props.src).split(/[?#]/)[0].split('/').pop() || '') || (name === 'Slides' ? 'slides.pptx' : 'sheet.xlsx');
        return <WebFile key={key} address={props.src} kind="blob">{(blob) => <View blob={blob} fileName={fileName} compact height={isText(props.height) ? String(props.height) : name === 'Slides' ? '60vh' : '420px'} />}</WebFile>;
    }

    const { content, src, ...rest } = props;
    const source = name === 'Image' && typeof content === 'string' && /<svg[\s>]/i.test(content)
        ? `data:image/svg+xml;utf8,${encodeURIComponent(content)}`
        : safeSource(src);
    if (!source) return <Typography key={key} size="xs" color="warning">[Not drawn: this {MEDIA[name]} has no https address.]</Typography>;
    if (name === 'Image' && isRemote(source)) {
        return (
            <WebFile key={key} address={source} kind="blob">
                {(blob) => <BlobAddress blob={blob}>{(url) => <Image src={url} maxWidth="100%" allowDownload={false} {...rest} />}</BlobAddress>}
            </WebFile>
        );
    }
    const Media = BLOCK_COMPONENTS[name];
    if (isRemote(source)) {
        return <WebFile key={key} address={source} kind="direct">{() => <Media src={source} {...rest} />}</WebFile>;
    }
    return (
        <Container key={key} layout="flex-column" gap="xs" padding="none" width="100%">
            {name === 'Image' ? <Image src={source} maxWidth="100%" allowDownload={false} {...rest} /> : <Media src={source} {...rest} />}
        </Container>
    );
};

class BlockBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidUpdate(previous) {
        if (previous.source !== this.props.source && this.state.failed) this.setState({ failed: false });
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

const RAW_TAGS = ['Model3D', 'Editor', 'Image', 'Flow', 'Frame'];
const TEXT_TAGS = ['Typography', 'Badge', 'Button'];
const NUMBER_PROPS = ['value', 'max', 'columns', 'rows'];
const TAG_NAMES = [
    'Container', 'Card', 'Divider', 'Typography', 'Badge', 'Icon', 'Button', 'ButtonGroup', 'FloatingActionButton', 'ProgressBar', 'CircularProgress',
    'Data', 'Flow', 'TreeView', 'Image', 'Video', 'Audio', 'PdfViewer', 'Slides', 'Sheet', 'Model3D', 'Editor', 'Input', 'Select', 'Switch', 'Frame',
    'Row', 'Column', 'Node', 'Edge', 'Item', 'Option'
];
const EXACT_TAG = new Map(TAG_NAMES.map((name) => [name.toLowerCase(), name]));
const ATTRIBUTE = /([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s"'>/]+)))?/g;

const readValue = (name, raw) => {
    if (raw === undefined) return true;
    const text = String(raw).trim();
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (NUMBER_PROPS.includes(name) && text !== '' && Number.isFinite(Number(text))) return Number(text);
    return text.replace(/^["']|["']$/g, '');
};

const readAttributes = (source) => {
    const props = {};
    for (const match of source.matchAll(ATTRIBUTE)) {
        props[match[1]] = readValue(match[1], match[2] ?? match[3] ?? match[4] ?? match[5]);
    }
    return props;
};

const readMarkup = (source) => {
    const root = { tag: null, props: {}, children: [] };
    const stack = [root];
    const top = () => stack[stack.length - 1];
    let index = 0;

    while (index < source.length) {
        const open = source.indexOf('<', index);
        if (open === -1) {
            top().children.push(source.slice(index));
            break;
        }
        if (open > index) top().children.push(source.slice(index, open));

        const closing = source.slice(open).match(/^<\/\s*([A-Za-z][\w]*)\s*>/);
        if (closing) {
            const name = EXACT_TAG.get(closing[1].toLowerCase()) || closing[1];
            const at = stack.map((entry) => entry.tag).lastIndexOf(name);
            if (at > 0) stack.length = at;
            index = open + closing[0].length;
            continue;
        }

        const opening = source.slice(open).match(/^<\s*([A-Za-z][\w]*)((?:"[^"]*"|'[^']*'|\{[^}]*\}|[^>"'{])*)>/);
        if (!opening) {
            top().children.push('<');
            index = open + 1;
            continue;
        }
        const name = EXACT_TAG.get(opening[1].toLowerCase()) || opening[1];
        const selfClosed = /\/\s*$/.test(opening[2]);
        const node = { tag: name, props: readAttributes(opening[2].replace(/\/\s*$/, '')), children: [] };
        top().children.push(node);
        index = open + opening[0].length;
        if (selfClosed) continue;

        if (RAW_TAGS.includes(name)) {
            const rest = source.slice(index);
            const end = rest.search(new RegExp(`</\\s*${name}\\s*>`, 'i'));
            node.children.push(end === -1 ? rest : rest.slice(0, end));
            index = end === -1 ? source.length : index + end + rest.slice(end).match(/^<\/[^>]*>/)[0].length;
            continue;
        }
        stack.push(node);
    }
    return root.children;
};

const textOfMarkup = (children) => children.filter((child) => typeof child === 'string').join('').replace(/\s+/g, ' ').trim();
const rawText = (children) => children.filter((child) => typeof child === 'string').join('').replace(/^\s*\n/, '').replace(/\s+$/, '');
const elements = (children, tag) => children.filter((child) => typeof child === 'object' && (!tag || child.tag === tag));
const cellValue = (value) => (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value.replace(/,/g, ''))) && !/^0\d/.test(value) ? Number(value.replace(/,/g, '')) : value);

const treeItems = (children) => elements(children, 'Item').map((item) => {
    const nested = treeItems(item.children);
    const label = item.props.label ?? textOfMarkup(item.children);
    return nested.length > 0 ? { label, children: nested } : { label };
});

const toNode = (element) => {
    const { tag, props, children } = element;
    if (tag === 'Data') {
        const fields = {};
        for (const column of elements(children, 'Column')) {
            const key = column.props.key ?? column.props.name;
            if (key === undefined || key === true) continue;
            const entry = {};
            if (typeof column.props.label === 'string') entry.label = column.props.label;
            if (typeof column.props.as === 'string') entry.component = column.props.as;
            if (typeof column.props.colors === 'string') {
                entry.colors = Object.fromEntries(column.props.colors.split(',').map((pair) => pair.split(':').map((part) => part.trim())).filter((pair) => pair.length === 2 && pair[0]));
            }
            fields[String(key)] = entry;
        }
        const data = elements(children, 'Row').map((row) => Object.fromEntries(Object.entries(row.props).map(([key, value]) => [key, cellValue(value)])));
        const out = { ...props, data };
        if (Object.keys(fields).length > 0) out.fields = fields;
        return { component: 'Data', props: out };
    }
    if (tag === 'Flow') return { component: 'Flow', props: { ...props, content: rawText(children) } };
    if (tag === 'TreeView') return { component: 'TreeView', props: { ...props, items: treeItems(children) } };
    if (tag === 'Select') {
        const options = elements(children, 'Option').map((option) => ({ value: option.props.value ?? option.props.label, label: option.props.label ?? textOfMarkup(option.children) }));
        return { component: 'Select', props: { ...props, options } };
    }
    if (tag === 'Frame') return { component: 'Frame', props: { ...props, content: rawText(children) } };
    if (tag === 'Model3D' || tag === 'Editor') return { component: tag, props: { ...props, content: props.content ?? rawText(children) } };
    if (tag === 'Image') {
        const inner = rawText(children);
        return { component: 'Image', props: inner ? { ...props, content: inner } : props };
    }
    if (TEXT_TAGS.includes(tag)) return { component: tag, props, children: textOfMarkup(children) };
    const nested = children.filter((child) => typeof child === 'object').map(toNode);
    const stray = textOfMarkup(children);
    if (tag === 'Container' || tag === 'Card' || tag === 'ButtonGroup') {
        const list = stray && nested.length === 0 ? [{ component: 'Typography', props: {}, children: stray }] : nested;
        return { component: tag, props, children: list };
    }
    return { component: tag, props };
};

const readComponents = (source) => readMarkup(source)
    .map((entry) => (typeof entry === 'string' ? { text: entry.replace(/^[\s`,]+|[\s`,]+$/g, '') } : { node: toNode(entry) }))
    .filter((entry) => entry.node || entry.text);


// A model sometimes writes its components without the fence that marks them, or in a fence with another name. Both are
// still drawn. Any component that may stand on its own starts a block; the block ends where that component closes, so
// the writing after it stays ordinary text.
const TOP_TAGS = 'Card|Container|Data|Flow|TreeView|Model3D|ButtonGroup|Button|FloatingActionButton|ProgressBar|CircularProgress|Typography|Badge|Image|Video|Audio|PdfViewer|Slides|Sheet|Editor|Input|Select|Switch|Frame';
const BARE_START = new RegExp(`^[ \\t]*<(${TOP_TAGS})[\\s>/]`, 'm');
const TAG_START = new RegExp(`^\\s*<(${TOP_TAGS})[\\s>/]`);
const endOfTag = (text, from) => {
    const name = text.slice(from).match(/^\s*<([A-Za-z0-9]+)/)[1];
    const tags = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'g');
    tags.lastIndex = from;
    let depth = 0;
    for (let tag = tags.exec(text); tag; tag = tags.exec(text)) {
        if (!tag[2]) depth += tag[1] ? -1 : 1;
        if (depth <= 0) return tags.lastIndex;
    }
    return -1;
};
const fenceBareBlocks = (text) => {
    if (!BARE_START.test(text)) return text;
    return String(text).split(/(```[\s\S]*?(?:```|$))/).map((part, position) => {
        if (position % 2 === 1) return part;
        let out = '';
        let rest = part;
        for (let at = rest.search(BARE_START); at !== -1; at = rest.search(BARE_START)) {
            let end = at;
            // Components written one after another belong to one block.
            while (end !== -1) {
                end = endOfTag(rest, end);
                if (end === -1 || !TAG_START.test(rest.slice(end))) break;
            }
            // Not closed, because it is still being written or never was: everything from here on is the component.
            if (end === -1) end = rest.length;
            out += `${rest.slice(0, at)}\n\n\`\`\`component\n${rest.slice(at, end).trim()}\n\`\`\`\n\n`;
            rest = rest.slice(end);
        }
        return out + rest;
    }).join('');
};

const ComponentBlock = ({ source }) => {
    const context = React.useContext(BlockContext);
    const items = useMemo(() => {
        if (/^\s*[{[]/.test(source)) return [{ reason: 'It is written as JSON. Components are written as tags, such as <Card>...</Card>.' }];
        return readComponents(source).map((item) => {
            if (item.text) return item;
            return { tree: item.node };
        });
    }, [source]);

    const shown = context.live ? items.filter((item, index) => !(index === items.length - 1 && (item.reason || item.text))) : items;
    const failed = shown.some((item) => item.reason);
    const pending = context.live && shown.length < items.length;
    const assets = useMemo(() => (context.live ? [] : items.filter((item) => item.tree).flatMap((item) => assetsOf(item.tree))), [items, context.live]);

    return (
        <Container layout="flex-column" gap="sm" padding="none" width="100%" marginBottom="sm">
            {assets.length > 0 && <Container layout="flex" justify="end" padding="none" width="100%"><SaveAssets assets={assets} /></Container>}
            {shown.map((item, index) => {
                if (item.text) return <Typography key={index} as="p" size="sm">{item.text}</Typography>;
                if (item.reason) return <Typography key={index} size="xs" color="warning">The model wrote a component that could not be drawn. {item.reason}</Typography>;
                return (
                    <BlockBoundary
                        key={index}
                        source={source}
                        fallback={<Typography size="xs" color="warning">The model wrote a component that failed while being drawn.</Typography>}
                    >
                        {renderBlock(item.tree, context, 'root')}
                    </BlockBoundary>
                );
            })}
            {(pending || (context.live && items.length === 0)) && <Typography size="xs" color="muted">Building a component…</Typography>}
            {failed && <CodeView code={source} language="xml" />}
            {!context.live && items.length === 0 && <CodeView code={source} language="xml" />}
        </Container>
    );
};

const PreBlock = ({ children }) => {
    const language = String(children?.props?.className || '');
    const code = textOf(children);
    // Components in a fence with another name, such as xml, are drawn all the same, unless it is program code.
    const meant = /language-component\b/.test(language) || (TAG_START.test(code) && !/=>|className=|onClick=|\bimport\s/.test(code));
    if (!meant) return <CodeBlock>{children}</CodeBlock>;
    return <ComponentBlock source={code.replace(/`+\s*$/, '')} />;
};

const heading = (as, size) => ({ children }) => <Typography as={as} size={size} weight="semibold" marginBottom="sm">{children}</Typography>;

const MARKDOWN_PARTS = {
    pre: PreBlock,
    p: ({ children }) => <Typography as="p" size="sm" marginBottom="sm">{children}</Typography>,
    a: ({ children, href }) => <Typography size="inherit" color="tertiary" href={href} target="_blank" rel="noreferrer noopener">{children}</Typography>,
    h1: heading('h2', 'md'),
    h2: heading('h3', 'md'),
    h3: heading('h4', 'sm'),
    h4: heading('h5', 'sm'),
    li: ({ children }) => <Typography as="li" size="sm">{children}</Typography>,
    table: ({ children }) => <Container padding="none" width="100%" overflow="auto" marginBottom="sm"><Typography as="table" size="sm">{children}</Typography></Container>,
    th: ({ children }) => <Typography as="th" size="sm" weight="semibold" padding="xs">{children}</Typography>,
    td: ({ children }) => <Typography as="td" size="sm" padding="xs">{children}</Typography>
};

const Markdown = React.memo(({ text }) => (
    <Container layout="block" padding="none" width="100%">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]} components={MARKDOWN_PARTS}>
            {fenceBareBlocks(text)}
        </ReactMarkdown>
    </Container>
));

const hostOf = (address) => {
    try {
        return new URL(address).host;
    } catch {
        return address;
    }
};
const STEP_FAILURES = {
    refused: 'the search service refused the request. Check its key or settings on the server.',
    blocked: 'only public https addresses can be read.',
    limited: 'the search service is limiting requests right now. Wait a few minutes, or check the monthly allowance of the search key.',
    unreachable: 'the web could not be reached.'
};
const TOOL_FAILURES = {
    failed: 'it reported a problem.',
    refused: 'you did not allow it.',
    offline: 'that computer is not connected.',
    limited: 'the hourly limit on tool use was reached.',
    blocked: 'only public https addresses can be reached.',
    unreachable: 'it could not be reached.',
    cut: 'the model ran out of room while writing the call.'
};
// Why a step failed, in its own words: what a program printed last, or the first thing that came back.
const reasonOf = (step) => {
    const answer = String(step.answer ?? '').trim();
    if (step.failed !== 'failed' || !answer) return TOOL_FAILURES[step.failed] || TOOL_FAILURES.unreachable;
    const errors = answer.match(/\nErrors:\n([\s\S]*?)(\n\n|$)/)?.[1].trim().split('\n').pop().trim();
    const said = errors || answer.split('\n')[0].replace(/^Nothing was run\.\s*/, 'nothing was run. ');
    return said.length > 140 ? `${said.slice(0, 140)}…` : said;
};
const isSearchStep = (step) => step.tool === 'web_search' || step.tool === 'web_fetch';
// A step still under way reads as something happening now; a finished one as something done.
const stepText = (step, active = false) => {
    if (step.tool === 'Skill') {
        if (step.failed) return `Could not open a skill called “${step.input}”`;
        return active ? `Opening the ${step.input} skill…` : `Opened the ${step.input} skill`;
    }
    if (step.tool === 'Component') {
        if (step.failed) return `Could not find a component called “${step.input}”`;
        return active ? `Reading how to draw ${step.input}…` : `Read how to draw ${step.input}`;
    }
    if (step.tool === 'Drawing check') return active ? 'Correcting what it drew…' : 'Corrected what it drew';
    if (step.tool === 'Question') return active ? 'Asking you a question…' : 'Asked you a question';
    if (step.tool === 'Skill file') return active ? `Reading ${step.input}…` : `Read ${step.input}`;
    if (step.tool === 'List files') return step.failed ? `Could not look in ${step.input}` : active ? `Looking in ${step.input}…` : `Looked in ${step.input}`;
    if (step.tool === 'Read a file') return step.failed ? `Could not read ${step.input}` : active ? `Reading ${step.input}…` : `Read ${step.input}`;
    if (step.tool === 'Skill library') return active ? `Looking in the skill library for “${step.input}”…` : `Looked in the skill library for “${step.input}”`;
    if (!isSearchStep(step)) {
        if (step.tool === 'Program' && / lines so far$/.test(step.input)) return `Ran out of room, kept ${step.input} and went on`;
        if (step.failed) return `${step.tool === 'Program' ? 'The program did not work' : `Could not use ${step.tool}`}: ${reasonOf(step)}`;
        return active ? `Using ${step.tool}…` : `Used ${step.tool}`;
    }
    const what = step.tool === 'web_fetch' ? `read ${hostOf(step.input)}` : `search the web for “${step.input}”`;
    if (step.failed) return `Could not ${what}: ${STEP_FAILURES[step.failed] || STEP_FAILURES.unreachable}`;
    if (active) return step.tool === 'web_fetch' ? `Reading ${hostOf(step.input)}…` : `Searching the web for “${step.input}”…`;
    return step.tool === 'web_fetch' ? `Read ${hostOf(step.input)}` : `Searched the web for “${step.input}”`;
};

// A tool step opens to show what was sent and, once it is back, what came back.
const ToolStep = ({ step, text }) => {
    const [open, setOpen] = useState(false);
    const color = step.failed ? 'error' : 'muted';
    return (
        <Container layout="flex-column" gap="none" padding="none" width="100%">
            <Button size="xs" variant="ghost" color={step.failed ? 'error' : 'primary'} onClick={() => setOpen((now) => !now)} title={open ? 'Hide what was sent and what came back' : 'Show what was sent and what came back'}>
                {text}<Icon name={open ? 'FiChevronUp' : 'FiChevronDown'} size="xs" />
            </Button>
            {open && (
                <Container layout="flex-column" gap="none" padding="none" width="100%">
                    <Typography size="xs" color={color}>Sent: {step.input || 'nothing'}</Typography>
                    <Typography size="xs" color={color}>Came back: {step.answer ?? 'not yet'}</Typography>
                </Container>
            )}
        </Container>
    );
};

const Steps = ({ steps, live = false }) => {
    const failed = steps.filter((step) => step.failed).length;
    // Steps that read the same, one after another, are one line with how many there were.
    const groups = steps.reduce((all, step, index) => {
        const text = stepText(step, live && index === steps.length - 1);
        const last = all[all.length - 1];
        if (step.failed && last?.text === text) all[all.length - 1] = { ...last, step, times: last.times + 1 };
        else all.push({ step, text, times: 1 });
        return all;
    }, []);
    const label = live ? stepText(steps[steps.length - 1], true) : `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}${failed > 0 ? `, ${failed} failed` : ''}`;
    return (
        <Fold icon={failed > 0 ? 'FiAlertTriangle' : 'FiTool'} label={label} startOpen={live}>
            {groups.map(({ step, text, times }, index) => (
                <Container key={index} layout="flex" wrap={false} align="center" gap="xs" padding="none">
                    <Icon name={step.failed ? 'FiAlertTriangle' : step.tool === 'Skill' || step.tool === 'Skill library' || step.tool === 'Skill file' ? 'FiZap' : !isSearchStep(step) ? 'FiTool' : step.tool === 'web_fetch' ? 'FiFileText' : 'FiSearch'} size="xs" color={step.failed ? 'error' : 'text'} />
                    {!isSearchStep(step)
                        ? <ToolStep step={step} text={times > 1 ? `${text} (${times} times)` : text} />
                        : step.failed
                        ? <Typography size="xs" color="error">{times > 1 ? `${text} (${times} times)` : text}</Typography>
                        : step.tool === 'web_fetch'
                        ? <Typography size="xs" color="muted" href={/^https?:/i.test(step.input) ? step.input : undefined} target="_blank" rel="noreferrer noopener" truncate>{text}</Typography>
                        : <Typography size="xs" color="muted" truncate>{text}</Typography>}
                </Container>
            ))}
        </Fold>
    );
};

const PlainText = ({ text }) => (
    <Container layout="flex-column" gap="none" padding="none">
        {text.split('\n').map((line, index) => <Typography key={index} as="p" size="sm">{line || ' '}</Typography>)}
    </Container>
);

// What the model is sent in place of a long chat's older messages.
const MemoryView = ({ text }) => (
    <Container layout="flex-column" gap="xs" padding="none" width="100%">
        <Typography size="xs" weight="semibold">What the model remembers of the messages above</Typography>
        <Typography size="xxs" color="muted">The chat's own model wrote this to save room. It is sent instead of those messages; you still see them all here.</Typography>
        <Markdown text={text} />
    </Container>
);

// The notes a model kept with save_note, sent with every message of the chat.
const NotesView = ({ notes }) => (
    <Container layout="flex-column" gap="xs" padding="none" width="100%">
        <Typography size="xs" weight="semibold">Notes the model kept</Typography>
        <Typography size="xxs" color="muted">The model saves these to use later. They are sent with every message of this chat.</Typography>
        {notes.map((note) => (
            <Container key={note.key} layout="flex-column" gap="none" padding="none" width="100%">
                <Typography size="xs" weight="medium">{note.key}</Typography>
                <Typography size="xs" color="muted">{note.text}</Typography>
            </Container>
        ))}
    </Container>
);

const Thinking = ({ text, startOpen = false }) => (
    <Fold icon="FiCpu" label="Thinking" startOpen={startOpen}>
        <Typography size="xs" color="muted">{text}</Typography>
    </Fold>
);

const FileBrowser = ({ mode, onPick, onBack }) => {
    const [path, setPath] = useState('/');
    const [listing, setListing] = useState(null);
    const [problem, setProblem] = useState(null);

    useEffect(() => {
        let current = true;
        setListing(null);
        setProblem(null);
        fileService.browse(path)
            .then((result) => current && setListing(result))
            .catch((error) => current && setProblem(describeError(error, 'Your files could not be loaded.')));
        return () => {
            current = false;
        };
    }, [path]);

    const entries = useMemo(() => (listing ? listing.entries.filter((entry) => mode !== 'save' || entry.type === 'folder') : []), [listing, mode]);

    const crumbs = useMemo(() => {
        const parts = path.split('/').filter(Boolean);
        return [{ name: 'My files', path: '/' }, ...parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join('/')}` }))];
    }, [path]);

    return (
        <>
            <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
                <Button size="xs" variant="ghost" onClick={onBack} title="Back"><Icon name="FiArrowLeft" size="xs" /></Button>
                {crumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.path}>
                        {index > 0 && <Icon name="FiChevronRight" size="xs" color="text" />}
                        <Button size="xs" variant={index === crumbs.length - 1 ? null : 'ghost'} onClick={() => setPath(crumb.path)} title={crumb.path}>
                            {index === 0 && <Icon name="FiHardDrive" size="xs" />}
                            {crumb.name}
                        </Button>
                    </React.Fragment>
                ))}
            </Container>

            {problem && <Typography size="xs" color="error">{problem}</Typography>}
            {!problem && !listing && <Typography size="xs" color="muted">Loading your files…</Typography>}
            {listing && entries.length === 0 && <Typography size="xs" color="muted">{mode === 'save' ? 'No folders inside this one.' : 'This folder is empty.'}</Typography>}
            {entries.length > 0 && (
                <Container layout="flex-column" gap="none" padding="none" width="100%">
                    {entries.map((entry) => {
                        const isFolder = entry.type === 'folder';
                        const usable = isFolder || READABLE.test(entry.name);
                        const extension = entry.name.split('.').pop()?.toLowerCase();
                        return (
                            <Row
                                key={entry.path}
                                icon={isFolder ? 'FiFolder' : FILE_ICONS[extension] || 'FiFile'}
                                iconColor={isFolder ? 'primary' : 'secondary'}
                                label={entry.name}
                                title={usable ? entry.path : 'This kind of file cannot be read as text'}
                                disabled={!usable}
                                onClick={() => (isFolder ? setPath(entry.path) : onPick(entry.path, entry.name))}
                            >
                                <Typography size="xs" color="muted" width="96px">{formatDate(entry.updatedAt)}</Typography>
                                <Typography size="xs" color="muted" width="64px">{isFolder ? '—' : formatSize(entry.size)}</Typography>
                            </Row>
                        );
                    })}
                </Container>
            )}
            {mode === 'save' && listing && (
                <Button size="sm" color="primary" disabled={path === '/'} onClick={() => onPick(path)}>
                    {path === '/' ? 'Open a folder to save in' : `Save in ${crumbs[crumbs.length - 1].name}`}
                </Button>
            )}
        </>
    );
};

const SavedInstructions = ({ onAdd, onBack, full }) => {
    const { error: notifyError } = useNotification();
    const [prompts, setPrompts] = useState(null);

    const load = useCallback(() => {
        promptService.list()
            .then((result) => setPrompts(result.prompts))
            .catch((error) => {
                setPrompts([]);
                notifyError(describeError(error, 'Your saved instructions could not be loaded.'));
            });
    }, [notifyError]);

    useEffect(load, [load]);

    return (
        <>
            <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
                <Button size="xs" variant="ghost" onClick={onBack} title="Back"><Icon name="FiArrowLeft" size="xs" /></Button>
                <Typography size="xs" weight="semibold">Saved instructions</Typography>
            </Container>
            {!prompts && <Typography size="xs" color="muted">Loading…</Typography>}
            {prompts?.length === 0 && (
                <Typography size="xs" color="muted">Nothing is saved yet. Press Save beside an instruction to keep it for other chats.</Typography>
            )}
            {full && <Typography size="xs" color="warning">This chat already has {MAX_ARTICLES} instructions. Remove one to add another.</Typography>}
            <Container layout="flex-column" gap="none" padding="none" width="100%">
                {prompts?.map((prompt) => (
                    <Row
                        key={prompt.id}
                        icon={prompt.source === 'fs-one' ? 'FiHardDrive' : 'FiBookmark'}
                        label={prompt.name}
                        title={prompt.text.slice(0, 300)}
                        disabled={full}
                        onClick={() => onAdd({ name: prompt.name, text: prompt.text, source: prompt.source, path: prompt.path })}
                    >
                        <Button
                            size="xs"
                            variant="ghost"
                            title="Delete this saved instruction"
                            onClick={async (event) => {
                                event.stopPropagation();
                                try {
                                    await promptService.remove(prompt.id);
                                    load();
                                } catch (error) {
                                    notifyError(describeError(error, 'It could not be deleted.'));
                                }
                            }}
                        >
                            <Icon name="FiTrash2" size="xs" color="error" />
                        </Button>
                    </Row>
                ))}
            </Container>
        </>
    );
};

const Message = ({ message, isLast, busy, onRegenerate, onEdit }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(message.content);
    const mine = message.role === 'user';

    const body = (
        <>
            {message.attachments?.length > 0 && (
                <Container layout="flex" gap="xs" padding="none">
                    {message.attachments.map((file) => <Badge key={file.id} size="sm" color="tertiary">{file.name}</Badge>)}
                </Container>
            )}
            {message.steps?.length > 0 && <Steps steps={message.steps} />}
            {message.thinking && <Thinking text={message.thinking} />}
            {editing ? (
                <Container layout="flex-column" gap="xs" padding="none" width="100%" minWidth="min(480px, 68vw)">
                    <Input multiline rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} width="100%" />
                    <Container layout="flex" justify="end" gap="xs" padding="none" width="100%">
                        <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                        <Button
                            size="xs"
                            color="primary"
                            disabled={!draft.trim()}
                            onClick={() => {
                                setEditing(false);
                                onEdit(message.index, draft.trim());
                            }}
                        >
                            Send again
                        </Button>
                    </Container>
                </Container>
            ) : mine ? <PlainText text={message.content} /> : message.content && <UnverifiedAddresses.Provider value={(address) => (message.unverified || []).includes(address)}><Markdown text={message.content} /></UnverifiedAddresses.Provider>}
            {message.error && <Notice icon="FiAlertCircle" tone="error" detail={message.error.detail ? `What the computer said: ${message.error.detail}` : null}>{message.error.message} {message.error.action}</Notice>}
            {message.stopped && <Notice icon="FiSquare">Stopped before it finished.</Notice>}
        </>
    );

    return (
        <Container layout="flex-column" gap="xs" padding="none" width="100%" align={mine ? 'end' : 'stretch'}>
            {!mine && (message.model || message.createdAt) && (
                <Typography size="xxs" color="muted">{[message.model, formatTime(message.createdAt)].filter(Boolean).join(' · ')}</Typography>
            )}
            {mine
                ? <Card backgroundColor="surface-alt" bordered={false} layout="flex-column" gap="xs" padding="md" maxWidth="80%">{body}</Card>
                : <Container layout="flex-column" gap="sm" padding="none" width="100%">{body}</Container>}
            {!editing && (
                <Container layout="flex" align="center" gap="xs" padding="none">
                    {message.content && <CopyButton text={message.content} size="xs" round />}
                    {mine && !busy && (
                        <Button size="xs" variant="ghost" round title="Edit" aria-label="Edit" onClick={() => { setDraft(message.content); setEditing(true); }}>
                            <Icon name="FiEdit2" />
                        </Button>
                    )}
                    {!mine && isLast && !busy && (
                        <Button size="xs" variant="ghost" round title="Regenerate" aria-label="Regenerate" onClick={onRegenerate}><Icon name="FiRefreshCw" /></Button>
                    )}
                    {!mine && <ReplySaveAll content={message.content} />}
                    {!mine && message.stats?.tokensPerSecond && (
                        <Typography size="xxs" color="muted">{message.stats.tokensPerSecond} tokens per second</Typography>
                    )}
                </Container>
            )}
        </Container>
    );
};

const liveStatus = (live) => {
    if (live.stopping) return 'Stopped.';
    if (live.ahead > 0) return `Waiting for the model — ${live.ahead} ahead of you`;
    if (!live.started) return 'Sending…';
    if (live.note) return live.note;
    if (live.sharing > 0) return 'Waiting for another reply that is being written at the same time…';
    if (!live.loaded) return 'Loading the model into memory. The first reply takes longest.';
    return 'Thinking…';
};

// How long the reply has been going, so a long step never looks like a page that stopped.
const LiveClock = () => {
    const since = useRef(Date.now());
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    const seconds = Math.floor((now - since.current) / 1000);
    return <Typography size="xxs" color="muted">Working for {seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`}</Typography>;
};

// What the model is writing into a function call, shown as it arrives: the end of a program, a page or a figure.
// How long a chat is open before another, idle model makes way for its own.
const SWAP_AFTER_MS = 2000;
const DRAFT_TAIL = 1600;
// The call arrives as JSON, so the escapes inside its strings are turned back into the characters they stand for.
const readableDraft = (text) => String(text).replace(/\\n/g, '\n').replace(/\\t/g, '  ').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
const DraftView = ({ text }) => {
    const shown = readableDraft(text);
    return (
        <Fold icon="FiEdit3" label={`Being written: ${shown.length.toLocaleString()} characters so far`}>
            <Typography as="pre" size="xxs" font="monospace" color="muted">{shown.length > DRAFT_TAIL ? `…${shown.slice(-DRAFT_TAIL)}` : shown}</Typography>
        </Fold>
    );
};

const LIVE_BLOCKS = { send: null, live: true };
const Centered = ({ gap = 'sm', children }) => (
    <Container layout="flex" justify="center" padding="md" width="100%">
        <Container layout="flex-column" wrap={false} gap={gap} padding="none" width="100%" maxWidth="760px">{children}</Container>
    </Container>
);

const MODEL_SETTINGS = [
    { key: 'temperature', label: 'Creativity (temperature, 0 to 2)', help: "Lower is more exact, higher is more varied. Empty uses the model's own setting.", min: 0, max: 2, whole: false },
    { key: 'num_ctx', label: 'Context size (tokens)', help: 'How much the model reads at once. Empty lets Mollama choose. Larger sizes use more memory.', min: 512, max: 262144, whole: true },
    { key: 'num_predict', label: 'Longest reply (tokens)', help: 'Stops a reply at this length. Empty or -1 means no limit.', min: -1, max: 100000, whole: true },
    { key: 'top_p', label: 'Word choice breadth (top p, 0 to 1)', help: 'Lower keeps to the most likely words. Empty uses the model setting.', min: 0, max: 1, whole: false },
    { key: 'top_k', label: 'Words considered (top k)', help: 'How many likely next words the model picks from. Empty uses the model setting.', min: 0, max: 500, whole: true },
    { key: 'repeat_penalty', label: 'Repetition penalty', help: 'Higher discourages repeating the same words. Around 1.1 is usual.', min: 0, max: 5, whole: false },
    { key: 'seed', label: 'Seed', help: 'The same number gives the same reply to the same message. Empty gives a different reply each time.', min: null, max: null, whole: true }
];
const emptySetup = { instructions: [], skills: null, tools: [], ...Object.fromEntries(MODEL_SETTINGS.map((setting) => [setting.key, ''])) };

// Chats seen on this visit, per account and in memory only, so coming back to the page or to a chat shows it at once
// while it is read again. Never another chat's content: a chat not seen yet shows a loading line until it arrives.
const seenChats = { owner: null, list: null, opened: new Map() };
const seenBy = (owner) => {
    if (seenChats.owner !== owner) Object.assign(seenChats, { owner, list: null, opened: new Map() });
    return seenChats;
};

const ChatPage = () => {
    const { id: routeId } = useParams();
    const navigate = useNavigate();
    const { success, error: notifyError, confirm } = useNotification();
    const { user: signedIn } = useAuth();
    pickerMemory.as(signedIn?.id || signedIn?._id);
    const seen = seenBy(String(signedIn?.id || signedIn?._id || ''));

    const [chats, setChats] = useState(() => seen.list || []);
    const [chatsRead, setChatsRead] = useState(() => Boolean(seen.list));
    const [search, setSearch] = useState('');
    const [chat, setChat] = useState(() => (routeId && seen.opened.get(routeId)) || null);
    // A chat named in the address that has not arrived yet.
    const opening = Boolean(routeId) && chat?.id !== routeId;
    // The pickers open with what they showed last, so a name is there at once; the fresh answer then corrects it.
    const preferDevice = (list, current) => {
        const computers = list.filter((device) => device.kind !== 'cloud');
        const usable = computers.filter((device) => device.online && !device.paused);
        return (list.find((device) => device.id === deviceService.chosen())
            || list.find((device) => device.id === current)
            || usable.find((device) => deviceService.ready(device))
            || usable[0]
            || list.find((device) => device.kind === 'cloud' && device.ollama?.available)
            || list[0])?.id || null;
    };
    const [devices, setDevices] = useState(() => pickerMemory.devices().devices);
    const [draftDevice, setDraftDevice] = useState(() => {
        const kept = pickerMemory.devices();
        return preferDevice(kept.devices, kept.current);
    });
    // The list of models is kept together with the computer it belongs to, so the two can never be out of step.
    const keptModels = (deviceId) => (pickerMemory.models(deviceId) || []).filter((model) => model.canChat !== false);
    const [modelState, setModelState] = useState(() => ({ device: draftDevice, list: keptModels(draftDevice), loaded: Boolean(pickerMemory.models(draftDevice)) }));
    const modelsAsk = useRef(0);
    const [webSearch, setWebSearch] = useState(false);
    const [skills, setSkills] = useState([]);
    const [skillSources, setSkillSources] = useState([]);
    const [maxSkills, setMaxSkills] = useState(8);
    const [tools, setTools] = useState([]);
    const [text, setText] = useState(() => {
        try {
            return sessionStorage.getItem('mollama-first-prompt') || '';
        } catch {
            return '';
        }
    });
    useEffect(() => {
        try {
            sessionStorage.removeItem('mollama-first-prompt');
        } catch {
            return;
        }
    }, []);
    const [live, setLive] = useState(null);
    const [heavy, setHeavy] = useState(null);
    const [pop, setPop] = useState(null);
    const [view, setView] = useState('main');
    const [skillShelf, setSkillShelf] = useState('library');
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [working, setWorking] = useState(null);
    const [draftSetup, setDraftSetup] = useState(emptySetup);
    const [draftModel, setDraftModel] = useState(null);
    const [draftTitle, setDraftTitle] = useState('');
    const [exportFile, setExportFile] = useState(null);
    const [wide, setWide] = useState(() => window.innerWidth > 900);

    const abortRef = useRef(null);
    const turnRef = useRef(null);
    // The chat whose reply the person stopped. From that moment nothing more of it is drawn, whatever is still on its way.
    const stoppedRef = useRef(null);
    const bottomRef = useRef(null);
    const followRef = useRef(true);
    const idleLive = () => ({ chatId: null, target: null, joined: false, seq: 0, syncing: false, buffer: [], lastAt: 0 });
    const liveRef = useRef(idleLive());
    const streamingRef = useRef(null);
    const chatRef = useRef(null);
    const pieceRef = useRef(null);
    const syncRef = useRef(null);
    chatRef.current = chat;
    // The chat asked for in the address. A reply still running in a chat that was left never takes the page back.
    const routeRef = useRef(routeId || null);
    routeRef.current = routeId || null;
    const wanted = (id) => routeRef.current === id;
    const goTo = (id, options) => {
        routeRef.current = id || null;
        navigate(id ? `/chat/${id}` : '/chat', options);
    };
    const fileInputRef = useRef(null);
    const editsRef = useRef(0);
    const saveChat = async (id, changes) => {
        editsRef.current += 1;
        try {
            return (await chatService.update(id, changes)).chat;
        } finally {
            editsRef.current -= 1;
        }
    };
    const devicesAsk = useRef(0);
    const syncedChat = useRef(null);
    const busy = Boolean(live);

    const openPop = (name) => {
        setView(name === 'setup' ? (skills.length > 0 ? 'skills' : 'main') : 'main');
        setPop(name);
    };
    const closePop = useCallback(() => setPop(null), []);
    const guide = useGuide();

    useEffect(() => {
        const onResize = () => setWide(window.innerWidth > 900);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const loadChats = useCallback(async (term = '') => {
        try {
            const { chats: found } = await chatService.list(term);
            setChats(found);
            setChatsRead(true);
            if (!term) seen.list = found;
        } catch (error) {
            notifyError(describeError(error, 'Your chats could not be loaded.'));
        }
    }, [notifyError]);

    // The computer this chat runs on. With none chosen the server picks one.
    const currentDevice = chat?.device || draftDevice || null;
    // While the list for the computer in use is on its way, what was last seen on that same computer is shown.
    const models = useMemo(() => (modelState.device === currentDevice ? modelState.list : keptModels(currentDevice)), [modelState, currentDevice]);
    const modelsLoaded = modelState.device === currentDevice ? modelState.loaded : Boolean(pickerMemory.models(currentDevice));

    const loadDevices = useCallback(() => {
        const ask = ++devicesAsk.current;
        deviceService.listPickable()
            .then((result) => {
                if (ask !== devicesAsk.current) return;
                setDevices(result.devices);
                pickerMemory.keepDevices(result.devices, result.current);
                // The person's pick stays, even while that computer is offline for a moment; one is chosen only when there is
                // none yet or the picked one has left the account.
                setDraftDevice((now) => (now && result.devices.some((device) => device.id === now) ? now : preferDevice(result.devices, result.current)));
                // The other computers' models are fetched quietly, so switching to one shows its models at once.
                result.devices
                    .filter((device) => deviceService.ready(device))
                    .forEach((device) => modelService.installedOn(device.id).then((answer) => {
                        if (answer.ollamaAvailable !== false) pickerMemory.keepModels(device.id, answer.models);
                    }).catch(() => {}));
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        loadDevices();
    }, [loadDevices]);

    useEffect(() => {
        chatService.on(currentDevice);
        return () => chatService.on(null);
    }, [currentDevice]);

    // The list always belongs to the computer in use: what was last seen on it is shown at once, never another
    // computer's models, and an answer that arrives after the person has moved on is dropped.
    const loadModels = useCallback(async () => {
        const ask = ++modelsAsk.current;
        const kept = pickerMemory.models(currentDevice);
        setModelState({ device: currentDevice, list: keptModels(currentDevice), loaded: Boolean(kept) });
        try {
            const result = await modelService.installedOn(currentDevice);
            // Ollama on that computer did not answer, or another computer answered in its place: what was last seen there
            // stays, and the picker says so.
            if (result.ollamaAvailable === false || (currentDevice && result.device && result.device !== currentDevice)) throw new Error('unreachable');
            pickerMemory.keepModels(currentDevice, result.models);
            if (ask !== modelsAsk.current) return;
            setModelState({ device: currentDevice, fresh: true, list: result.models.filter((model) => model.canChat !== false), loaded: true, others: result.models.filter((model) => model.canChat === false).map((model) => model.displayName || model.name), failed: false });
            if ('webSearch' in result) setWebSearch(Boolean(result.webSearch));
        } catch {
            if (ask !== modelsAsk.current) return;
            setModelState({ device: currentDevice, list: keptModels(currentDevice), loaded: true, others: [], failed: true });
        }
    }, [currentDevice]);

    // A list that could not be read is asked for again a little later, while the page stays on that computer.
    useEffect(() => {
        if (!modelState.failed || modelState.device !== currentDevice) return undefined;
        const timer = setTimeout(loadModels, 5000);
        return () => clearTimeout(timer);
    }, [modelState, currentDevice, loadModels]);

    useEffect(() => {
        loadModels();
    }, [loadModels]);

    useEffect(() => {
        const timer = setTimeout(() => loadChats(search), search ? 250 : 0);
        return () => clearTimeout(timer);
    }, [search, loadChats]);

    useEffect(() => {
        if (!routeId) {
            setChat(null);
            setDraftSetup(emptySetup);
            return;
        }
        if (chat?.id === routeId) return undefined;
        // A chat seen on this visit shows at once and is read again behind it; anything done to it meanwhile is kept.
        const kept = seen.opened.get(routeId) || null;
        setChat(kept);
        // Only the chat still asked for is opened, so a slow answer for one clicked earlier is dropped.
        let wanted = true;
        chatService.get(routeId)
            .then((result) => {
                if (!wanted) return;
                setChat((now) => (now && now.id === result.chat.id && now !== kept ? now : result.chat));
                if (result.chat.replying) joinReply(result.chat);
            })
            .catch((error) => {
                if (!wanted) return;
                notifyError(describeError(error, 'This chat could not be opened.'));
                navigate('/chat', { replace: true });
            });
        return () => {
            wanted = false;
        };
    }, [routeId]);

    useEffect(() => {
        if (!chat?.id) return;
        seen.opened.delete(chat.id);
        seen.opened.set(chat.id, chat);
        if (seen.opened.size > 20) seen.opened.delete(seen.opened.keys().next().value);
    }, [chat]);

    useEffect(() => {
        if (!chat) return;
        // While the instructions menu is open on the same chat, what is being typed there is kept: only the switches follow.
        const typing = syncedChat.current === chat.id && pop === 'setup';
        syncedChat.current = chat.id;
        setDraftSetup((now) => ({
            ...(typing ? now : {
                instructions: chat.instructions || [],
                ...Object.fromEntries(MODEL_SETTINGS.map((setting) => [setting.key, chat.options?.[setting.key] ?? ''])),
                num_ctx: chat.options?.num_ctx ?? ''
            }),
            skills: chat.skills || null,
            tools: chat.tools || []
        }));
    }, [chat?.id, chat?.updatedAt]);

    const pickModel = (list, deviceId, wanted) => {
        const has = (name) => Boolean(name) && list.some((model) => model.name === name);
        if (has(wanted)) return wanted;
        const remembered = pickerMemory.choice(deviceId);
        if (has(remembered)) return remembered;
        // With nothing chosen yet, a model that runs well here, never one too large just because it is listed first.
        const start = list.find((model) => ['gpu', 'cpu'].includes(model.fit?.verdict)) || list.find((model) => model.fit?.fits) || list[0];
        return start?.name || null;
    };
    const currentModel = models.length > 0 ? pickModel(models, currentDevice, chat?.model || draftModel) : chat?.model || draftModel;

    // An open chat whose model is not on its computer is moved to the model shown, once that computer's own list has arrived.
    useEffect(() => {
        if (!chat?.device || !modelState.fresh || modelState.device !== chat.device || !currentModel || chat.model === currentModel) return;
        const id = chat.id;
        saveChat(id, { model: currentModel }).then((saved) => setChat((now) => (now && now.id === id ? saved : now))).catch(() => {});
    }, [chat?.id, chat?.model, modelState, currentDevice, currentModel]);

    const changeDevice = async (id) => {
        if (id === currentDevice) return;
        pickerMemory.keepChoice(currentDevice, currentModel);
        deviceService.choose(id);
        setDraftDevice(id);
        if (!chat) return;
        // The computer and its model change together, in one step.
        const model = pickModel(keptModels(id), id, chat.model) || chat.model;
        const before = { device: chat.device, model: chat.model };
        setChat((now) => now && { ...now, device: id, model });
        try {
            const saved = await saveChat(chat.id, { device: id, model });
            setChat((now) => (now && now.id === saved.id && now.device === id ? saved : now));
        } catch (error) {
            setChat((now) => (now && now.device === id ? { ...now, ...before } : now));
            notifyError(describeError(error, 'The computer could not be changed.'));
        }
    };

    useEffect(() => {
        if (!modelsLoaded || !currentModel) return undefined;
        // Another, idle model makes way only for a chat that stays open, so clicking through chats loads nothing.
        let timer = null;
        let left = false;
        modelService.loadModel(currentModel).then((result) => {
            if (result?.inPlace && !left) timer = setTimeout(() => modelService.loadModel(currentModel, true).catch(() => {}), SWAP_AFTER_MS);
        }).catch(() => {});
        return () => {
            left = true;
            clearTimeout(timer);
        };
    }, [modelsLoaded, currentModel, currentDevice]);

    useEffect(() => {
        if (followRef.current) bottomRef.current?.scrollIntoView({ block: 'end' });
    }, [chat?.messages?.length, live?.content, live?.thinking, live?.steps?.length]);

    useEffect(() => {
        followRef.current = true;
    }, [chat?.id]);

    useEffect(() => () => abortRef.current?.abort(), []);

    useEffect(() => {
        // Whether the server can search does not depend on any computer, so it is read here and not with the model list.
        chatService.skills().then((result) => {
            setSkills(result.skills || []);
            setSkillSources(result.sources || []);
            if (result.maxSkills) setMaxSkills(result.maxSkills);
            setTools(result.tools || []);
            setWebSearch(Boolean(result.webSearch));
        }).catch(() => setSkills([]));
    }, []);

    const setupBody = (setup = draftSetup) => {
        const options = {};
        for (const setting of MODEL_SETTINGS) {
            const raw = String(setup[setting.key] ?? '').trim();
            const value = Number(raw);
            if (raw === '' || Number.isNaN(value)) continue;
            const clean = setting.whole ? Math.round(value) : value;
            options[setting.key] = setting.min === null ? clean : Math.min(setting.max, Math.max(setting.min, clean));
        }
        const instructions = setup.instructions
            .filter((item) => item.text.trim())
            .map((item, index) => ({ name: item.name.trim() || `Instruction ${index + 1}`, text: item.text, source: item.source || 'ai-base', path: item.path || null }));
        return { instructions, options, skills: setup.skills, tools: setup.tools || [] };
    };

    // With nothing chosen, a chat uses the skills that are on by default.
    const activeSkills = draftSetup.skills || skills.filter((skill) => skill.default).map((skill) => skill.id);
    const activeTools = draftSetup.tools || [];
    // The built-in tools are always on, so a chat chooses only among the connected ones.
    const connectedTools = tools.filter((tool) => tool.kind !== 'builtin');
    // Skill and tool switches take effect at once. An open chat is saved as each one is flipped, without touching the
    // instructions being typed; a chat not started yet uses them from its first message.
    const switchSetup = async (changes) => {
        setDraftSetup((now) => ({ ...now, ...changes }));
        if (!chat) return;
        const id = chat.id;
        try {
            const saved = await saveChat(id, changes);
            setChat((now) => (now && now.id === id ? { ...now, skills: saved.skills, tools: saved.tools } : now));
        } catch (error) {
            notifyError(describeError(error, 'This could not be saved for the chat.'));
        }
    };
    const toggleTool = (id) => switchSetup({ tools: activeTools.includes(id) ? activeTools.filter((other) => other !== id) : [...activeTools, id] });
    // Only a model marked as able to use tools is offered them; one whose abilities are not known yet is given the benefit of the doubt.
    const modelAbilities = models.find((model) => model.name === currentModel)?.capabilities;
    const modelUsesTools = !modelAbilities?.length || modelAbilities.includes('tools');
    // Every skill as a row of the Data component, in name order: its search, column filters, sorting and pages are the
    // Data component's own, and a row's checkbox turns the skill on or off for this chat.
    const skillRows = useMemo(() => skills.filter((skill) => (skillShelf === 'mine') === (skill.source === 'mine')).map((skill) => ({
        id: skill.id,
        skill: skill.name,
        about: skill.description || '',
        project: skillSources.find((source) => source.id === skill.source)?.name || skill.source,
        works: skill.needs?.length > 0 ? 'Guidance only' : 'Works here',
        tokens: skill.tokens,
        length: skill.tokens > 4000 ? 'Long' : skill.tokens >= 1000 ? 'Medium' : 'Short',
        on: activeSkills.includes(skill.id) ? 'On' : 'Off',
        suggested: skill.suggested ? 'For small models' : 'Any'
    })).sort((a, b) => a.skill.localeCompare(b.skill, undefined, { sensitivity: 'base' })), [skills, skillSources, skillShelf, activeSkills.join(',')]);
    // The chosen skills show as badges with no dropdown; skills are turned on in the list.
    const skillOptions = useMemo(() => skills.map((skill) => ({ value: skill.id, label: skill.name })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })), [skills]);
    // A badge clicked in the chosen skills opens the list where that skill is, on its own shelf.
    const [skillReveal, setSkillReveal] = useState(null);
    const revealSkill = (id) => {
        setSkillShelf(skills.find((skill) => skill.id === id)?.source === 'mine' ? 'mine' : 'library');
        setSkillReveal({ id, at: Date.now() });
    };
    const mySkillCount = skills.filter((skill) => skill.source === 'mine').length;
    const skillFields = useMemo(() => ({
        skill: { label: 'Skill', component: Typography, props: { weight: 'semibold' } },
        project: { label: 'Project', component: Typography, props: { color: 'muted' } },
        works: { label: 'Works', component: Badge, transform: (value) => ({ children: value, color: value === 'Guidance only' ? 'warning' : 'success', title: value === 'Guidance only' ? 'Its guidance works here. Some of its steps need commands or files that Mollama does not have yet.' : 'Everything it asks for is available.' }) },
        tokens: { label: 'Tokens', component: Typography, transform: (value) => ({ children: value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value), color: value > 4000 ? 'warning' : 'muted', title: value > 4000 ? 'A long skill. A small model may not have room for it and its conversation, and may ignore it.' : undefined }) }
    }), []);
    // A row's own Genie says what the skill is for; the list itself stays one line a skill.
    const skillGenie = {
        trigger: 'click',
        variant: 'popover',
        width: '420px',
        padding: 'md',
        content: (row) => (
            <Container layout="flex-column" gap="sm" padding="none" width="100%">
                <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
                    <Typography as="h3" size="sm" weight="semibold">{row.skill}</Typography>
                    <Badge size="xxs" color={row.works === 'Guidance only' ? 'warning' : 'success'}>{row.works}</Badge>
                </Container>
                <Typography as="p" size="xs">{row.about || 'This skill does not say what it is for.'}</Typography>
                <Typography as="p" size="xxs" color="muted">{`${row.project} · ${row.tokens.toLocaleString()} tokens${row.works === 'Guidance only' ? ' · some of its steps need commands or files Mollama does not have yet' : ''}`}</Typography>
            </Container>
        )
    };
    // The Data checkboxes see only the shelf on show, so the chosen skills from the other shelf are kept alongside.
    const chooseSkills = (chosen, shown) => {
        const hidden = activeSkills.filter((id) => !skillRows.some((row) => row.id === id));
        const ids = [...hidden, ...shown.filter((id) => !hidden.includes(id))];
        if (ids.length > maxSkills) {
            notifyError(`A chat holds at most ${maxSkills} skills. Turn one off to add another.`);
            return;
        }
        switchSetup({ skills: ids });
    };
    const toggleSkill = (id) => switchSetup({ skills: activeSkills.includes(id) ? activeSkills.filter((other) => other !== id) : [...activeSkills, id] });
    const savedNote = chat ? 'Saved to this chat as you switch.' : 'Used for this chat from your first message.';

    const ensureChat = async () => {
        if (chat) return chat;
        const body = setupBody();
        if (currentModel) body.model = currentModel;
        if (currentDevice) body.device = currentDevice;
        const created = (await chatService.create(body)).chat;
        setChat(created);
        goTo(created.id, { replace: true });
        return created;
    };

    const applyEvent = (event) => {
        if (stoppedRef.current && stoppedRef.current === turnRef.current) return;
        if (event.type === 'queued') setLive((now) => now && { ...now, ahead: event.ahead });
        if (event.type === 'start') setLive((now) => now && { ...now, started: true, ahead: null, sharing: event.sharing || 0, loaded: event.loaded !== false });
        if (event.type === 'note') setLive((now) => now && { ...now, note: event.text || null });
        if (event.type === 'thinking') setLive((now) => now && { ...now, thinking: now.thinking + event.text });
        if (event.type === 'token') setLive((now) => now && { ...now, content: now.content + event.text });
        if (event.type === 'replace') setLive((now) => now && { ...now, content: event.text });
        if (event.type === 'tool') setLive((now) => now && { ...now, draft: '', steps: [...(now.steps || []), { tool: event.tool, input: event.input }] });
        if (event.type === 'draft') setLive((now) => now && { ...now, draft: (now.draft || '') + event.text });
        if (event.type === 'permission') setLive((now) => now && { ...now, permission: { id: event.id, tool: event.tool, input: event.input } });
        if (event.type === 'toolFailed' || event.type === 'token') setLive((now) => (now?.permission ? { ...now, permission: null } : now));
        if (event.type === 'toolFailed') setLive((now) => now && { ...now, steps: (now.steps || []).map((step, index, all) => (index === all.length - 1 ? { ...step, failed: event.failed } : step)) });
        if (event.type === 'toolAnswer') setLive((now) => now && { ...now, steps: (now.steps || []).map((step, index, all) => (index === all.length - 1 ? { ...step, answer: event.answer } : step)) });
    };

    // Replies travel on the live connection, each piece numbered, so every app this person has open follows the same
    // reply. A missed piece, or joining part-way, is caught up from the server's copy of what has been sent so far.
    const stopFollowing = () => {
        liveRef.current = idleLive();
    };
    const followLive = (target, state) => {
        abortRef.current?.abort();
        abortRef.current = null;
        followRef.current = true;
        turnRef.current = target.id;
        liveRef.current = { ...idleLive(), chatId: target.id, target, joined: Boolean(state.joined), lastAt: Date.now() };
        setLive(state);
    };
    const applyPiece = (follow, event) => {
        if (event.type === 'end') {
            stopFollowing();
            settle(follow.target);
            return;
        }
        if (event.type === 'accepted' && follow.joined) {
            chatService.get(follow.chatId).then((result) => turnRef.current === follow.chatId && wanted(follow.chatId) && setChat(result.chat)).catch(() => {});
        }
        applyEvent(event);
    };
    const syncLive = async () => {
        const follow = liveRef.current;
        if (!follow.chatId || follow.syncing) return;
        follow.syncing = true;
        let snapshot = null;
        try {
            snapshot = await chatService.live(follow.chatId);
        } catch {
            snapshot = null;
        }
        if (liveRef.current !== follow) return;
        follow.syncing = false;
        follow.lastAt = Date.now();
        if (!snapshot) return;
        if (!snapshot.replying) {
            stopFollowing();
            settle(follow.target);
            return;
        }
        setLive((now) => now && { ...now, content: '', thinking: '', steps: [], note: undefined, started: false, ahead: null });
        snapshot.events.forEach((event) => applyPiece(follow, event));
        follow.seq = snapshot.seq;
        const waiting = follow.buffer.filter((piece) => piece.seq > follow.seq).sort((a, b) => a.seq - b.seq);
        follow.buffer = [];
        waiting.forEach((piece) => pieceRef.current?.(piece));
    };
    syncRef.current = syncLive;
    pieceRef.current = (piece) => {
        if (!piece?.chatId || streamingRef.current === piece.chatId) return;
        const follow = liveRef.current;
        if (follow.chatId !== piece.chatId) {
            // Another of this person's apps started a reply in the chat that is open here.
            const open = chatRef.current;
            if (open?.id === piece.chatId && wanted(piece.chatId) && piece.event.type !== 'end') {
                followLive(open, { joined: true, content: '', thinking: '', ahead: null, started: false });
                syncLive();
            }
            return;
        }
        follow.lastAt = Date.now();
        if (follow.syncing) {
            follow.buffer.push(piece);
            return;
        }
        if (piece.seq <= follow.seq) return;
        if (piece.seq !== follow.seq + 1) {
            follow.buffer.push(piece);
            syncLive();
            return;
        }
        follow.seq = piece.seq;
        applyPiece(follow, piece.event);
    };

    useEffect(() => appService.onNotification('chat:reply', (piece) => pieceRef.current?.(piece)), []);

    // A computer or model changed somewhere: the pickers here follow.
    const availabilityRef = useRef(null);
    availabilityRef.current = () => {
        loadDevices();
        loadModels();
    };
    // A chat changed in another of this person's open apps: the list follows, and so does the open chat unless a
    // reply is being written into it here.
    const chatChangedRef = useRef(null);
    chatChangedRef.current = async (detail = {}) => {
        loadChats(search);
        const open = chatRef.current;
        if (!open || detail.id !== open.id) return;
        if (detail.removed) {
            leave();
            navigate('/chat', { replace: true });
            return;
        }
        if (live || editsRef.current > 0) return;
        try {
            const next = (await chatService.get(open.id)).chat;
            if (chatRef.current?.id !== next.id || !wanted(next.id) || editsRef.current > 0) return;
            setChat(next);
            if (next.replying) joinReply(next);
        } catch {
            return;
        }
    };
    useEffect(() => {
        const onAvailability = () => availabilityRef.current?.();
        const onChat = (event) => chatChangedRef.current?.(event.detail);
        window.addEventListener('ollama-availability-changed', onAvailability);
        window.addEventListener('mollama-chat-changed', onChat);
        return () => {
            window.removeEventListener('ollama-availability-changed', onAvailability);
            window.removeEventListener('mollama-chat-changed', onChat);
        };
    }, []);

    // If the live connection goes quiet in the middle of a reply, the server is asked where the reply has got to.
    useEffect(() => {
        const timer = setInterval(() => {
            const follow = liveRef.current;
            if (follow.chatId && !follow.syncing && Date.now() - follow.lastAt > 6000) syncRef.current?.();
        }, 3000);
        return () => clearInterval(timer);
    }, []);

    // A message refused because its model is too large for the computer's memory waits for the person's word.
    const refuse = (target, body, shownText, error) => {
        const data = error.response?.data;
        if (data?.code === 'NOT_ENOUGH_MEMORY') setHeavy({ chatId: target.id, model: target.model || currentModel, body, shownText, detail: data.detail || data.message, loaded: data.loaded || [], fitsEmpty: data.fitsEmpty !== false, at: Date.now(), removing: [] });
        else notifyError(describeError(error, 'The message could not be sent.'));
        if (shownText && !body.regenerate && body.editIndex === undefined) setText(shownText);
    };
    // Takes one model out of memory, or all the idle ones, and then sends the message again: the server looks afresh.
    const heavyKey = (model) => `${model.device} ${model.source} ${model.name}`;
    const removeHeavy = async (list, stop = false) => {
        setHeavy((now) => now && { ...now, removing: [...now.removing, ...list.map(heavyKey)] });
        const gone = [];
        await Promise.all(list.map(async (model) => {
            try {
                const result = await deviceService.freeMemory(model.device, model.name, { ...(model.source === 'pool' ? { pooled: true } : {}), ...(stop ? { stop: true } : {}) });
                if (result.removed) gone.push(heavyKey(model));
                else notifyError(`${model.displayName} is still in memory on ${model.deviceName}. Try again in a moment.`);
            } catch (error) {
                notifyError(describeError(error, 'The model could not be removed.'));
            }
        }));
        setHeavy((now) => now && { ...now, loaded: now.loaded.filter((model) => !gone.includes(heavyKey(model))), removing: now.removing.filter((key) => !list.some((model) => heavyKey(model) === key)), freed: now.freed || gone.length > 0 });
        return gone.length === list.length;
    };
    const runAnyway = (anyway = true) => {
        const { body, shownText } = heavy;
        const fresh = !body.regenerate && body.editIndex === undefined;
        const content = fresh ? text.trim() || body.content : body.content;
        if (fresh) setText('');
        runTurn(chat, { ...body, ...(content ? { content } : {}), ...(anyway ? { anyway: true } : {}) }, fresh ? content : shownText);
    };

    const runTurn = async (target, body, shownText) => {
        setHeavy(null);
        const state = { userText: shownText, editIndex: body.editIndex, regenerate: Boolean(body.regenerate), content: '', thinking: '', ahead: null, started: false };
        if (appService.notificationsConnected()) {
            followLive(target, state);
            try {
                const result = await chatService.send(target.id, { ...body, live: true }, { onEvent: applyEvent });
                if (result?.started) return;
                stopFollowing();
                settle(target);
                return;
            } catch (error) {
                stopFollowing();
                const refusedLive = error.response?.status === 400 && /live/i.test(error.response.data?.message || '');
                if (!refusedLive && error.response) {
                    refuse(target, body, shownText, error);
                    settle(target);
                    return;
                }
                if (!refusedLive) {
                    joinReply(target);
                    return;
                }
            }
        }
        followRef.current = true;
        const controller = new AbortController();
        abortRef.current = controller;
        turnRef.current = target.id;
        stoppedRef.current = null;
        streamingRef.current = target.id;
        setLive(state);
        let failure = null;
        try {
            await chatService.send(target.id, body, {
                signal: controller.signal,
                onEvent: applyEvent
            });
        } catch (error) {
            if (error.name !== 'AbortError') failure = error;
        }
        streamingRef.current = null;
        abortRef.current = null;

        if (failure?.response) {
            refuse(target, body, shownText, failure);
        } else if (failure) {
            joinReply(target);
            return;
        }
        if (controller.signal.aborted) return;
        settle(target);
    };

    const stopReply = () => {
        const id = turnRef.current;
        if (!id) return;
        stoppedRef.current = id;
        setLive((now) => now && { ...now, stopping: true, permission: null });
        chatService.stop(id).catch(() => {});
    };

    const settle = async (target) => {
        let next = target;
        try {
            next = (await chatService.get(target.id)).chat;
        } catch {
            next = target;
        }
        if (turnRef.current !== target.id || !wanted(target.id)) return;
        setChat(next);
        if (next.replying) {
            joinReply(next);
            return;
        }
        stoppedRef.current = null;
        setLive(null);
        loadChats(search);
        loadModels();
    };

    const joinReply = async (target) => {
        if (appService.notificationsConnected()) {
            followLive(target, { joined: true, content: '', thinking: '', ahead: null, started: false });
            syncLive();
            return;
        }
        abortRef.current?.abort();
        followRef.current = true;
        const controller = new AbortController();
        abortRef.current = controller;
        turnRef.current = target.id;
        setLive({ joined: true, content: '', thinking: '', ahead: null, started: false });
        const onEvent = (event) => {
            if (event.type === 'accepted') chatService.get(target.id).then((result) => turnRef.current === target.id && wanted(target.id) && setChat(result.chat)).catch(() => {});
            applyEvent(event);
        };
        const joined = await chatService.rejoin(target.id, { signal: controller.signal, onEvent }).catch(() => false);
        if (controller.signal.aborted) return;
        abortRef.current = null;
        if (joined) {
            settle(target);
            return;
        }
        if (!wanted(target.id)) return;
        try {
            setChat((await chatService.get(target.id)).chat);
        } catch {
            setChat(target);
        }
        setLive(null);
        loadChats(search);
        loadModels();
    };

    const sendText = async (content) => {
        const trimmed = content.trim();
        if (!trimmed || opening) return;
        if (busy) {
            if (!chat) return;
            setText('');
            try {
                const result = await chatService.send(chat.id, { content: trimmed }, { onEvent: applyEvent });
                if (result?.queued) setChat((now) => now && { ...now, queued: result.queued });
            } catch (error) {
                setText(trimmed);
                notifyError(describeError(error, 'The message could not be sent.'));
            }
            return;
        }
        setText('');
        try {
            const target = await ensureChat();
            await runTurn(target, { content: trimmed }, trimmed);
        } catch (error) {
            setText(trimmed);
            notifyError(describeError(error, 'The chat could not be started.'));
        }
    };

    const leave = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        streamingRef.current = null;
        stopFollowing();
        turnRef.current = null;
        setLive(null);
        loadChats(search);
    };

    const newChat = () => {
        closePop();
        leave();
        setChat(null);
        setDraftModel(null);
        setDraftSetup(emptySetup);
        goTo(null);
    };

    const openChat = (id) => {
        closePop();
        if (id !== chat?.id) leave();
        goTo(id);
    };

    const saveSetup = async () => {
        closePop();
        if (!chat) return;
        try {
            setChat((await chatService.update(chat.id, setupBody())).chat);
            success('Instructions saved for this chat.');
        } catch (error) {
            notifyError(describeError(error, 'The instructions could not be saved.'));
        }
    };

    const changeArticle = (index, changes) => setDraftSetup((now) => ({
        ...now,
        instructions: now.instructions.map((item, position) => (position === index ? { ...item, ...changes } : item))
    }));
    const addArticle = (article) => {
        setView('main');
        setDraftSetup((now) => (now.instructions.length >= MAX_ARTICLES ? now : { ...now, instructions: [...now.instructions, article] }));
    };
    const removeArticle = (index) => setDraftSetup((now) => ({ ...now, instructions: now.instructions.filter((_, position) => position !== index) }));

    const articleFromFile = async (path, name) => {
        setView('main');
        setWorking('Reading the file…');
        try {
            const file = await fileService.text(path);
            addArticle({ name: file.name || name, text: file.text, source: 'fs-one', path });
        } catch (error) {
            notifyError(describeError(error, 'The file could not be read.'));
        } finally {
            setWorking(null);
        }
    };

    const keepArticle = async (article, index) => {
        if (!article.text.trim()) return;
        try {
            await promptService.create({
                name: article.name.trim() || `Instruction ${index + 1}`,
                text: article.text,
                source: article.source || 'ai-base',
                path: article.source === 'fs-one' ? article.path : null
            });
            success('Saved. You can add it to any chat from Saved.');
        } catch (error) {
            notifyError(describeError(error, 'The instruction could not be saved.'));
        }
    };

    const changeModel = async (name) => {
        closePop();
        pickerMemory.keepChoice(currentDevice, name);
        if (!chat) {
            setDraftModel(name);
            return;
        }
        const before = chat.model;
        setChat((now) => now && { ...now, model: name });
        try {
            const saved = await saveChat(chat.id, { model: name });
            setChat((now) => (now && now.id === saved.id && now.model === name ? saved : now));
        } catch (error) {
            setChat((now) => (now && now.model === name ? { ...now, model: before } : now));
            notifyError(describeError(error, 'The model could not be changed.'));
        }
    };

    const rename = async () => {
        const title = draftTitle.trim();
        if (!title) return;
        closePop();
        try {
            setChat((await chatService.update(chat.id, { title })).chat);
            loadChats(search);
        } catch (error) {
            notifyError(describeError(error, 'The chat could not be renamed.'));
        }
    };

    const removeChat = async () => {
        closePop();
        if (!(await confirm(`Delete "${chat.title}"? Its messages and attached documents are removed for good.`, { confirmLabel: 'Delete', color: 'error' }))) return;
        try {
            await chatService.remove(chat.id);
            seen.opened.delete(chat.id);
            setChat(null);
            navigate('/chat', { replace: true });
            loadChats(search);
        } catch (error) {
            notifyError(describeError(error, 'The chat could not be deleted.'));
        }
    };

    const exportAs = async (format, toFiles = false) => {
        try {
            const result = await chatService.exportChat(chat.id, format);
            if (toFiles) {
                setExportFile(result);
                setView('files');
            } else {
                closePop();
                downloadText(result.fileName, result.content);
            }
        } catch (error) {
            notifyError(describeError(error, 'The chat could not be exported.'));
        }
    };

    const saveExport = async (folder) => {
        closePop();
        try {
            const saved = await fileService.save(folder, exportFile.fileName, exportFile.content);
            success(`Saved to ${saved.path}`);
        } catch (error) {
            notifyError(describeError(error, 'The file could not be saved.'));
        }
    };

    const attach = async (work) => {
        closePop();
        setWorking('Reading the document…');
        try {
            const target = await ensureChat();
            setChat((await work(target)).chat);
        } catch (error) {
            notifyError(describeError(error, 'The document could not be attached.'));
        } finally {
            setWorking(null);
        }
    };

    const shown = useMemo(() => {
        const messages = chat?.messages || [];
        if (!live || live.joined) return messages;
        if (live.regenerate) {
            const kept = [...messages];
            while (kept.length > 0 && kept[kept.length - 1].role === 'assistant') kept.pop();
            return kept;
        }
        const base = live.editIndex !== undefined ? messages.slice(0, live.editIndex) : messages;
        const attachments = live.editIndex !== undefined ? messages[live.editIndex]?.attachments : chat?.pendingAttachments;
        return [...base, { id: 'pending', index: base.length, role: 'user', content: live.userText, attachments: attachments || [] }];
    }, [chat, live]);

    const context = chat?.context;
    const pending = live ? [] : chat?.pendingAttachments || [];
    // A list that could not be read is not an empty one: the computer did not answer, and the page says why.
    const modelsFailed = modelState.device === currentDevice && Boolean(modelState.failed);
    const noModels = modelsLoaded && models.length === 0 && !modelsFailed;
    const unreachable = modelsFailed && models.length === 0;
    const placeNow = devices.find((device) => device.id === currentDevice);
    const unreachableText = !placeNow ? 'This computer is no longer on your account. Pick another.'
        : placeNow.kind === 'cloud' ? 'This online service needs attention. Open Online on the Models page.'
        : !placeNow.online ? 'This computer is offline. Open the Mollama app on it, or pick another.'
        : 'This computer did not answer just now. Trying again…';
    const modelLabel = models.find((model) => model.name === currentModel)?.displayName || (!modelsLoaded ? 'Loading models…' : 'Choose a model');
    const articles = draftSetup.instructions;
    const articlesFull = articles.length >= MAX_ARTICLES;

    const chatList = (
        <>
            {(chats.length > 6 || search) && (
                <Input type="search" placeholder="Search by title" value={search} onChange={(event) => setSearch(event.target.value)} width="100%" size="sm" />
            )}
            {chatsRead && chats.length === 0 && <Typography size="xs" color="muted">{search ? 'No chat has that title.' : 'Your chats appear here.'}</Typography>}
            <Container layout="flex-column" wrap={false} gap="xs" padding="none" width="100%" maxHeight="42vh" overflow="auto">
                {chats.map((item) => (
                    <Row key={item.id} label={item.title} selected={item.id === chat?.id} onClick={() => openChat(item.id)} />
                ))}
            </Container>
        </>
    );

    // On a wide page it floats at the bottom left; on a narrow one, where the message box fills the width, it joins its buttons.
    const memoryPop = (fab) => (
        <Pop
            fab={fab}
            {...(fab ? { position: 'bottom-left' } : { iconOnly: true, size: 'xs', label: 'Memory' })}
            icon="FiActivity"
            title="Memory: what is loaded and what it is doing"
            aria-label="Memory"
            open={pop === 'memory'}
            onOpen={() => openPop('memory')}
            onClose={closePop}
            width="600px"
            tall
        >
            <Typography as="h2" size="sm" weight="semibold">Memory</Typography>
            <MemoryManager />
        </Pop>
    );

    return (
        <Page layout="block" padding="none">
            <BlockContext.Provider value={{ send: busy ? null : sendText, live: false }}>
            <Pop
                fab
                position="top-left"
                icon="FiMessageSquare"
                title="Chats"
                aria-label="Chats"
                open={pop === 'chats'}
                onOpen={() => { setDraftTitle(chat?.title || ''); openPop('chats'); }}
                onClose={closePop}
                width={view === 'files' ? '440px' : '320px'}
                tall
            >
                {view === 'rename' && (
                    <>
                        <Input
                            label="Chat name"
                            size="sm"
                            width="100%"
                            maxLength={120}
                            value={draftTitle}
                            onChange={(event) => setDraftTitle(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && rename()}
                        />
                        <Container layout="flex" justify="end" gap="xs" padding="none" width="100%">
                            <Button size="sm" variant="ghost" onClick={() => setView('main')}>Back</Button>
                            <Button size="sm" disabled={!draftTitle.trim()} onClick={rename}>Save</Button>
                        </Container>
                    </>
                )}
                {view === 'files' && <FileBrowser mode="save" onPick={saveExport} onBack={() => setView('main')} />}
                {view === 'main' && (
                    <>
                        <Button width="100%" onClick={newChat} {...guide.tip('chat.new')}><Icon name="FiPlus" size="xs" />New chat</Button>
                        {chatList}
                        {chat && (
                            <>
                                <Divider />
                                <Container layout="flex-column" gap="none" padding="none" width="100%">
                                    <Typography size="xxs" color="muted" weight="semibold">This chat</Typography>
                                    {[
                                        ['FiEdit', 'Rename', () => setView('rename')],
                                        ...(chat.messages.length > 0 ? [
                                            ['FiDownload', 'Download as Markdown', () => exportAs('markdown')],
                                            ['FiDownload', 'Download as JSONL', () => exportAs('jsonl')],
                                            ['FiHardDrive', 'Save Markdown to my files', () => exportAs('markdown', true)],
                                            ['FiHardDrive', 'Save JSONL to my files', () => exportAs('jsonl', true)]
                                        ] : []),
                                        ['FiTrash2', 'Delete chat', removeChat, 'error']
                                    ].map(([icon, label, act, color]) => (
                                        <Button key={label} size="sm" variant="ghost" color={color || 'primary'} align="start" width="100%" disabled={busy} title={busy ? 'Available when the reply has finished' : label} onClick={act}><Icon name={icon} size="xs" />{label}</Button>
                                    ))}
                                </Container>
                            </>
                        )}
                    </>
                )}
            </Pop>
            {wide && memoryPop(true)}
            <Container layout="flex" wrap={false} align="stretch" gap="none" padding="none" width="100%" height="100vh">
                <Container layout="flex-column" wrap={false} gap="none" padding="none" flexFill minWidth="0" height="100%">
                    <Container layout="flex" wrap={false} align="center" gap="sm" padding="md" width="100%" height="80px" minHeight="80px">
                        <Container padding="none" width="64px" minWidth="64px" />
                        <Container padding="none" minWidth="0">
                            <Typography as="h1" size="md" weight="semibold" font="secondary" margin="none" truncate>{opening ? (chats.find((one) => one.id === routeId)?.title || '') : chat?.title || 'New chat'}</Typography>
                        </Container>
                        <Container padding="none" flexFill minWidth="0" />
                        <Container padding="none" flexFill minWidth="0" />
                        <Container padding="none" width="64px" minWidth="64px" />
                    </Container>
                    <Container
                        layout="block"
                        padding="none"
                        width="100%"
                        flexFill
                        minHeight="0"
                        overflow="auto"
                        onScroll={(event) => {
                            const box = event.currentTarget;
                            followRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
                        }}
                    >
                    <Centered gap="xl">
                        {chat?.summary && (
                            <Fold icon="FiInfo" label="This chat continues from an earlier one. Show the summary it started with.">
                                <Markdown text={chat.summary} />
                            </Fold>
                        )}
                        {opening && <Notice busy>Opening this chat…</Notice>}
                        {shown.length === 0 && !busy && !opening && (
                            <Container layout="flex-column" gap="md" padding="none" marginTop="3xl" width="100%">
                                <Typography as="h2" size="lg" weight="semibold" font="secondary">What would you like to work on?</Typography>
                                {unreachable ? (
                                    <Notice icon="FiAlertCircle" tone="warning">{unreachableText}</Notice>
                                ) : noModels ? (
                                    <Notice icon="FiInfo" actions={<Button size="sm" onClick={() => navigate('/models')}>Open Models</Button>}>
                                        No model is installed on this device yet. Download one first.
                                    </Notice>
                                ) : (
                                    <>
                                        <Typography size="sm" color="muted">Nothing needs to be chosen first. You can also attach a document and ask about it.</Typography>
                                        <Container layout="flex" gap="sm" padding="none">
                                            <Button size="sm" onClick={() => sendText(FIRST_MESSAGE)}>Try: “{FIRST_MESSAGE}”</Button>
                                        </Container>
                                    </>
                                )}
                            </Container>
                        )}
                        {shown.map((message, index) => (
                            <React.Fragment key={message.id}>
                                {chat?.memory && message.index === chat.memoryThrough && (
                                    <Container layout="flex" align="center" gap="xs" padding="none" width="100%" wrap={false}>
                                        <Container padding="none" flexFill><Divider size="xs" /></Container>
                                        <Button size="xs" variant="ghost" genieTrigger="click" genie={{ trigger: 'click', width: '420px', padding: 'sm', content: <MemoryView text={chat.memory} /> }} title="The messages above are still here for you. The model now gets a short memory of them instead, so the chat fits what it can read. Choose to read the memory.">
                                            <Icon name="FiArchive" size="xs" />Context compressed: the model keeps a memory of the messages above
                                        </Button>
                                        <Container padding="none" flexFill><Divider size="xs" /></Container>
                                    </Container>
                                )}
                                <Message
                                    message={message}
                                    isLast={index === shown.length - 1}
                                    busy={busy}
                                    onRegenerate={() => runTurn(chat, { regenerate: true }, null)}
                                    onEdit={(messageIndex, content) => runTurn(chat, { content, editIndex: messageIndex }, content)}
                                />
                            </React.Fragment>
                        ))}
                        {live && (
                            <Container layout="flex-column" gap="sm" padding="none" width="100%">
                                {currentModel && <Typography size="xxs" color="muted">{modelLabel}</Typography>}
                                {live.steps?.length > 0 && <Steps steps={live.steps} live={!live.stopping && Boolean(live.note)} />}
                                {live.draft && !live.stopping && <DraftView text={live.draft} />}
                                {live.permission && (
                                    <Notice
                                        icon="FiShield"
                                        tone="warning"
                                        mono
                                        detail={live.permission.input}
                                        actions={[['once', 'Allow once', 'primary'], ['always', 'Always in this chat', 'primary'], ['no', 'Refuse', 'error']].map(([answer, label, color]) => (
                                            <Button key={answer} size="xs" color={color} disabled={Boolean(live.permission.sending)} onClick={() => {
                                                const question = live.permission.id;
                                                const same = (now) => now?.permission?.id === question;
                                                setLive((now) => (same(now) ? { ...now, permission: { ...now.permission, sending: true } } : now));
                                                chatService.answerPermission(chat.id, question, answer).then(
                                                    () => setLive((now) => (same(now) ? { ...now, permission: null } : now)),
                                                    (error) => {
                                                        setLive((now) => (same(now) ? { ...now, permission: { ...now.permission, sending: false } } : now));
                                                        notifyError(describeError(error, 'Your answer could not be sent. Try again.'));
                                                    }
                                                );
                                            }}>{label}</Button>
                                        ))}
                                    >
                                        {live.permission.tool} can change things. Allow it to run?
                                    </Notice>
                                )}
                                {live.thinking && <Thinking text={live.thinking} startOpen={!live.stopping} />}
                                {live.content && <BlockContext.Provider value={LIVE_BLOCKS}><Markdown text={live.content} /></BlockContext.Provider>}
                                {live.content && live.stopping && <Notice icon="FiSquare">Stopped before it finished.</Notice>}
                                {live.content && live.note && !live.stopping && <Notice busy>{live.note}</Notice>}
                                {!live.content && <Notice busy>{liveStatus(live)}</Notice>}
                                {!live.stopping && <LiveClock />}
                            </Container>
                        )}
                        {live && (chat?.queued || []).map((item, index) => (
                            <Container key={`${index}-${item}`} layout="flex-column" gap="xs" padding="none" width="100%" align="end">
                                <Card backgroundColor="surface-alt" bordered={false} layout="flex-column" gap="xs" padding="md" maxWidth="80%"><PlainText text={item} /></Card>
                                <Typography size="xxs" color="muted">Waiting. It is sent when the reply above is finished.</Typography>
                            </Container>
                        ))}
                        <Container ref={bottomRef} padding="none" />
                    </Centered>
                    </Container>
                <Centered>
                    {heavy && heavy.chatId === chat?.id && heavy.model === currentModel && !busy && (
                        <Card layout="flex-column" gap="sm" padding="md" width="100%">
                            <Notice icon="FiAlertTriangle" tone="warning" role="status">
                                {heavy.detail} Your message was not sent.
                            </Notice>
                            {heavy.loaded.length > 0 && <Typography as="h2" size="xs" weight="semibold">In memory now</Typography>}
                            {heavy.loaded.map((model) => (
                                <MemoryRow key={heavyKey(model)} model={model} now={heavy.at} where={model.deviceName} busy={heavy.removing.includes(heavyKey(model))} onRemove={(one, stop) => removeHeavy([one], stop)} />
                            ))}
                            <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
                                {heavy.fitsEmpty && heavy.loaded.some((model) => model.state === 'idle') && (
                                    <Button size="xs" color="primary" variant="solid" disabled={heavy.removing.length > 0} onClick={async () => { if (await removeHeavy(heavy.loaded.filter((model) => model.state === 'idle'))) runAnyway(false); }}>Remove what is idle and send</Button>
                                )}
                                {heavy.fitsEmpty && heavy.freed && <Button size="xs" color="primary" disabled={heavy.removing.length > 0} onClick={() => runAnyway(false)}>Send now</Button>}
                                <Button size="xs" color="warning" disabled={heavy.removing.length > 0} onClick={() => runAnyway(true)}>Run it anyway</Button>
                                <Button size="xs" variant="ghost" onClick={() => setHeavy(null)}>Not now</Button>
                            </Container>
                        </Card>
                    )}
                    {context?.warn && !busy && chat.messages.length > 0 && (
                        <Notice icon="FiArchive" tone="warning" role="status">This chat is {context.percent}% full. Older messages are compressed into a memory as you go, so you can keep going here.</Notice>
                    )}

                    <Card layout="flex-column" gap="xs" padding="md" width="100%">
                        {working && pop !== 'setup' && <Notice busy>{working}</Notice>}
                        {pending.length > 0 && (
                            <Container layout="flex" wrap align="center" gap="xs" padding="none">
                                {pending.map((file) => (
                                    <Button
                                        key={file.id}
                                        size="xs"
                                        title={`${file.path || file.name}. Click to remove.`}
                                        onClick={async () => setChat((await chatService.removeAttachment(chat.id, file.id)).chat)}
                                    >
                                        <Icon name="FiFileText" size="xs" />{file.name}<Icon name="FiX" size="xs" />
                                    </Button>
                                ))}
                            </Container>
                        )}
                        <Typography as="div" size="sm" width="100%">
                        <Input
                            multiline
                            rows={2}
                            size="sm"
                            inheritText
                            dictation
                            onDictationError={notifyError}
                            width="100%"
                            variant="underline"
                            backgroundColor="surface"
                            placeholder={unreachable ? unreachableText : noModels ? 'Download a model on the Models page first' : 'Write a message. Enter sends, Shift+Enter starts a new line.'}
                            value={text}
                            disabled={noModels || unreachable}
                            onChange={(event) => setText(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                                    event.preventDefault();
                                    sendText(text);
                                }
                            }}
                        />
                        </Typography>
                        <Container layout="flex" wrap={false} align="center" gap="xs" padding="none" width="100%">
                            <Pop
                                label="Attach"
                                icon="FiPaperclip"
                                iconOnly
                                size="xs"
                                open={pop === 'attach'}
                                onOpen={() => openPop('attach')}
                                onClose={closePop}
                                disabled={busy || Boolean(working) || noModels || unreachable}
                                width={view === 'files' ? '440px' : '240px'}
                            >
                                {view === 'files' ? (
                                    <FileBrowser mode="read" onPick={(path) => attach((target) => chatService.attachFile(target.id, path))} onBack={() => setView('main')} />
                                ) : (
                                    <Container layout="flex-column" gap="none" padding="none" width="100%">
                                        <Row icon="FiMonitor" label="From this computer" onClick={() => { closePop(); fileInputRef.current?.click(); }} />
                                        <Row icon="FiHardDrive" label="From my files" onClick={() => setView('files')} />
                                    </Container>
                                )}
                            </Pop>
                            <Pop
                                label={articles.length > 0 ? `Skills and instructions (${articles.length} added)` : 'Skills and instructions'}
                                icon="FiZap"
                                iconOnly
                                size="xs"
                                mark={articles.length > 0 ? <Badge size="xxs" color="primary">{articles.length}</Badge> : null}
                                open={pop === 'setup'}
                                onOpen={() => openPop('setup')}
                                onClose={closePop}
                                width={view === 'skills' ? '1040px' : '480px'}
                                tall
                            >
                {(view === 'skills' || view === 'main') && (
                    <Container layout="flex" wrap={false} align="center" justify="between" gap="xs" padding="none" width="100%">
                        <ButtonGroup size="xs" justify="start" selectable={false}>
                            {skills.length > 0 && <Button size="xs" selected={view === 'skills'} onClick={() => setView('skills')}>{`Skills · ${activeSkills.length}`}</Button>}
                            <Button size="xs" selected={view === 'main'} onClick={() => setView('main')}>{`Instructions · ${articles.length}`}</Button>
                        </ButtonGroup>
                        {view === 'skills' && <Button size="xs" variant="ghost" disabled={!draftSetup.skills} onClick={() => switchSetup({ skills: null })}>Use defaults</Button>}
                    </Container>
                )}
                {view === 'files' && <FileBrowser mode="read" onPick={articleFromFile} onBack={() => setView('main')} />}
                {view === 'saved' && <SavedInstructions onAdd={addArticle} onBack={() => setView('main')} full={articlesFull} />}
                {view === 'skills' && (
                    <Container layout="flex-column" gap="xs" padding="none" width="100%">
                        {activeSkills.length >= maxSkills
                            ? <Typography size="xs" color="warning">{`${activeSkills.length} of ${maxSkills} skills are on, which is the most a chat holds, so the other switches are off. Turn one off to add another.`}</Typography>
                            : <Typography size="xxs" color="muted">{`${activeSkills.length} of ${maxSkills} on. ${savedNote} A skill is instructions, not a tool: the model reads it with every message, so turn on only what this chat needs.`}</Typography>}
                        <Select
                            size="md"
                            width="100%"
                            multiSelect
                            options={skillOptions}
                            value={activeSkills}
                            onChange={(ids) => chooseSkills(null, ids)}
                            onBadgeClick={revealSkill}
                            menu={false}
                            placeholder="No skills on. Tick one in the list below."
                            aria-label="Skills on in this chat"
                        />
                        <Container layout="flex" wrap={false} align="center" justify="between" gap="xs" padding="none" width="100%">
                            <ButtonGroup size="xs">
                                <Button size="xs" variant={skillShelf === 'library' ? 'primary' : 'secondary'} onClick={() => setSkillShelf('library')}>{`Library · ${skills.length - mySkillCount}`}</Button>
                                <Button size="xs" variant={skillShelf === 'mine' ? 'primary' : 'secondary'} onClick={() => setSkillShelf('mine')}>{`My skills · ${mySkillCount}`}</Button>
                            </ButtonGroup>
                            {skillShelf === 'mine' && <Button size="xs" variant="ghost" onClick={() => navigate('/tools')}><Icon name="FiPlus" size="xs" />Add a skill</Button>}
                        </Container>
                        {skillRows.length === 0
                            ? <Typography size="xs" color="muted">You have not added any skills of your own yet. Add one by its address under Tools, and it shows here.</Typography>
                            : (
                                <Data
                                    key={skillShelf}
                                    flat
                                    reveal={skillReveal}
                                    size="xs"
                                    width="100%"
                                    variant="list"
                                    data={skillRows}
                                    fieldConfig={skillFields}
                                    exclude={['id', 'about', 'length', 'on', 'suggested']}
                                    genie={skillGenie}
                                    pageSize={10}
                                    selector
                                    selectedItems={activeSkills.filter((id) => skillRows.some((row) => row.id === id))}
                                    onSelectionChange={chooseSkills}
                                />
                            )}
                    </Container>
                )}
                {view === 'main' && (
                    <>
                        <Typography size="xs" color="muted">
                            What the model should know or follow in this chat. Add as many pieces as you need: typed text, files, or ones you saved earlier.
                        </Typography>
                        {working && <Typography size="xs" color="muted">{working}</Typography>}
                        {articles.map((article, index) => (
                            <Container key={index} layout="flex-column" gap="xs" padding="none" width="100%">
                                <Container layout="flex" wrap={false} align="center" gap="xs" padding="none" width="100%">
                                    <Icon name={article.source === 'fs-one' ? 'FiHardDrive' : 'FiType'} size="xs" />
                                    <Container padding="none" flexFill minWidth="0">
                                        <Input
                                            size="xs"
                                            width="100%"
                                            placeholder={`Instruction ${index + 1}`}
                                            maxLength={120}
                                            value={article.name}
                                            onChange={(event) => changeArticle(index, { name: event.target.value })}
                                        />
                                    </Container>
                                    <Button size="xs" variant="ghost" title="Save for other chats" aria-label="Save for other chats" disabled={!article.text.trim()} onClick={() => keepArticle(article, index)}>
                                        <Icon name="FiBookmark" />
                                    </Button>
                                    <Button size="xs" variant="ghost" title="Remove from this chat" aria-label="Remove from this chat" onClick={() => removeArticle(index)}>
                                        <Icon name="FiX" />
                                    </Button>
                                </Container>
                                <Input
                                    multiline
                                    rows={3}
                                    size="xs"
                                    width="100%"
                                    placeholder="For example: Reply only in formal British English."
                                    value={article.text}
                                    onChange={(event) => changeArticle(index, { text: event.target.value, source: 'ai-base', path: null })}
                                />
                                {article.source === 'fs-one' && (
                                    <Typography size="xxs" color="muted">Copied from {article.path}. Later changes to that file do not change this chat.</Typography>
                                )}
                            </Container>
                        ))}
                        <Container layout="flex" align="center" gap="xs" padding="none" width="100%">
                            <Button size="xs" variant="ghost" disabled={articlesFull} onClick={() => addArticle({ name: '', text: '', source: 'ai-base', path: null })}>
                                <Icon name="FiPlus" size="xs" />Add text
                            </Button>
                            <Button size="xs" variant="ghost" disabled={articlesFull} onClick={() => setView('files')}>
                                <Icon name="FiHardDrive" size="xs" />From my files
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => setView('saved')}>
                                <Icon name="FiBookmark" size="xs" />Saved
                            </Button>
                        </Container>
                        {advancedOpen && (
                            <>
                                <Container layout="grid" columns={2} gap="xs" padding="none" width="100%">
                                    {MODEL_SETTINGS.map((setting) => (
                                        <Input
                                            key={setting.key}
                                            label={setting.label}
                                            helpText={setting.help}
                                            type="number"
                                            size="xs"
                                            width="100%"
                                            value={draftSetup[setting.key]}
                                            onChange={(event) => setDraftSetup((now) => ({ ...now, [setting.key]: event.target.value }))}
                                        />
                                    ))}
                                </Container>
                            </>
                        )}
                        <Container layout="flex" align="center" justify="between" gap="xs" padding="none" width="100%">
                            <Button size="xs" variant="ghost" onClick={() => setAdvancedOpen((open) => !open)}>{advancedOpen ? 'Hide advanced' : 'Advanced'}</Button>
                            <Button size="xs" color="primary" onClick={saveSetup}>{chat ? 'Save' : 'Use for this chat'}</Button>
                        </Container>
                    </>
                )}
                            </Pop>
                            <Pop
                                label="Tools"
                                icon="FiTool"
                                iconOnly
                                size="xs"
                                open={pop === 'tools'}
                                onOpen={() => openPop('tools')}
                                onClose={closePop}
                                width="480px"
                                tall
                            >
                    <Container layout="flex-column" gap="xs" padding="none" width="100%">
                        <Container layout="flex" wrap={false} align="center" justify="between" gap="xs" padding="none" width="100%">
                            <Typography as="h2" size="sm" weight="semibold">Tools</Typography>
                            <Button size="xs" variant="ghost" onClick={() => navigate('/tools')}>Manage tools</Button>
                        </Container>
                        {modelUsesTools
                            ? <Typography size="xxs" color="muted">{webSearch ? 'Web search, calculator, date and time and reading a web page are always on.' : 'Calculator, date and time and reading a web page are always on. Web search is not set up on the server.'}</Typography>
                            : <Typography size="xs" color="warning">This model cannot use tools. Pick one without the No tools mark.</Typography>}
                        {connectedTools.length === 0
                            ? <Typography size="xs" color="muted">No tools are connected yet. Add one under Manage tools.</Typography>
                            : modelUsesTools && <Typography size="xxs" color="muted">{savedNote}</Typography>}
                        {connectedTools.map((tool) => (
                        <Container key={tool.id} layout="flex" wrap={false} align="center" justify="between" gap="xs" padding="none" width="100%" title={tool.ready ? `${tool.count === 1 ? '1 tool' : `${tool.count} tools`} · ${tool.kind === 'local' ? 'on your computer' : 'online'}` : `${tool.state}. Open Manage tools to see what it needs.`}>
                            <Container layout="flex-column" gap="none" padding="none" flexFill minWidth="0">
                                <Typography size="xs" truncate>{tool.name}</Typography>
                                <Typography size="xxs" color="muted" truncate>{tool.ready ? `${tool.count === 1 ? '1 tool' : `${tool.count} tools`} · ${tool.kind === 'local' ? 'on your computer' : 'online'}` : `${tool.state}. Open Manage tools to see what it needs.`}</Typography>
                            </Container>
                            <Switch size="xs" checked={activeTools.includes(tool.id)} disabled={!modelUsesTools || !tool.ready} onChange={() => toggleTool(tool.id)} aria-label={tool.name} />
                        </Container>
                        ))}
                    </Container>
                            </Pop>
                            {!wide && memoryPop(false)}
                            {(chat?.notes || []).length > 0 && (
                                <Pop
                                    label={`Notes the model kept (${chat.notes.length})`}
                                    icon="FiBookmark"
                                    iconOnly
                                    size="xs"
                                    open={pop === 'notes'}
                                    onOpen={() => openPop('notes')}
                                    onClose={closePop}
                                    width="360px"
                                >
                                    <NotesView notes={chat.notes} />
                                </Pop>
                            )}
                            <Input
                                ref={fileInputRef}
                                type="file"
                                hidden
                                accept=".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.log,.pdf,.docx,.xml,.yaml,.yml,.html,.htm,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.sql,.sh,.css,.ini,.toml,.png,.jpg,.jpeg,.webp,.gif"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = '';
                                    if (!file) return;
                                    if (file.size > 20 * 1024 * 1024) {
                                        notifyError('This file is larger than 20 MB. Use a smaller file.');
                                        return;
                                    }
                                    attach((target) => chatService.attachUpload(target.id, file));
                                }}
                            />
                            <Container padding="none" flexFill minWidth="0">
                                {context && (
                                    <Typography
                                        size="xxs"
                                        color={context.warn ? 'warning' : 'muted'}
                                        truncate
                                        title={`${context.usedTokens.toLocaleString()} of ${context.capacityTokens.toLocaleString()} tokens used${pending.length > 0 ? ', including what is attached' : ''}`}
                                    >
                                        {100 - context.percent}% context left
                                    </Typography>
                                )}
                            </Container>
                            <Pop
                                    label={devices.length > 1 ? `${devices.find((device) => device.id === currentDevice)?.name || 'Pick a computer'} · ${modelLabel}` : modelLabel}
                                    icon={devices.length > 1 ? DEVICE_ICONS[devices.find((device) => device.id === currentDevice)?.kind] || 'FiMonitor' : null}
                                    endIcon="FiCpu"
                                    iconOnly={!wide}
                                    size="xs"
                                    open={pop === 'model'}
                                    onOpen={() => openPop('model')}
                                    onClose={closePop}
                                    width={devices.length > 1 ? '600px' : '330px'}
                                >
                                    <Container layout="flex" wrap={false} align="stretch" gap="sm" padding="none" width="100%">
                                        {devices.length > 1 && (
                                            <Container layout="flex-column" gap="none" padding="none" width="50%" minWidth="0">
                                                <Typography size="xxs" color="muted" weight="semibold">Run on</Typography>
                                                {devices.map((device) => (
                                                    <Row key={device.id} icon={DEVICE_ICONS[device.kind] || 'FiMonitor'} label={device.name} size="xs" selected={device.id === currentDevice} disabled={!device.online || device.paused} onClick={() => changeDevice(device.id)}>
                                                        {deviceService.ready(device)
                                                            ? <Icon name="FiCheckCircle" size="xs" color="success" title="Ready to use right now" aria-label="Ready to use right now" />
                                                            : device.online && !device.paused && device.ollama?.available && device.ollama.modelCount > 0
                                                                ? <Badge size="xxs" color="warning" title="The models on this computer cannot chat. Download a chat model on the Models page.">No chat model</Badge>
                                                                : <Badge size="xxs" color={device.paused ? 'warning' : device.online ? 'success' : 'default'}>{device.paused ? 'Paused' : device.online ? 'Online' : 'Offline'}</Badge>}
                                                    </Row>
                                                ))}
                                            </Container>
                                        )}
                                        {devices.length > 1 && <Divider orientation="vertical" />}
                                        <Container layout="flex-column" gap="none" padding="none" flexFill minWidth="0">
                                            {devices.length > 1 && <Typography size="xxs" color="muted" weight="semibold">Models</Typography>}
                                            {models.length === 0 && (
                                                <Typography size="xs" color="muted">
                                                    {!modelsLoaded ? 'Loading the models on this computer…'
                                                        : modelState.device === currentDevice && modelState.failed ? (
                                                            !devices.some((device) => device.id === currentDevice) ? 'This computer is no longer on your account. Pick another.'
                                                            : devices.find((device) => device.id === currentDevice)?.kind === 'cloud' ? 'This online service needs attention. Open Online on the Models page.'
                                                            : !devices.find((device) => device.id === currentDevice)?.online ? 'This computer is offline. Open the Mollama app on it.'
                                                            : 'Ollama on this computer did not answer just now. Trying again…')
                                                        : modelState.device === currentDevice && modelState.others?.length ? `The models here cannot chat: ${modelState.others.join(', ')}. Download a chat model on the Models page.`
                                                        : 'No model is installed yet.'}
                                                </Typography>
                                            )}
                                            {models.map((model) => (
                                                <Row key={model.name} label={model.displayName} size="xs" selected={model.name === currentModel} onClick={() => changeModel(model.name)}>
                                                    {model.capabilities?.length > 0 && !model.capabilities.includes('tools') && <Badge size="xxs" color="warning" title="This model cannot use tools or search the web. It answers only from what it already knows.">No tools</Badge>}
                                                    <Badge size="xxs" color={FIT_COLORS[model.fit?.verdict] || 'tertiary'}>{model.fit?.label || 'Fit unknown'}</Badge>
                                                    {model.ready && <Icon name="FiCheckCircle" size="xs" color="success" title="Loaded and ready to use right now" aria-label="Loaded and ready to use right now" />}
                                                </Row>
                                            ))}
                                        </Container>
                                    </Container>
                                </Pop>
                            {busy && !live?.stopping && <Button size="sm" color="secondary" variant="solid" title="Stop" aria-label="Stop" onClick={stopReply}><Icon name="FiSquare" size="xs" /></Button>}
                            <Button size="sm" color={busy ? 'primary' : 'secondary'} variant={busy ? 'ghost' : 'solid'} title={busy ? 'Send when this reply is finished' : 'Send'} aria-label="Send" disabled={!text.trim() || noModels || unreachable} onClick={() => sendText(text)} {...guide.tip('chat.send')}><Icon name="FiArrowUp" size="xs" /></Button>
                        </Container>
                    </Card>
                </Centered>
                </Container>
            </Container>
            </BlockContext.Provider>
        </Page>
    );
};

export default ChatPage;
