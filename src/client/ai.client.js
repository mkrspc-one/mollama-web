import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@contexts/AuthContext';
import { useNotification } from '@contexts/NotificationContext';
import { Button, Container, Icon, Typography } from '@components/Components';
import { sharedAPI as api, API_BASE_URL, refreshCsrfToken, appService } from './app.client.js';

export const guideService = {
    get: () => api.get('/guide'),
    set: (on) => api.put('/guide', { on }),
    seen: (key) => api.post('/guide/seen', { key })
};

export const GUIDE_TEXT = {
    'nav.chat': ['Chat', 'Talk to a model that runs on this computer. Your chats are saved, and only you can open them.'],
    'nav.models': ['Models', 'Find models that fit this device, download them, and make your own versions.'],
    'nav.devices': ['Devices', 'What Mollama reads from this computer: graphics card, memory and free disk.'],
    'nav.settings': ['Settings', 'Your account, sign-in security, themes, and how Mollama reaches Ollama.'],
    'chat.send': ['Sending a message', 'The reply is written on this computer and keeps going if you leave the page. You can send another message while it is being written; it waits its turn.'],
    'chat.new': ['New chat', 'Starts an empty conversation. The earlier ones stay in the list on the left.'],
    'models.installed': ['Installed', 'The models already on this device, with their size on disk.'],
    'models.running': ['Running', 'Models loaded in memory right now. They unload by themselves after a few minutes.'],
    'models.mine': ['My models', 'An installed model with your own instructions built in, saved under its own name.'],
    'models.refresh': ['Refresh', 'Reads the model lists and the free disk space again, for example after a download finished elsewhere.'],
    'models.download': ['Download', 'The download runs on the server, so it carries on if you close this page. Its progress shows at the top.'],
    'devices.read': ['Read this computer again', 'Reads the hardware again, for example after a graphics card was changed.'],
    'devices.correct': ['Correct these details', 'Use this only when what Mollama reads is wrong. It changes which models are said to fit.']
};

const NO_ACTIVITY = { replies: [], downloads: [], finished: [], canManage: false };
const ActivityContext = createContext({ ...NO_ACTIVITY, refresh: async () => {}, stopReply: async () => {}, cancelDownload: async () => {} });
export const useActivity = () => useContext(ActivityContext);

export const ActivityProvider = ({ children }) => {
    const { user } = useAuth();
    const userId = user?.id || user?._id || null;
    const [activity, setActivity] = useState(NO_ACTIVITY);

    const refresh = useCallback(async () => {
        try {
            const result = await api.get('/activity');
            setActivity({
                replies: result.replies,
                downloads: result.downloads.filter((job) => job.status === 'queued' || job.status === 'downloading'),
                finished: result.downloads.filter((job) => job.status === 'completed' || job.status === 'failed'),
                canManage: Boolean(result.permissions?.manage)
            });
        } catch {
            return;
        }
    }, []);

    useEffect(() => {
        if (!userId) {
            setActivity(NO_ACTIVITY);
            return undefined;
        }
        refresh();
        const stopListening = appService.onNotification('activity:changed', refresh);
        const stopDownloads = appService.onNotification('download:finished', () => window.dispatchEvent(new CustomEvent('ollama-availability-changed')));
        const stopDevices = appService.onNotification('device:changed', () => {
            window.dispatchEvent(new CustomEvent('ollama-status-changed'));
            window.dispatchEvent(new CustomEvent('ollama-availability-changed'));
        });
        // A change made in any of this person's open apps reaches the pages here, which then reload what they show.
        const stopModels = appService.onNotification('models:changed', () => window.dispatchEvent(new CustomEvent('ollama-availability-changed')));
        const stopChats = appService.onNotification('chat:changed', (detail) => window.dispatchEvent(new CustomEvent('mollama-chat-changed', { detail: detail || {} })));
        const timer = setInterval(() => {
            if (!document.hidden) refresh();
        }, 60000);
        return () => {
            stopListening();
            stopDownloads();
            stopDevices();
            stopModels();
            stopChats();
            clearInterval(timer);
        };
    }, [userId, refresh]);

    // While something is running its progress is read every few seconds; otherwise once a minute is enough.
    const busy = activity.replies.length + activity.downloads.length > 0;
    useEffect(() => {
        if (!userId || !busy) return undefined;
        const timer = setInterval(() => {
            if (!document.hidden) refresh();
        }, 3000);
        return () => clearInterval(timer);
    }, [userId, busy, refresh]);

    const stopReply = useCallback(async (chatId) => {
        await api.post(`/chats/${chatId}/stop`, {}).catch(() => {});
        refresh();
    }, [refresh]);
    const cancelDownload = useCallback(async (id) => {
        await api.post('/models/downloads/cancel', { id, action: 'cancel' }).catch(() => {});
        refresh();
    }, [refresh]);

    return createElement(ActivityContext.Provider, { value: { ...activity, refresh, stopReply, cancelDownload } }, children);
};

const GUIDE_OFF = { on: false, seen: [], steps: [] };
const GuideContext = createContext({ ...GUIDE_OFF, setOn: async () => {}, tip: () => ({}) });
export const useGuide = () => useContext(GuideContext);

export const GuideProvider = ({ children }) => {
    const { user } = useAuth();
    const userId = user?.id || user?._id || null;
    const [guide, setGuide] = useState(GUIDE_OFF);
    const [showing, setShowing] = useState([]);

    useEffect(() => {
        if (!userId) {
            setGuide(GUIDE_OFF);
            return;
        }
        guideService.get().then((result) => setGuide(result.guide)).catch(() => setGuide(GUIDE_OFF));
    }, [userId]);

    const setOn = useCallback(async (on) => {
        setGuide((await guideService.set(on)).guide);
    }, []);

    const begin = (key) => {
        setShowing((now) => (now.includes(key) ? now : [...now, key]));
        if (guide.seen.includes(key)) return;
        setGuide((now) => ({ ...now, seen: [...now.seen, key] }));
        guideService.seen(key).then((result) => setGuide(result.guide)).catch(() => {});
    };
    const end = (key) => setShowing((now) => now.filter((item) => item !== key));

    const tip = (key, action = null) => {
        const known = GUIDE_TEXT[key];
        const due = guide.on && guide.steps.includes(key) && !guide.seen.includes(key);
        if (!known || (!due && !showing.includes(key))) return {};
        return {
            genie: {
                trigger: 'click',
                padding: 'none',
                backgroundColor: 'background',
                borderColor: 'tertiary',
                borderStyle: 'dotted',
                shadow: false,
                width: '250px',
                content: createElement(Container, { layout: 'flex-column', gap: 'xs', padding: 'sm', width: '100%' },
                    createElement(Typography, { size: 'xs', weight: 'semibold' }, known[0]),
                    createElement(Typography, { size: 'xs', color: 'muted' }, known[1]),
                    createElement(Container, { layout: 'flex', align: 'center', justify: 'between', gap: 'sm', padding: 'none', width: '100%', wrap: false },
                        createElement(Container, { layout: 'flex', align: 'center', gap: 'xs', padding: 'none', wrap: false },
                            createElement(Icon, { name: 'MdSupportAgent', size: 'xs', color: 'tertiary' }),
                            createElement(Typography, { size: 'xxs', color: 'tertiary' }, 'Helper')),
                        action ? createElement(Button, { size: 'xs', color: 'tertiary', onClick: action.run }, action.label) : null))
            },
            genieTrigger: 'click',
            onGenieShow: () => begin(key),
            onGenieHide: () => end(key)
        };
    };

    return createElement(GuideContext.Provider, { value: { ...guide, setOn, tip } }, children);
};

// The device the person chose to work on travels with every request; with none chosen the server picks.
const DEVICE_KEY = 'mollama-device';
const chosenDevice = () => {
    try {
        return localStorage.getItem(DEVICE_KEY) || '';
    } catch {
        return '';
    }
};
const deviceHeader = () => (chosenDevice() ? { 'X-Mollama-Device': chosenDevice() } : {});
api.interceptors.request.use((config) => {
    if (!config.headers['X-Mollama-Device']) Object.assign(config.headers, deviceHeader());
    return config;
});

// A read that several parts of a page ask for at the same moment is sent once. A few reads that are slow and change
// rarely are also kept for a short while, so opening a page again does not ask for them again. Anything that changes
// data forgets what was kept, so nothing shown is older than the last change made from here.
const KEPT_READS = [/\/skills$/, /\/tools\/catalogue$/, /\/providers$/, /\/prompts$/, /\/guide$/, /\/settings$/, /\/catalogue$/];
const KEEP_READ_MS = 30000;
const reads = new Map();
export const forgetReads = () => reads.clear();
const sendRequest = axios.getAdapter(api.defaults.adapter);
api.defaults.adapter = (config) => {
    if (String(config.method || 'get').toLowerCase() !== 'get') {
        forgetReads();
        return sendRequest(config);
    }
    if ((config.responseType && config.responseType !== 'json') || config.signal) return sendRequest(config);
    const key = [config.baseURL, config.url, JSON.stringify(config.params || {}), config.headers?.['X-Mollama-Device'] || ''].join(' ');
    const have = reads.get(key);
    // Each asker gets its own copy to work on.
    const mine = (entry) => entry.answer.then((response) => ({ ...response, config }));
    if (have && (have.pending || Date.now() - have.at < KEEP_READ_MS)) return mine(have);
    const entry = { pending: true, at: Date.now() };
    entry.answer = sendRequest(config).then((response) => {
        entry.pending = false;
        entry.at = Date.now();
        if (!KEPT_READS.some((address) => address.test(String(config.url).split('?')[0]))) reads.delete(key);
        return response;
    }, (error) => {
        reads.delete(key);
        throw error;
    });
    reads.set(key, entry);
    return mine(entry);
};

// Coming back to the window reloads a page, but not when it was loaded moments ago.
export const onReturn = (reload, gapMs = 20000) => {
    let last = Date.now();
    const back = () => {
        if (Date.now() - last < gapMs) return;
        last = Date.now();
        reload();
    };
    window.addEventListener('focus', back);
    return () => window.removeEventListener('focus', back);
};

// The Models page works on one computer at a time; its requests name that computer themselves.
let viewedDevice = null;
let chatDevice = null;
const onDevice = (id) => (id ? { headers: { 'X-Mollama-Device': id } } : {});
const onViewed = () => onDevice(viewedDevice);

export const providerService = {
    list: () => api.get('/providers'),
    add: (kind, key) => api.post('/providers', { kind, key }),
    check: (id) => api.post(`/providers/${id}/check`, {}),
    replaceKey: (id, key) => api.patch(`/providers/${id}`, { key }),
    remove: (id) => api.delete(`/providers/${id}`)
};

// Skills: the library every account has, and the ones a person added by address.
export const skillService = {
    list: () => api.get('/skills'),
    read: (id) => api.get(`/skills/${id}`),
    file: (id, path) => api.get(`/skills/${id}/file`, { params: { path } }),
    add: (address) => api.post('/skills', { address }),
    remove: (id) => api.delete(`/skills/${id}`)
};

export const toolService = {
    list: () => api.get('/tools/servers'),
    catalogue: () => api.get('/tools/catalogue'),
    add: (details) => api.post('/tools/servers', details),
    check: (id) => api.post(`/tools/servers/${id}/check`, {}),
    update: (id, changes) => api.patch(`/tools/servers/${id}`, changes),
    remove: (id) => api.delete(`/tools/servers/${id}`),
    signIn: (id) => api.post(`/tools/servers/${id}/sign-in`, {})
};

export const deviceService = {
    listDevices: () => api.get('/devices'),
    pools: () => api.get('/devices/pools'),
    setPoolRole: (id, role) => api.put(`/devices/${id}/pool`, { role }),
    // The computers plus the online services a person has connected, for choosing where a chat's model runs.
    listPickable: () => api.get('/devices?with=online'),
    linkDevice: (details) => api.post('/devices/link', details),
    removeDevice: (id) => api.delete(`/devices/${id}`),
    pauseDevice: (id) => api.post(`/devices/${id}/pause`, {}),
    resumeDevice: (id) => api.post(`/devices/${id}/resume`, {}),
    // A computer that can chat right now: connected, not paused, Ollama running and at least one model on it that can chat.
    ready: (device) => Boolean(device?.online && !device.paused && device.ollama?.available && (device.ollama.chatCount ?? device.ollama.modelCount) > 0),
    chosen: chosenDevice,
    choose(id) {
        try {
            if (id) localStorage.setItem(DEVICE_KEY, id);
            else localStorage.removeItem(DEVICE_KEY);
        } catch { /* storage unavailable: the server picks */ }
        window.dispatchEvent(new CustomEvent('ollama-status-changed'));
        window.dispatchEvent(new CustomEvent('ollama-availability-changed'));
    },
    updateDevice: (id, changes) => api.put(`/devices/${id}`, changes),
    detectDevice: (id) => api.post(`/devices/${id}/detect`, {}),

    getSettings: () => api.get('/settings'),
    updateSettings: (changes) => api.put('/settings', changes),
    testConnection: (ollamaBaseUrl) => api.post('/settings/test-connection', { ollamaBaseUrl }),

    getSetupStatus: () => api.get('/setup/status')
};

// The desktop app's installers are published as releases of a public repository; this reads which ones exist.
const INSTALLERS = 'mkrspc-one/mollama-installers';
let shownRelease = null;
// What the pickers showed last, kept so they can be drawn at once and corrected when the fresh answer arrives.
const readKept = (key, fallback) => {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
};
const keep = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        return;
    }
};
// Kept per account, so one person never sees another's computers or models on a shared browser.
let pickerOwner = null;
let keptModels = new Map();
const PICKER_KEYS = ['mollama-picker-devices', 'mollama-picker-models', 'mollama-picker-choice'];
export const pickerMemory = {
    as(userId) {
        const owner = userId ? String(userId) : null;
        if (owner === pickerOwner) return;
        pickerOwner = owner;
        try {
            if (localStorage.getItem('mollama-picker-owner') !== owner) {
                PICKER_KEYS.forEach((key) => localStorage.removeItem(key));
                if (owner) localStorage.setItem('mollama-picker-owner', owner);
                else localStorage.removeItem('mollama-picker-owner');
            }
        } catch {
            keptModels = new Map();
            return;
        }
        keptModels = new Map(Object.entries(readKept('mollama-picker-models', {})));
    },
    devices: () => (pickerOwner ? readKept('mollama-picker-devices', { devices: [], current: null }) : { devices: [], current: null }),
    keepDevices(devices, current) {
        if (!pickerOwner) return;
        keep('mollama-picker-devices', {
            current: current || null,
            devices: devices.map(({ id, name, kind, online, paused, ollama }) => ({ id, name, kind, online, paused, ollama: { available: Boolean(ollama?.available), modelCount: ollama?.modelCount || 0, chatCount: ollama?.chatCount ?? ollama?.modelCount ?? 0 } }))
        });
    },
    models: (deviceId) => keptModels.get(String(deviceId || 'default')) || null,
    // The model last used on a computer, so a new chat names it at once.
    choice: (deviceId) => (pickerOwner ? readKept('mollama-picker-choice', {})[String(deviceId || 'default')] || null : null),
    keepChoice(deviceId, model) {
        if (!pickerOwner || !model) return;
        keep('mollama-picker-choice', { ...readKept('mollama-picker-choice', {}), [String(deviceId || 'default')]: model });
    },
    keepModels(deviceId, models) {
        if (!pickerOwner) return;
        keptModels = new Map(Object.entries(readKept('mollama-picker-models', {})));
        keptModels.set(String(deviceId || 'default'), models.map(({ name, displayName, fit, ready, canChat, capabilities }) => ({ name, displayName, fit, ready, canChat, capabilities })));
        keep('mollama-picker-models', Object.fromEntries(keptModels));
    }
};

export const desktopService = {
    systems: [
        { id: 'windows', label: 'Windows', icon: 'FaWindows', ending: '-Setup.exe' },
        { id: 'mac', label: 'macOS', icon: 'FaApple', ending: '.dmg' },
        { id: 'linux', label: 'Linux', icon: 'FaLinux', ending: '.AppImage' }
    ],
    // Each site offers the build that opens it: the staging site the staging app, every other address the released app.
    channels() {
        return window.location.hostname.startsWith('staging.')
            ? [{ id: 'staging', name: 'Mollama-Staging', title: 'Mollama Staging', opens: 'Opens staging.mollama.one, for testing' }]
            : [{ id: 'production', name: 'Mollama', title: 'Mollama', opens: 'Opens www.mollama.one' }];
    },
    // The download links point at the release published() found, or at the latest full release before it has answered.
    address: (file) => `https://github.com/${INSTALLERS}/releases/${shownRelease ? `download/${shownRelease}` : 'latest/download'}/${file}`,
    // The live site follows the latest full release. Everywhere else (staging, a computer's own copy) also offers
    // previews (pre-releases), since that is where they are tried.
    async published() {
        try {
            const previews = !/^(www\.)?mollama\.one$/.test(window.location.hostname);
            const reply = await fetch(`https://api.github.com/repos/${INSTALLERS}/releases${previews ? '?per_page=10' : '/latest'}`);
            if (!reply.ok) return { version: null, files: ['Mollama-Setup.exe', 'Mollama-Staging-Setup.exe'] };
            const answer = await reply.json();
            const release = previews ? (Array.isArray(answer) ? answer : []).find((one) => !one.draft) || {} : answer;
            shownRelease = release.tag_name || null;
            return { version: String(release.tag_name || '').replace(/^v/, '') || null, files: (release.assets || []).map((asset) => asset.name) };
        } catch {
            return { version: null, files: ['Mollama-Setup.exe', 'Mollama-Staging-Setup.exe'] };
        }
    }
};

// Inside the desktop app, signing in links this computer to the account and signing out unlinks it.
export const useDeviceLink = () => {
    const { user, isLoading, logout } = useAuth();
    const { warning } = useNotification();
    const userId = user?.id || user?._id || null;

    useEffect(() => {
        const desktop = window.desktop;
        if (!desktop?.link || isLoading) return undefined;
        let cancelled = false;
        let busy = false;
        const sync = async () => {
            if (busy || cancelled) return;
            busy = true;
            try {
                const state = await desktop.deviceState();
                if (!userId) {
                    if (state?.deviceId && state.user && sessionStorage.getItem('mollama-signed-in')) await desktop.unlink();
                    sessionStorage.removeItem('mollama-signed-in');
                    return;
                }
                sessionStorage.setItem('mollama-signed-in', '1');
                const { devices } = await api.get('/devices');
                const mine = Boolean(state?.deviceId) && state.user === String(userId);
                if (mine && devices.some((device) => device.id === state.deviceId)) return;
                // This computer was linked for this person and is no longer on their account: it was removed from another
                // device, so it signs out here instead of quietly adding itself back.
                if (mine) {
                    await desktop.unlink();
                    sessionStorage.removeItem('mollama-signed-in');
                    warning('This computer was removed from your account, so it has been signed out. Sign in again to add it back.', { duration: 10000 });
                    await logout();
                    return;
                }
                const { computerName, ...hardware } = await desktop.hardware();
                const linked = await api.post('/devices/link', { hostname: hardware.hostname, ...(computerName ? { name: String(computerName).slice(0, 80) } : {}), hardware });
                if (cancelled) return;
                const socketUrl = `${import.meta.env.VITE_WS_BASE_URL || API_BASE_URL.replace(/^http/, 'ws').replace(/[/]api[/]v1[/]?$/, '')}/devices`;
                await desktop.link({ deviceId: linked.device.id, key: linked.key, user: String(userId), socketUrl });
            } catch {
                return;
            } finally {
                busy = false;
            }
        };
        sync();
        // A removal made on another device is noticed here without waiting for the app to be reopened.
        const timer = userId ? setInterval(sync, 30000) : null;
        window.addEventListener('focus', sync);
        return () => {
            cancelled = true;
            if (timer) clearInterval(timer);
            window.removeEventListener('focus', sync);
        };
    }, [userId, isLoading]);
};

export const describeError = (error, fallback = 'Something went wrong. Please try again.') => {
    const data = error?.response?.data;
    if (data?.action) return `${data.message} ${data.action}`;
    return data?.message || fallback;
};

export const modelService = {
    view(deviceId) {
        viewedDevice = deviceId || null;
    },
    installedOn: (deviceId) => api.get('/models', onDevice(deviceId)),

    listInstalled: () => api.get('/models', onViewed()),
    listRunning: () => api.get('/models/running', onViewed()),
    // A removal or download names the computer the person confirmed; the server refuses one that names none.
    deleteModel: (name, deviceId) => api.post('/models/delete', { name }, onDevice(deviceId)),
    unloadModel: (name) => api.post('/models/unload', { name }, onViewed()),
    loadModel: (name) => api.post('/models/load', name ? { name } : {}, onDevice(chatDevice)),
    createModel: (request) => api.post('/models/create', request, onViewed()),
    updateModel: (request) => api.post('/models/update', request, onViewed()),

    getDeviceCatalogue: (deviceId, query = {}) => api.get(`/devices/${deviceId}/catalogue`, { params: query }),
    // A server that is one version behind does not know "sample" yet; it is then asked the older way and the page trims the list itself.
    getPublicCatalogue: (memoryMb, gpuMemoryMb, shared = false) => api.get('/catalogue', { params: { memoryMb, gpuMemoryMb, sample: true, ...(shared ? { shared: true } : {}) } })
        .catch((error) => (error?.response?.status === 400 ? api.get('/catalogue', { params: { memoryMb, gpuMemoryMb } }) : Promise.reject(error))),

    startDownload: (name, deviceId) => api.post('/models/pull', { name }, onDevice(deviceId)),
    listDownloads: () => api.get('/models/downloads', onViewed()),
    pauseDownload: (id) => api.post('/models/downloads/cancel', { id, action: 'pause' }, onViewed()),
    cancelDownload: (id) => api.post('/models/downloads/cancel', { id, action: 'cancel' }, onViewed()),

    watchDownloads({ onSnapshot, onProgress, onError }) {
        const watched = viewedDevice || chosenDevice();
        const source = new EventSource(`${API_BASE_URL}/models/downloads/stream${watched ? `?device=${watched}` : ''}`, { withCredentials: true });
        source.addEventListener('snapshot', (event) => onSnapshot(JSON.parse(event.data)));
        source.addEventListener('progress', (event) => {
            const job = JSON.parse(event.data);
            // A download that has finished changes which models are installed, which the kept list says too.
            if (job.status === 'completed' || job.status === 'cancelled') forgetReads();
            onProgress(job);
        });
        source.onerror = () => onError?.();
        return () => source.close();
    }
};

const cleanGraphicsName = (raw) => {
    if (!raw) return null;
    const angle = String(raw).match(/^ANGLE \([^,]+,\s*(.+?)(?:\s+\(0x[0-9a-f]+\))?(?:\s+Direct3D.*|\s+OpenGL.*|\s+Metal.*|\s+Vulkan.*)?,/i);
    const name = (angle ? angle[1] : String(raw)).replace(/\s+\(0x[0-9a-f]+\)/i, '').trim();
    return /swiftshader|llvmpipe|software/i.test(name) ? null : name;
};

const readGraphicsName = () => {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return null;
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return cleanGraphicsName(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    } catch {
        return null;
    }
};

export const readBrowserDevice = () => ({
    graphicsName: readGraphicsName(),
    memoryGb: navigator.deviceMemory || null,
    processorThreads: navigator.hardwareConcurrency || null,
    system: navigator.userAgentData?.platform || navigator.platform || null
});

export const formatGb = (megabytes, digits = 0) => {
    if (megabytes === null || megabytes === undefined) return 'Unknown';
    return `${(megabytes / 1024).toFixed(digits)} GB`;
};

const csrfToken = async () => document.cookie.match(/(?:^|; )csrfToken=([^;]+)/)?.[1] || refreshCsrfToken();

const readEvents = async (response, onEvent) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (line.trim()) onEvent(JSON.parse(line));
        }
    }
};

export const chatService = {
    // The computer the open chat runs on; warming up a model goes to the same one.
    on(deviceId) {
        chatDevice = deviceId || null;
    },
    list: (search) => api.get('/chats', { params: search ? { search } : {} }),
    skills: () => api.get('/skills'),
    create: (body = {}) => api.post('/chats', body),
    get: (id) => api.get(`/chats/${id}`),
    update: (id, changes) => api.patch(`/chats/${id}`, changes),
    remove: (id) => api.delete(`/chats/${id}`),
    summarise: (id) => api.post(`/chats/${id}/summary`, {}, { timeout: 0 }),
    exportChat: (id, format) => api.get(`/chats/${id}/export`, { params: { format } }),

    attachUpload: (id, file) => api.post(`/chats/${id}/attachments`, file, {
        params: { name: file.name },
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 120000
    }),
    attachFile: (id, path) => api.post(`/chats/${id}/attachments`, { path }, { timeout: 120000 }),
    removeAttachment: (id, attachmentId) => api.delete(`/chats/${id}/attachments/${attachmentId}`),

    stop: (id) => api.post(`/chats/${id}/stop`, {}),
    answerPermission: (id, question, answer) => api.post(`/chats/${id}/permission`, { id: question, answer }),
    // What a reply in progress has sent so far, with the number of its latest piece.
    live: (id) => api.get(`/chats/${id}/live`),

    async rejoin(id, { onEvent, signal }) {
        const response = await fetch(`${API_BASE_URL}/chats/${id}/reply`, { credentials: 'include', signal, headers: deviceHeader() });
        if (response.status !== 200) return false;
        await readEvents(response, onEvent);
        return true;
    },

    async send(id, body, { onEvent, signal }) {
        const attempt = async () => fetch(`${API_BASE_URL}/chats/${id}/messages`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrfToken(), ...deviceHeader() },
            body: JSON.stringify(body),
            signal
        });

        let response = await attempt();
        if (response.status === 401) {
            await api.get('/chats');
            response = await attempt();
        }
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw Object.assign(new Error(data.message || 'The message could not be sent.'), { response: { data, status: response.status } });
        }

        if (response.status === 202) return response.json();
        await readEvents(response, onEvent);
        return null;
    }
};

export const promptService = {
    list: () => api.get('/prompts'),
    create: (prompt) => api.post('/prompts', prompt),
    update: (id, changes) => api.patch(`/prompts/${id}`, changes),
    remove: (id) => api.delete(`/prompts/${id}`)
};

export const fileService = {
    // FilesystemOne may be waking up, which can take over a minute, so these wait longer than other requests.
    browse: (path = '/') => api.get('/files/browse', { params: { path }, timeout: 120000 }),
    text: (path, model) => api.get('/files/text', { params: model ? { path, model } : { path }, timeout: 120000 }),
    save: (folder, name, content) => api.post('/files/save', { folder, name, content }, { timeout: 120000 }),
    saveAddress: (folder, name, url) => api.post('/files/save-address', { folder, name, url }, { timeout: 180000 }),
    remote: (url) => api.get('/files/remote', { params: { url }, responseType: 'blob', timeout: 120000 })
};

export const downloadText = (fileName, content) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};
