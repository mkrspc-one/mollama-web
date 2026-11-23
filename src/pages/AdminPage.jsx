import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useNotification } from '@contexts/NotificationContext';
import { appService } from '@/client/app.client';
import { cacheService } from '@/client/cache.client';
import { userService } from '@/client/user.client';
import { authService } from '@/client/auth.client';
import {
    Page, Container, Card, Button, Typography, Icon, Input, Badge,
    CircularProgress, Select, Switch, Divider, PageLoading, LoadingText, ProgressBar, Data,
    ButtonGroup
} from '@components/Components';

// ─── Edit User Form ───────────────────────────────────────────────────────────

const EditUserForm = ({ user, onSave, onCancel }) => {
    const { success: showSuccess, error: showError } = useNotification();
    const [formData, setFormData] = useState({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        email: user.email || '',
        profilePhoto: user.profilePhoto || '',
        roles: Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : ['USER']),
        active: user.active !== false
    });
    const [isSaving, setIsSaving] = useState(false);

    const set = (field, value) => setFormData(p => ({ ...p, [field]: value }));

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await userService.updateUser(user._id || user.id, formData);
            showSuccess('User updated successfully');
            onSave?.();
        } catch {
            showError('Failed to update user');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Container layout="flex-column" gap="md" padding="sm" width="min(440px, 80vw)">
            <Typography as="h3" size="md" weight="semibold" font="secondary">Edit {user.firstName} {user.lastName}</Typography>
            <Container layout="grid" columns={2} gap="md" padding="none" width="100%">
                <Input size="sm" label="First name" value={formData.firstName} onChange={e => set('firstName', e.target.value)} width="100%" />
                <Input size="sm" label="Last name" value={formData.lastName} onChange={e => set('lastName', e.target.value)} width="100%" />
            </Container>
            <Input size="sm" label="Username" value={formData.username} onChange={e => set('username', e.target.value)} width="100%" />
            <Input size="sm" label="Email" type="email" value={formData.email} onChange={e => set('email', e.target.value)} width="100%" />
            <Input size="sm" label="Profile photo address" value={formData.profilePhoto} onChange={e => set('profilePhoto', e.target.value)} width="100%" />
            <Divider />
            <Select
                size="sm"
                label="Roles"
                multiSelect
                value={formData.roles}
                onChange={val => set('roles', val)}
                width="100%"
                options={[
                    { value: 'USER', label: 'User' },
                    { value: 'CREATOR', label: 'Creator' },
                    { value: 'SUPER_CREATOR', label: 'Super creator' },
                    { value: 'ADMIN', label: 'Admin' },
                    { value: 'OWNER', label: 'Owner' }
                ]}
            />
            <Container layout="flex" align="center" gap="sm" padding="none" width="100%">
                <Switch checked={formData.active} onChange={(change) => set('active', typeof change === 'boolean' ? change : Boolean(change?.target?.checked))} size="sm" />
                <Typography size="xs">Active account</Typography>
            </Container>
            <Container layout="grid" columns={2} gap="md" padding="none" width="100%">
                <Container layout="flex-column" gap="none" padding="none">
                    <Typography as="p" size="xxs" color="muted">Created</Typography>
                    <Typography as="p" size="xs">{new Date(user.createdAt).toLocaleString()}</Typography>
                </Container>
                {user.updatedAt && (
                    <Container layout="flex-column" gap="none" padding="none">
                        <Typography as="p" size="xxs" color="muted">Last updated</Typography>
                        <Typography as="p" size="xs">{new Date(user.updatedAt).toLocaleString()}</Typography>
                    </Container>
                )}
            </Container>
            <ButtonGroup size="sm" spaced selectable={false} justify="end" width="100%">
                <Button onClick={onCancel} disabled={isSaving}>Cancel</Button>
                <Button color="secondary" variant="solid" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <><CircularProgress size="xs" /> Saving…</> : 'Save changes'}
                </Button>
            </ButtonGroup>
        </Container>
    );
};

// ─── Shared presentation helpers ──────────────────────────────────────────────

const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatUptime = (seconds = 0) =>
    `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;

const sentenceCase = (text) => {
    const words = String(text ?? '').replace(/_/g, ' ').toLowerCase();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : '—';
};

// One fact under a hairline: its name on the left, its value on the right. A value that carries a state is a Badge.
const MetricRow = ({ label, value, status = null, badge = null }) => (
    <>
        <Divider />
        <Container layout="flex" justify="between" align="center" gap="md" padding="none" width="100%" wrap={false}>
            <Typography size="xs" color="muted">{label}</Typography>
            {badge || (status
                ? <Badge size="xs" color={status}>{value}</Badge>
                : <Typography size="sm" weight="medium" align="right">{value}</Typography>)}
        </Container>
    </>
);

const Facts = ({ title, actions, children }) => (
    <Container layout="flex-column" gap="none" padding="none" width="100%" minWidth="0">
        <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%" minHeight="34px" wrap={false}>
            <Typography as="h3" size="sm" weight="semibold">{title}</Typography>
            {actions}
        </Container>
        {children}
    </Container>
);

const FACT_COLUMNS = 4;

const SectionHeader = ({ title, description, actions }) => (
    <Container layout="flex" justify="between" align="center" padding="none" width="100%" gap="md">
        <Container layout="flex-column" gap="xs" padding="none" minWidth="0">
            <Typography as="h2" size="md" weight="semibold" font="secondary">{title}</Typography>
            {description && <Typography as="p" size="xxs" color="muted">{description}</Typography>}
        </Container>
        {actions && <Container layout="flex" align="center" gap="sm" padding="none">{actions}</Container>}
    </Container>
);

// The one pattern for a state: an icon, what it is, one line on what to do, and one button passed as children.
const State = ({ icon, color = 'primary', title, message, page = false, children }) => (
    <Container layout="flex-column" align="center" gap="sm" padding="xl" width="100%" maxWidth={page ? '420px' : null}>
        <Icon name={icon} size={page ? 'lg' : 'md'} color={color} />
        <Typography as={page ? 'h1' : 'p'} size={page ? 'lg' : 'sm'} weight="semibold" font={page ? 'secondary' : 'primary'} align="center">{title}</Typography>
        {message && <Typography as="p" size="xs" color="muted" align="center">{message}</Typography>}
        {children}
    </Container>
);

// ─── Admin Page ───────────────────────────────────────────────────────────────

// Approving or rejecting a role request, each confirmed in place: approving names the role being given, rejecting
// takes an optional reason, and going back changes nothing.
const RoleRequestActions = ({ item, onApprove, onReject }) => {
    const [step, setStep] = useState('choose');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const role = Array.isArray(item.pendingRoles) ? item.pendingRoles[0] : item.pendingRoles;
    const act = async (work) => {
        setBusy(true);
        try {
            await work();
        } finally {
            setBusy(false);
        }
    };
    if (step === 'approve') {
        return (
            <Container layout="flex-column" gap="sm" padding="xs" width="260px">
                <Typography as="p" size="xs">{`Give ${item.username} the ${sentenceCase(role)} role?`}</Typography>
                <Container layout="flex" gap="xs" padding="none">
                    <Button size="sm" color="secondary" variant="solid" disabled={busy} onClick={() => act(() => onApprove(item))}><Icon name="FiCheck" />Give role</Button>
                    <Button size="sm" disabled={busy} onClick={() => setStep('choose')}>Back</Button>
                </Container>
            </Container>
        );
    }
    if (step === 'reject') {
        return (
            <Container layout="flex-column" gap="sm" padding="xs" width="260px">
                <Input size="sm" label="Reason (optional)" value={reason} onChange={(event) => setReason(event.target.value)} width="100%" />
                <Container layout="flex" gap="xs" padding="none">
                    <Button size="sm" color="error" variant="solid" disabled={busy} onClick={() => act(() => onReject(item, reason.trim()))}><Icon name="FiX" />Reject request</Button>
                    <Button size="sm" disabled={busy} onClick={() => setStep('choose')}>Back</Button>
                </Container>
            </Container>
        );
    }
    return (
        <Container layout="flex-column" gap="xs" padding="xs" width="260px">
            <Typography as="p" size="xxs" color="muted">{`${item.username} asks for the ${sentenceCase(role)} role`}</Typography>
            <Button size="sm" align="start" width="100%" onClick={() => setStep('approve')}><Icon name="FiCheck" />Approve</Button>
            <Button size="sm" color="error" align="start" width="100%" onClick={() => setStep('reject')}><Icon name="FiX" />Reject</Button>
        </Container>
    );
};

const AdminPage = () => {
    const navigate = useNavigate();
    const { hasRole } = useAuth();
    const { success: showSuccess, error: showError, info: showInfo } = useNotification();

    const hasAdminAccess = hasRole('ADMIN') || hasRole('OWNER');
    const hasOwnerAccess = hasRole('OWNER');

    const [adminData, setAdminData] = useState({
        health: null,
        cache: null,
        logs: null,
        logStats: null,
        users: null,
        userStats: null,
        files: null,
        appStats: null,
        roleRequests: null,
        errors: []
    });

    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeSection, setActiveSection] = useState('overview');
    const [sectionLoading, setSectionLoading] = useState({});
    const sectionDataCache = useRef({});
    const sectionCacheTimeout = useRef({});

    const [clearingCache, setClearingCache] = useState(false);
    const [cacheRefreshed, setCacheRefreshed] = useState(false);
    const [cleanupInfo, setCleanupInfo] = useState(null);
    const [loadingCleanup, setLoadingCleanup] = useState(false);
    const [runningCleanup, setRunningCleanup] = useState(false);

    const [emailTest, setEmailTest] = useState({
        isLoading: false,
        recipient: '',
        template: 'welcome',
        subject: 'Test Email'
    });


    const sections = [
        { id: 'overview', label: 'Overview', icon: 'FiActivity', desc: 'How the server, its memory and its database are doing.' },
        { id: 'cache', label: 'Cache', icon: 'FiDatabase', desc: 'Redis figures, the cleanup service and clearing the cache.' },
        { id: 'users', label: 'Users', icon: 'FiUsers', desc: 'Accounts, roles and activity. Right-click a row to edit the account.' },
        { id: 'logs', label: 'Logs', icon: 'FiFileText', desc: 'Requests, warnings and errors the server recorded.' },
        { id: 'email', label: 'Email', icon: 'FiMail', desc: 'Send a test message from a template to check that email delivery works.' },
        { id: 'appstats', label: 'App stats', icon: 'FiBarChart2', desc: 'Counts for the whole app, its services and recent activity.' },
        ...(hasOwnerAccess ? [{ id: 'role-requests', label: 'Role requests', icon: 'FiUserCheck', desc: 'Right-click a pending request to approve or reject it.' }] : [])
    ];

    const loadSectionData = useCallback(async (section, forceRefresh = false) => {
        if (sectionLoading[section] && !forceRefresh) return;
        const cacheKey = section;
        const cached = sectionDataCache.current[cacheKey];
        const cacheValid = cached && !forceRefresh && (Date.now() - (sectionCacheTimeout.current[cacheKey] || 0)) < 30000;
        if (cacheValid) return;
        setSectionLoading(prev => ({ ...prev, [section]: true }));
        if (forceRefresh) setRefreshing(true);
        try {
            let data = {};
            switch (section) {
                case 'overview':
                case 'appstats': {
                    const [health, overviewStats] = await Promise.all([
                        appService.getHealth(),
                        appService.getOverviewStats()
                    ]);
                    data = { health, appStats: overviewStats.statistics };
                    break;
                }
                case 'cache': {
                    const cacheStats = await cacheService.getStats();
                    data = { cache: cacheStats.cacheStats };
                    break;
                }
                case 'users': {
                    const [userStatsData, userListData] = await Promise.all([
                        userService.getStats(),
                        userService.getUsers({ limit: 50 })
                    ]);
                    data = {
                        users: userListData.users,
                        userStats: userStatsData.overview
                    };
                    break;
                }
                case 'logs': {
                    const [logsData, logStatsData] = await Promise.all([
                        appService.getLogs({}),
                        appService.getLogStats()
                    ]);
                    data = {
                        logs: logsData.logs,
                        logStats: logStatsData.stats
                    };
                    break;
                }
                case 'role-requests': {
                    if (hasOwnerAccess) {
                        const response = await authService.getPendingRoleRequests();
                        data = { roleRequests: response.pendingRequests };
                    }
                    break;
                }
                case 'email':
                    return;
                default:
                    return;
            }
            setAdminData(prev => ({ ...prev, ...data }));
            sectionDataCache.current[cacheKey] = data;
            sectionCacheTimeout.current[cacheKey] = Date.now();
            if (forceRefresh) showSuccess(`${section.charAt(0).toUpperCase() + section.slice(1)} data refreshed`);
        } catch {
            showError(`Failed to load ${section} data`);
        } finally {
            setSectionLoading(prev => ({ ...prev, [section]: false }));
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [showError, showSuccess, hasOwnerAccess]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!hasAdminAccess) { setIsLoading(false); return; }
        loadSectionData(activeSection);
    }, [hasAdminAccess, activeSection, loadSectionData]);

    useEffect(() => {
        return () => {
            sectionDataCache.current = {};
            sectionCacheTimeout.current = {};
        };
    }, []);

    const handleClearCache = async () => {
        setClearingCache(true);
        try {
            await cacheService.clearCache();
            showSuccess('Cache cleared successfully');
            if (activeSection === 'cache') await loadSectionData('cache', true);
            setCacheRefreshed(true);
            setTimeout(() => setCacheRefreshed(false), 3000);
        } catch { showError('Failed to clear cache'); }
        finally { setClearingCache(false); }
    };

    const handleGetCleanupInfo = async () => {
        setLoadingCleanup(true);
        try {
            const result = await cacheService.getCleanupStatus();
            setCleanupInfo(result.cleanup);
            showInfo('Cache cleanup information retrieved');
        } catch { showError('Failed to get cache cleanup information'); }
        finally { setLoadingCleanup(false); }
    };

    const handleRunCleanup = async () => {
        setRunningCleanup(true);
        try {
            const result = await cacheService.triggerCleanup();
            showSuccess(`Cache cleanup finished. ${result.cleanup?.keysRemoved || 0} keys removed.`);
            await handleGetCleanupInfo();
        } catch { showError('Failed to run cache cleanup'); }
        finally { setRunningCleanup(false); }
    };

    const handleSendTestEmail = async () => {
        if (!emailTest.recipient) { showError('Please enter a recipient email'); return; }
        setEmailTest(prev => ({ ...prev, isLoading: true }));
        try {
            await appService.sendTestEmail({
                to: emailTest.recipient,
                template: emailTest.template,
                subject: emailTest.subject,
                templateData: { firstName: 'Test', lastName: 'User', appName: 'Mollama' }
            });
            showSuccess(`Test email sent to ${emailTest.recipient}`);
            setEmailTest(prev => ({ ...prev, recipient: '' }));
        } catch { showError('Failed to send test email'); }
        finally { setEmailTest(prev => ({ ...prev, isLoading: false })); }
    };

    if (!hasAdminAccess) {
        return (
            <Page layout="flex" align="center" justify="center" background="dots" backgroundFade="bottom">
                <State page icon="FiLock" color="error" title="Access denied" message="You need the Admin or Owner role to open this page.">
                    <Button size="sm" onClick={() => navigate('/chat')}><Icon name="FiMessageSquare" />Open Chat</Button>
                </State>
            </Page>
        );
    }

    if (isLoading) {
        return <PageLoading message="Loading Admin" />;
    }

    const section = sections.find((item) => item.id === activeSection) || sections[0];
    const healthy = adminData.health?.status === 'ok';
    const refreshButton = (
        <Button size="sm" onClick={() => loadSectionData(activeSection, true)} disabled={refreshing}>
            <Icon name="FiRefreshCw" />{refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
    );
    const toolbars = {
        cache: (
            <>
                {refreshButton}
                <Button size="sm" onClick={handleGetCleanupInfo} disabled={loadingCleanup}>
                    <Icon name="FiInfo" />{loadingCleanup ? 'Loading…' : 'Show cleanup status'}
                </Button>
                <Button size="sm" onClick={handleRunCleanup} disabled={runningCleanup || loadingCleanup}>
                    <Icon name="FiPlay" />{runningCleanup ? 'Running…' : 'Run cleanup'}
                </Button>
                <Button size="sm" color="error" onClick={handleClearCache} disabled={clearingCache}>
                    <Icon name="FiTrash2" />{clearingCache ? 'Clearing…' : 'Clear cache'}
                </Button>
            </>
        ),
        email: null
    };

    return (
        <Page
            title="Admin"
            lead="Check the server, the cache, accounts, logs and email."
            gap="xl"
            background="dots"
            backgroundFade="bottom"
            actions={
                <>
                    {adminData.health?.timestamp && (
                        <Typography size="xxs" color="muted">{`Checked ${new Date(adminData.health.timestamp).toLocaleTimeString()}`}</Typography>
                    )}
                    <Badge size="sm" color={healthy ? 'success' : 'error'}>{healthy ? 'System healthy' : 'System issues'}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => navigate('/chat')}>
                        <Icon name="FiMessageSquare" />Open Chat
                    </Button>
                </>
            }
        >
            <ButtonGroup size="sm" selectable={false} justify="start">
                {sections.map((item) => (
                    <Button key={item.id} selected={activeSection === item.id} aria-pressed={activeSection === item.id} onClick={() => setActiveSection(item.id)}>
                        <Icon name={item.icon} />{item.label}
                    </Button>
                ))}
            </ButtonGroup>

            {adminData.errors.length > 0 && (
                <Card layout="flex-column" gap="xs" padding="md" width="100%">
                    <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                        <Icon name="FiAlertTriangle" size="sm" color="error" />
                        <Typography as="p" size="sm" weight="semibold">Some data did not load</Typography>
                    </Container>
                    {adminData.errors.map((err, i) => <Typography key={i} as="p" size="xs" color="muted">{err}</Typography>)}
                </Card>
            )}

            <Container layout="flex-column" gap="lg" padding="none" width="100%">
                <SectionHeader
                    title={section.label}
                    description={section.desc}
                    actions={section.id in toolbars ? toolbars[section.id] : refreshButton}
                />

                {sectionLoading[activeSection] && (
                    <Container layout="flex" align="center" justify="center" padding="xl" width="100%">
                        <LoadingText>{`Loading ${section.label.toLowerCase()}`}</LoadingText>
                    </Container>
                )}

                {activeSection === 'overview' && !sectionLoading.overview && (
                    <Container layout="grid" columns={FACT_COLUMNS} gap="xl" padding="none" width="100%">
                        <Facts title="Memory">
                            {adminData.health?.system?.memoryUsage ? (() => {
                                const mem = adminData.health.system.memoryUsage;
                                const pct = mem.heapUsed / mem.heapTotal;
                                return (
                                    <>
                                        <MetricRow label="Heap in use" value={`${(pct * 100).toFixed(0)}%`} status={pct > 0.8 ? 'error' : pct > 0.6 ? 'warning' : null} />
                                        <ProgressBar value={mem.heapUsed} max={mem.heapTotal} color={pct > 0.8 ? 'error' : pct > 0.6 ? 'warning' : 'primary'} size="xs" width="100%" marginBottom="sm" />
                                        <MetricRow label="Heap used" value={`${(mem.heapUsed / 1048576).toFixed(1)} MB`} />
                                        <MetricRow label="Heap total" value={`${(mem.heapTotal / 1048576).toFixed(1)} MB`} />
                                        <MetricRow label="Resident memory (RSS)" value={`${(mem.rss / 1048576).toFixed(1)} MB`} />
                                        <MetricRow label="External memory" value={`${(mem.external / 1048576).toFixed(1)} MB`} />
                                    </>
                                );
                            })() : <Typography as="p" size="xs" color="muted">Memory figures are not available. Refresh to read them again.</Typography>}
                        </Facts>
                        <Facts title="System">
                            {adminData.health?.system ? (
                                <>
                                    <MetricRow label="Platform" value={`${adminData.health.system.platform} (${adminData.health.system.arch})`} />
                                    <MetricRow label="Node.js" value={adminData.health.system.nodeVersion} />
                                    <MetricRow label="Uptime" value={formatUptime(adminData.health.system.uptime)} />
                                    <MetricRow label="Environment" value={adminData.health?.env || '—'} />
                                </>
                            ) : <Typography as="p" size="xs" color="muted">System figures are not available. Refresh to read them again.</Typography>}
                        </Facts>
                        <Facts title="Database">
                            {adminData.health?.database ? (
                                <>
                                    <MetricRow label="Status" badge={
                                        <Badge size="xs" color={adminData.health.database.status === 'connected' ? 'success' : 'error'}>
                                            {sentenceCase(adminData.health.database.status)}
                                        </Badge>} />
                                    <MetricRow label="Connection" value={adminData.health.database.connection} />
                                    <MetricRow label="Latency" value={`${adminData.health.database.latencyMs} ms`} />
                                </>
                            ) : <Typography as="p" size="xs" color="muted">Database figures are not available. Refresh to read them again.</Typography>}
                        </Facts>
                    </Container>
                )}

                {activeSection === 'cache' && !sectionLoading.cache && (
                    (cleanupInfo || adminData.cache) ? (
                        <Container layout="grid" columns={FACT_COLUMNS} gap="xl" padding="none" width="100%">
                            {cleanupInfo && (
                                <Facts
                                    title="Cleanup service"
                                    actions={
                                        <Button size="xs" variant="ghost" onClick={() => setCleanupInfo(null)}>
                                            <Icon name="FiX" />Close
                                        </Button>
                                    }
                                >
                                    <MetricRow label="Service" badge={<Badge size="xs" color={cleanupInfo.enabled ? 'success' : 'warning'}>{cleanupInfo.enabled ? 'Active' : 'Disabled'}</Badge>} />
                                    <MetricRow label="Interval" value={cleanupInfo.intervalHours ? `${cleanupInfo.intervalHours} h` : '—'} />
                                    <MetricRow label="Minimum age" value={cleanupInfo.minAgeHours ? `${cleanupInfo.minAgeHours} h` : '—'} />
                                    <MetricRow label="Last run" value={cleanupInfo.lastRun ? new Date(cleanupInfo.lastRun).toLocaleString() : 'Never'} />
                                    <MetricRow label="Next run" value={cleanupInfo.nextRun ? new Date(cleanupInfo.nextRun).toLocaleString() : '—'} />
                                    <MetricRow label="Keys removed in the last run" value={cleanupInfo.lastRunStats?.keysRemoved ?? 0} />
                                </Facts>
                            )}
                            {adminData.cache && (
                                <>
                                    <Facts title="Activity">
                                        <MetricRow label={cacheRefreshed ? 'Hit rate (refreshed)' : 'Hit rate'} value={`${adminData.cache.cacheHitRate?.toFixed(1) ?? '0'}%`} status={adminData.cache.cacheHitRate > 80 ? 'success' : 'warning'} />
                                        <MetricRow label="Operations a second" value={adminData.cache.redisInfo?.stats?.instantaneous_ops_per_sec || '0'} />
                                        <MetricRow label="Connections received" value={adminData.cache.redisInfo?.stats?.total_connections_received ? parseInt(adminData.cache.redisInfo.stats.total_connections_received).toLocaleString() : '—'} />
                                    </Facts>
                                    <Facts title="Performance">
                                        <MetricRow label="Keyspace hits" value={adminData.cache.redisInfo?.stats?.keyspace_hits ? parseInt(adminData.cache.redisInfo.stats.keyspace_hits).toLocaleString() : '—'} />
                                        <MetricRow label="Keyspace misses" value={adminData.cache.redisInfo?.stats?.keyspace_misses ? parseInt(adminData.cache.redisInfo.stats.keyspace_misses).toLocaleString() : '—'} />
                                        <MetricRow label="Expired keys" value={adminData.cache.redisInfo?.stats?.expired_keys ? parseInt(adminData.cache.redisInfo.stats.expired_keys).toLocaleString() : '—'} />
                                        <MetricRow label="Commands processed" value={adminData.cache.redisInfo?.stats?.total_commands_processed ? parseInt(adminData.cache.redisInfo.stats.total_commands_processed).toLocaleString() : '—'} />
                                    </Facts>
                                    <Facts title="Memory">
                                        <MetricRow label="Used" value={adminData.cache.redisInfo?.memory?.used_memory_human || '—'} />
                                        <MetricRow label="Peak" value={adminData.cache.redisInfo?.memory?.used_memory_peak_human || '—'} />
                                        <MetricRow label="Fragmentation" value={adminData.cache.redisInfo?.memory?.mem_fragmentation_ratio || '—'} />
                                        <MetricRow label="Updated" value={adminData.cache.timestamp ? new Date(adminData.cache.timestamp).toLocaleTimeString() : '—'} />
                                    </Facts>
                                </>
                            )}
                        </Container>
                    ) : (
                        <State icon="FiDatabase" title="No cache figures" message="Refresh to read them again.">{refreshButton}</State>
                    )
                )}

                {activeSection === 'users' && !sectionLoading.users && (
                    <>
                        <Container layout="grid" columns={FACT_COLUMNS} gap="xl" padding="none" width="100%">
                            <Facts title="Accounts">
                                <MetricRow label="Total" value={adminData.userStats?.summary?.totalUsers?.toLocaleString() || (Array.isArray(adminData.users) ? adminData.users.length : 0)} />
                                <MetricRow label="Active" value={adminData.userStats?.summary?.activeUsers?.toLocaleString() || '—'} />
                                <MetricRow label="New this week" value={adminData.userStats?.summary?.newThisWeek || 0} />
                                <MetricRow label="Admins" value={adminData.userStats?.summary?.adminUsers || 0} />
                            </Facts>
                            {adminData.userStats?.roles && (
                                <Facts title="Roles">
                                    {adminData.userStats.roles.map((roleData) => (
                                        <React.Fragment key={roleData.role}>
                                            <MetricRow label={sentenceCase(roleData.role)} value={`${roleData.count} · ${roleData.percentage}%`} />
                                            <ProgressBar value={roleData.count} max={adminData.userStats.summary?.totalUsers || 1} color="primary" size="xs" width="100%" marginBottom="sm" />
                                        </React.Fragment>
                                    ))}
                                </Facts>
                            )}
                        </Container>
                        {adminData.users && Array.isArray(adminData.users) && adminData.users.length > 0 ? (
                            <Container layout="flex-column" gap="sm" padding="none" width="100%">
                                <Typography as="h3" size="sm" weight="semibold">{`All users (${adminData.users.length})`}</Typography>
                                <Data
                                    data={adminData.users}
                                    size="xs"
                                    fieldConfig={{
                                        firstName: { component: Typography, props: { size: 'xs', weight: 'medium' } },
                                        lastName: { component: Typography, props: { size: 'xs', weight: 'medium' } },
                                        username: { component: Typography, props: { size: 'xs' } },
                                        email: { component: Typography, props: { size: 'xs' } },
                                        roles: { component: Badge, props: { size: 'xs' }, transform: (value) => { const role = Array.isArray(value) ? value[0] : value; return { color: role === 'OWNER' || role === 'ADMIN' ? 'primary' : 'default', children: sentenceCase(role) }; } },
                                        active: { component: Badge, props: { size: 'xs' }, transform: (value) => ({ color: value ? 'success' : 'error', children: value ? 'Active' : 'Inactive' }) },
                                        emailVerified: { component: Badge, props: { size: 'xs' }, transform: (value) => ({ color: value ? 'success' : 'warning', children: value ? 'Verified' : 'Unverified' }) },
                                        createdAt: { component: Typography, props: { size: 'xxs', color: 'muted' }, transform: (value) => ({ children: new Date(value).toLocaleDateString() }) },
                                        lastLogin: { component: Typography, props: { size: 'xxs', color: 'muted' }, transform: (value) => ({ children: value ? new Date(value).toLocaleDateString() : 'Never' }) }
                                    }}
                                    exclude={['_id', '__v', 'password', 'resetPasswordToken', 'resetPasswordExpires', 'emailVerificationToken']}
                                    searchable filterable paginated pageSize={25} sortable width="100%"
                                    genie={{ trigger: 'contextmenu', variant: 'modal', content: (user) => (
                                        <EditUserForm user={user} onSave={async () => { await loadSectionData('users', true); document.querySelector('[data-genie-backdrop]')?.click(); }} onCancel={() => { document.querySelector('[data-genie-backdrop]')?.click(); }} />
                                    )}}
                                />
                            </Container>
                        ) : (
                            <State icon="FiUsers" title="No users loaded" message="Refresh to read the list again.">{refreshButton}</State>
                        )}
                    </>
                )}

                {activeSection === 'logs' && !sectionLoading.logs && (
                    <>
                        <Container layout="grid" columns={FACT_COLUMNS} gap="xl" padding="none" width="100%">
                            <Facts title="Entries">
                                <MetricRow label="Total" value={(adminData.logStats?.overview?.totalLogs || 0).toLocaleString()} />
                                <MetricRow label="Today" value={(adminData.logStats?.overview?.logsToday || 0).toLocaleString()} />
                                <MetricRow label="Warnings today" value={(adminData.logStats?.warnings?.today || 0).toLocaleString()} />
                                <MetricRow label="Errors today" value={(adminData.logStats?.errors?.today || 0).toLocaleString()} />
                            </Facts>
                            {adminData.logStats?.summary && (
                                <Facts title="Health">
                                    <MetricRow label="System health" value={`${adminData.logStats.summary.systemHealth}%`} status={(adminData.logStats.summary.systemHealth || 0) > 95 ? 'success' : 'warning'} />
                                    <ProgressBar value={adminData.logStats.summary.systemHealth || 0} max={100} color={(adminData.logStats.summary.systemHealth || 0) > 95 ? 'primary' : (adminData.logStats.summary.systemHealth || 0) > 85 ? 'warning' : 'error'} size="xs" width="100%" marginBottom="sm" />
                                    <MetricRow label="Error rate" value={`${adminData.logStats.summary.errorRate}%`} status={(adminData.logStats.summary.errorRate || 0) > 10 ? 'error' : null} />
                                    <MetricRow label="Average response" value={`${adminData.logStats.summary.avgResponseTime?.toFixed(1)} ms`} />
                                    <MetricRow label="Requests a day" value={adminData.logStats.summary.dailyRequestRate?.toFixed(0)} />
                                </Facts>
                            )}
                            {adminData.logStats?.breakdowns?.statusCodes && (
                                <Facts title="Status codes">
                                    {adminData.logStats.breakdowns.statusCodes.map((stat, index) => (
                                        <React.Fragment key={index}>
                                            <MetricRow label={String(stat._id)} value={stat.count?.toLocaleString()} />
                                            <ProgressBar value={stat.count} max={adminData.logStats.overview?.totalLogs || 1} color={String(stat._id).startsWith('4') ? 'warning' : String(stat._id).startsWith('5') ? 'error' : 'primary'} size="xs" width="100%" marginBottom="sm" />
                                        </React.Fragment>
                                    ))}
                                </Facts>
                            )}
                        </Container>
                        {adminData.logs && adminData.logs.length > 0 ? (
                            <Container layout="flex-column" gap="sm" padding="none" width="100%">
                                <Typography as="h3" size="sm" weight="semibold">{`Request log (${adminData.logs.length})`}</Typography>
                                <Data data={adminData.logs}
                                    size="xs"
                                    fieldConfig={{
                                        timestamp: { component: Typography, props: { size: 'xxs', color: 'muted' }, transform: (value) => ({ children: new Date(value).toLocaleString() }) },
                                        method: { component: Badge, props: { size: 'xs', color: 'default' } },
                                        url: { component: Typography, props: { size: 'xs' }, truncate: true, maxLength: 80 },
                                        statusCode: { component: Badge, props: { size: 'xs' }, transform: (value) => ({ color: value >= 500 ? 'error' : value >= 400 ? 'warning' : value >= 300 ? 'default' : 'success', children: value }) },
                                        responseTime: { component: Typography, props: { size: 'xs' }, transform: (value) => ({ children: value ? `${value} ms` : '—', color: value > 1000 ? 'error' : value > 500 ? 'warning' : 'default' }) }
                                    }}
                                    exclude={['__v']} searchable filterable paginated pageSize={15} sortable width="100%"
                                />
                            </Container>
                        ) : (
                            <State icon="FiFileText" title="No logs recorded" message="Refresh to read them again.">{refreshButton}</State>
                        )}
                    </>
                )}

                {activeSection === 'email' && (
                    <Container layout="flex-column" gap="md" padding="none" width="100%" maxWidth="560px">
                        <Typography as="h3" size="sm" weight="semibold">Send a test email</Typography>
                        <Input size="sm" label="Recipient" type="email" value={emailTest.recipient} onChange={e => setEmailTest(prev => ({ ...prev, recipient: e.target.value }))} placeholder="test@example.com" width="100%" />
                        <Select size="sm" label="Template" value={emailTest.template} onChange={value => setEmailTest(prev => ({ ...prev, template: value }))} width="100%"
                            options={[{ value: 'welcome', label: 'Welcome email' }, { value: 'password-reset', label: 'Password reset' }, { value: 'password-changed', label: 'Password changed' }, { value: 'security-alert', label: 'Security alert' }]} />
                        <Input size="sm" label="Subject" value={emailTest.subject} onChange={e => setEmailTest(prev => ({ ...prev, subject: e.target.value }))} placeholder="Test email subject" width="100%" />
                        <Container layout="flex" justify="start" padding="none" width="100%">
                            <Button size="sm" color="secondary" variant="solid" onClick={handleSendTestEmail} disabled={emailTest.isLoading || !emailTest.recipient}>
                                <Icon name="FiSend" />{emailTest.isLoading ? 'Sending…' : 'Send test email'}
                            </Button>
                        </Container>
                    </Container>
                )}

                {activeSection === 'appstats' && !sectionLoading.appstats && (
                    adminData.appStats ? (
                        <Container layout="grid" columns={FACT_COLUMNS} gap="xl" padding="none" width="100%">
                            <Facts title="Summary">
                                <MetricRow label="Total users" value={adminData.appStats.summary?.totalUsers || 0} />
                                <MetricRow label="Active users" value={adminData.appStats.summary?.activeUsers || 0} />
                                <MetricRow label="Total files" value={adminData.appStats.summary?.totalFiles || 0} />
                                <MetricRow label="Total requests" value={adminData.appStats.summary?.totalRequests || 0} />
                                <MetricRow label="Error rate" value={`${adminData.appStats.summary?.errorRate || 0}%`} status={(adminData.appStats.summary?.errorRate || 0) > 10 ? 'error' : null} />
                            </Facts>
                            <Facts title="System">
                                <MetricRow label="Node.js" value={adminData.appStats.system?.nodeVersion || '—'} />
                                <MetricRow label="Platform" value={adminData.appStats.system?.platform || '—'} />
                                <MetricRow label="Environment" value={adminData.appStats.system?.environment || '—'} />
                                <MetricRow label="Uptime" value={formatUptime(adminData.appStats.system?.uptime)} />
                            </Facts>
                            <Facts title="Services">
                                <MetricRow label="Database" badge={<Badge size="xs" color={adminData.appStats.services?.database?.status === 'connected' ? 'success' : 'error'}>{adminData.appStats.services?.database?.status === 'connected' ? 'Connected' : 'Disconnected'}</Badge>} />
                                <MetricRow label="Cache" badge={<Badge size="xs" color={adminData.appStats.services?.cache?.status === 'connected' ? 'success' : 'error'}>{adminData.appStats.services?.cache?.status === 'connected' ? 'Connected' : 'Disconnected'}</Badge>} />
                                <MetricRow label="Cache hit rate" value={`${adminData.appStats.services?.cache?.hitRate || 0}%`} />
                                <MetricRow label="Email" badge={<Badge size="xs" color={adminData.appStats.services?.email?.status === 'configured' ? 'success' : 'warning'}>{adminData.appStats.services?.email?.status === 'configured' ? 'Configured' : 'Not configured'}</Badge>} />
                            </Facts>
                            <Facts title="Activity">
                                <MetricRow label="Average response" value={`${Math.round(adminData.appStats.activity?.avgResponseTime || 0)} ms`} />
                                <MetricRow label="Total errors" value={adminData.appStats.activity?.totalErrors || 0} />
                                <MetricRow label="Period" value={adminData.appStats.activity?.period || '—'} />
                            </Facts>
                        </Container>
                    ) : (
                        <State icon="FiBarChart2" title="No app figures" message="Refresh to read them again.">{refreshButton}</State>
                    )
                )}

                {activeSection === 'role-requests' && hasOwnerAccess && !sectionLoading['role-requests'] && (
                    adminData.roleRequests && adminData.roleRequests.length > 0 ? (
                        <Container layout="flex-column" gap="sm" padding="none" width="100%">
                            <Typography as="h3" size="sm" weight="semibold">{`Pending requests (${adminData.roleRequests.length})`}</Typography>
                            <Data data={adminData.roleRequests}
                                size="xs"
                                fieldConfig={{
                                    username: { component: Typography, props: { size: 'xs', weight: 'medium' } },
                                    email: { component: Typography, props: { size: 'xs' } },
                                    currentRoles: { component: Badge, props: { size: 'xs' }, transform: (value) => { const role = Array.isArray(value) ? value[0] : value; return { color: 'default', children: sentenceCase(role) }; } },
                                    pendingRoles: { component: Badge, props: { size: 'xs' }, transform: (value) => { const role = Array.isArray(value) ? value[0] : value; return { color: 'primary', children: sentenceCase(role) }; } },
                                    roleApprovalStatus: { component: Badge, props: { size: 'xs' }, transform: (value) => ({ color: value === 'APPROVED' ? 'success' : value === 'REJECTED' ? 'error' : 'warning', children: sentenceCase(value || 'PENDING') }) }
                                }}
                                width="100%"
                                genie={{ trigger: 'contextmenu', variant: 'menu', content: (item) => item?.roleApprovalStatus === 'PENDING' ? (
                                    <RoleRequestActions
                                        item={item}
                                        onApprove={async (request) => { try { await authService.approveRoleRequest(request._id || request.id, {}); showSuccess('Role request approved'); await loadSectionData('role-requests', true); } catch { showError('Failed to approve'); } }}
                                        onReject={async (request, reason) => { try { await authService.rejectRoleRequest(request._id || request.id, reason); showSuccess('Role request rejected'); await loadSectionData('role-requests', true); } catch { showError('Failed to reject'); } }}
                                    />
                                ) : <Container padding="xs"><Typography size="xs" color="muted">Already processed</Typography></Container>
                                }}
                            />
                        </Container>
                    ) : (
                        <State icon="FiUserCheck" title="No pending role requests" message="A request shows here when someone asks for a higher role.">{refreshButton}</State>
                    )
                )}
            </Container>
        </Page>
    );
};

export default AdminPage;
