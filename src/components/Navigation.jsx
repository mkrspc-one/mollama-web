import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useTheme } from '@contexts/ThemeContext';
import { NotificationsMenu } from './AppNotifications';
import { Badge, Button, ButtonGroup, CircularProgress, Container, Divider, FloatingActionButton, Icon, Page, ProgressBar, Typography } from './Components';
import { useGuide, useActivity } from '../client/ai.client';

// What is running, said with the colour that matches its state: starting and running use the tertiary colour, a wait is amber, a failure is red and a finished job is green.
const REPLY_STATES = {
    waiting: { label: 'Waiting', color: 'warning', text: (reply) => (reply.ahead ? `${reply.ahead} ahead in line` : 'Waiting for its turn') },
    starting: { label: 'Starting', color: 'tertiary', text: () => 'Getting the model ready' },
    searching: { label: 'Searching', color: 'tertiary', text: () => 'Searching the web' },
    reading: { label: 'Reading', color: 'tertiary', text: () => 'Reading a page' },
    thinking: { label: 'Thinking', color: 'tertiary', text: () => 'Thinking it through' },
    writing: { label: 'Writing', color: 'tertiary', text: (reply) => `${reply.words} ${reply.words === 1 ? 'word' : 'words'} so far` }
};
const DOWNLOAD_STATES = {
    queued: { label: 'Waiting', color: 'warning', text: () => 'Waiting to download' },
    downloading: { label: 'Downloading', color: 'tertiary', text: (job) => `Downloading, ${job.percent}% done` },
    completed: { label: 'Done', color: 'success', text: () => 'Downloaded and ready to use' },
    failed: { label: 'Failed', color: 'error', text: () => 'The download did not finish' }
};

const LOADING_MESSAGES = [
    'Loading page',
    'Fetching page',
    'Retrieving page',
    'Rendering page',
    'Preparing page',
    'Assembling page',
    'Requesting page',
    'Building page',
    'Opening page',
    'Initializing page',
];

export const LoadingText = ({ children, messages = LOADING_MESSAGES, interval = 1400, size = 'xs', ...props }) => {
    const [index, setIndex] = useState(() => Math.floor(Math.random() * messages.length));

    useEffect(() => {
        if (children || messages.length < 2) return undefined;
        const timer = setInterval(() => setIndex(i => (i + 1) % messages.length), interval);
        return () => clearInterval(timer);
    }, [children, messages, interval]);

    return (
        <Container layout="flex" align="center" justify="center" gap="sm" padding="none" wrap={false}>
            <CircularProgress size="sm" />
            <Typography as="div" size={size} color="muted" {...props}>
                {children || `${messages[index % messages.length]}...`}
            </Typography>
        </Container>
    );
};

// Standardized loading component for consistent UI across all pages
export const PageLoading = ({ message = null }) => {
    return (
        <Page layout="flex" align="center" justify="center">
            <Container layout="flex-column" align="center" justify="center" gap="md">
                <LoadingText>{message}</LoadingText>
            </Container>
        </Page>
    );
};

const ROLE_ORDER = ['OWNER', 'ADMIN', 'SUPER_CREATOR', 'CREATOR', 'USER'];
const MENU_ORDER = ['chat', 'models', 'devices', 'tools', 'dashboard', 'settings', 'home', 'admin', 'home-guest', 'login', 'signup'];

const roleName = (role) => {
    const words = String(role || 'USER').replace(/_/g, ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
};

// Route role configuration - simplified for role checking only
const getRouteConfig = () => {
    return {
        '/admin': {roles: ['ADMIN', 'OWNER']}
    };
};

const PUBLIC_PAGES = ['/'];

/**
 * Navigation - App navigation component with draggable FAB and Genie integration
 *
 * Features:
 * - Draggable floating action button for navigation
 * - Genie popup with navigation menu
 * - Authentication-aware navigation options
 * - Theme switching capability
 * - User profile quick access
 * - Contextual navigation based on user roles
 */
export const Navigation = ({
                               className = '',
                               position = 'top-right',
                               variant = 'primary',
                               size = 'md',
                               draggable = true,
                               theme = null,
                               ...props
                           }) => {
    const {user, isLoading, logout, hasRole} = useAuth();
    const {currentTheme, switchTheme, availableThemes, themes} = useTheme();
    const navigate = useNavigate();

    // Navigation menu items based on authentication and roles
    const getNavigationItems = () => {
        const items = [];

        if (user) {
            // Dashboard/Home
            items.push({
                id: 'home',
                label: 'Home',
                icon: 'FiHome',
                path: '/',
                roles: ['USER', 'CREATOR', 'ADMIN', 'OWNER'],
                requireAuth: true
            });

            items.push({
                id: 'dashboard',
                label: 'Dashboard',
                icon: 'FiGrid',
                path: '/dashboard',
                roles: ['USER', 'CREATOR', 'SUPER_CREATOR', 'ADMIN', 'OWNER'],
                requireAuth: true
            });

            items.push({
                id: 'chat',
                label: 'Chat',
                icon: 'FiMessageSquare',
                path: '/chat',
                roles: ['USER', 'CREATOR', 'SUPER_CREATOR', 'ADMIN', 'OWNER'],
                requireAuth: true
            });

            items.push({
                id: 'models',
                label: 'Models',
                icon: 'FiBox',
                path: '/models',
                roles: ['USER', 'CREATOR', 'SUPER_CREATOR', 'ADMIN', 'OWNER'],
                requireAuth: true
            });

            items.push({
                id: 'devices',
                label: 'Devices',
                icon: 'FiMonitor',
                path: '/devices',
                roles: ['USER', 'CREATOR', 'SUPER_CREATOR', 'ADMIN', 'OWNER'],
                requireAuth: true
            });

            items.push({
                id: 'tools',
                label: 'Tools',
                icon: 'FiTool',
                path: '/tools',
                roles: ['USER', 'CREATOR', 'SUPER_CREATOR', 'ADMIN', 'OWNER'],
                requireAuth: true
            });

            items.push({
                id: 'settings',
                label: 'Settings',
                icon: 'FiSliders',
                path: '/settings',
                roles: ['USER', 'CREATOR', 'SUPER_CREATOR', 'ADMIN', 'OWNER'],
                requireAuth: true
            });

            // Admin panel for admin users
            if (hasRole('ADMIN') || hasRole('OWNER')) {
                items.push({
                    id: 'admin',
                    label: 'Admin',
                    icon: 'FiSettings',
                    path: '/admin',
                    roles: ['ADMIN', 'OWNER'],
                    requireAuth: true
                });
            }
        } else {
            items.push({
                id: 'home-guest',
                label: 'Home',
                icon: 'FiHome',
                path: '/',
                publicOnly: true
            });

            // Guest navigation
            items.push({
                id: 'login',
                label: 'Sign in',
                icon: 'FiLogIn',
                path: '/login',
                publicOnly: true
            });

            items.push({
                id: 'signup',
                label: 'Create an account',
                icon: 'FiUserPlus',
                path: '/signup',
                publicOnly: true
            });
        }

        return items.filter(item =>
            !item.roles || item.roles.some(role => hasRole(role))
        );
    };

    const navigationItems = getNavigationItems();
    const menuItems = [...navigationItems].sort((a, b) => MENU_ORDER.indexOf(a.id) - MENU_ORDER.indexOf(b.id));
    const { pathname } = useLocation();
    const isCurrent = (path) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`));
    const personName = user ? ([user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email) : '';
    const roles = user?.roles?.length ? user.roles : ['USER'];
    const topRole = ROLE_ORDER.find((role) => roles.includes(role)) || roles[0];
    const guide = useGuide();
    const activity = useActivity();
    const busyCount = activity.replies.length + activity.downloads.length;
    const finished = activity.finished || [];
    // One colour says how things stand overall: a failure is red, a wait is amber, work under way is tertiary, all finished is green.
    const runningColor = finished.some((job) => job.status === 'failed')
        ? 'error'
        : activity.replies.some((reply) => reply.phase === 'waiting') || activity.downloads.some((job) => job.status === 'queued')
            ? 'warning'
            : busyCount > 0 ? 'tertiary' : 'success';
    const runningCount = busyCount > 0 ? busyCount : finished.length;

    // Pages change in place, at once: no wait and no reload of the app.
    const handleNavigation = (path) => navigate(path);

    const handleLogout = async () => {
        try {
            await logout();
            window.location.href = '/login';
        } catch (error) {
            // Silent error handling
        }
    };

    const handleThemeChange = (themeName) => {
        switchTheme(themeName);
    };

    const genieContent = (
        <Container layout="flex-column" gap="sm" padding="sm" width="100%" maxHeight="78vh" overflow="auto" wrap={false}>
            {user && (
                <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%" wrap={false}>
                    <Container layout="flex" align="center" gap="sm" padding="none" flexFill minWidth="0" wrap={false}>
                        <Typography as="p" size="sm" weight="semibold" truncate>{personName}</Typography>
                        <Badge color="primary" size="xs">{roleName(topRole)}</Badge>
                    </Container>
                    <Button
                        size="xs"
                        variant="ghost"
                        color="tertiary"
                        round
                        selected={guide.on}
                        aria-pressed={guide.on}
                        title={guide.on ? 'Helper is on. Press to turn it off.' : 'Turn the helper on. Every button explains itself once more.'}
                        aria-label="Helper"
                        onClick={() => guide.setOn(!guide.on)}
                    >
                        <Icon name="MdSupportAgent" />
                    </Button>
                </Container>
            )}

            {user && <Divider margin="none" />}

            <Container layout="flex-column" gap="xs" padding="none" width="100%">
                {menuItems.map((item) => {
                    const hint = guide.tip(`nav.${item.id}`, { label: `Open ${item.label}`, run: () => handleNavigation(item.path) });
                    return (
                        <Button
                            key={item.id}
                            size="xs"
                            variant="ghost"
                            align="start"
                            width="100%"
                            selected={isCurrent(item.path)}
                            onClick={hint.genie ? undefined : () => handleNavigation(item.path)}
                            {...hint}
                        >
                            <Icon name={item.icon} />
                            {item.label}
                            {item.badge && (
                                <Badge color="tertiary" size="xs">
                                    {item.badge}
                                </Badge>
                            )}
                        </Button>
                    );
                })}
            </Container>

            {busyCount + finished.length > 0 && (
                <>
                    <Divider margin="none" />
                    <Container layout="flex-column" gap="sm" padding="none" width="100%">
                        <Container layout="flex" align="center" justify="between" gap="xs" padding="none" width="100%" wrap={false}>
                            <Typography as="p" size="xxs" color="muted">Running now</Typography>
                            <Badge size="xs" color={runningColor}>{runningCount}</Badge>
                        </Container>
                        {activity.replies.map((reply) => {
                            const state = REPLY_STATES[reply.phase] || REPLY_STATES.starting;
                            return (
                                <Container key={reply.chatId} layout="flex-column" gap="none" padding="none" width="100%">
                                    <Container layout="flex" align="center" justify="between" gap="xs" padding="none" width="100%" wrap={false}>
                                        <CircularProgress size="sm" />
                                        <Container padding="none" flexFill minWidth="0">
                                            <Typography size="xs" weight="semibold" truncate>{reply.title}</Typography>
                                        </Container>
                                        <Button size="xxs" variant="ghost" title="Open this chat" aria-label={`Open ${reply.title}`} onClick={() => handleNavigation(`/chat/${reply.chatId}`)}>
                                            <Icon name="FiArrowRight" />Open
                                        </Button>
                                        <Button size="xxs" variant="ghost" color="error" onClick={() => activity.stopReply(reply.chatId)}>Stop</Button>
                                    </Container>
                                    <Typography size="xxs" color="muted" truncate>
                                        {[reply.model, state.text(reply), reply.waiting ? `${reply.waiting} more waiting` : null].filter(Boolean).join(' · ')}
                                    </Typography>
                                </Container>
                            );
                        })}
                        {[...activity.downloads, ...finished].map((job) => {
                            const state = DOWNLOAD_STATES[job.status] || DOWNLOAD_STATES.downloading;
                            const active = job.status === 'queued' || job.status === 'downloading';
                            return (
                                <Container key={job.id} layout="flex-column" gap="xs" padding="none" width="100%">
                                    <Container layout="flex" align="center" justify="between" gap="xs" padding="none" width="100%" wrap={false}>
                                        <Container padding="none" flexFill minWidth="0">
                                            <Typography size="xs" weight="semibold" font="monospace" truncate>{job.model}</Typography>
                                        </Container>
                                        <Button size="xxs" variant="ghost" title="Open the Models page" aria-label={`Open ${job.model} on the Models page`} onClick={() => handleNavigation('/models')}>
                                            <Icon name="FiArrowRight" />Open
                                        </Button>
                                        {active && activity.canManage && <Button size="xxs" variant="ghost" onClick={() => activity.cancelDownload(job.id)}>Cancel</Button>}
                                    </Container>
                                    <Typography size="xxs" color="muted" truncate>{state.text(job)}</Typography>
                                    {active && <ProgressBar value={job.percent || 0} size="sm" width="100%" animated={job.status === 'downloading'} />}
                                </Container>
                            );
                        })}
                    </Container>
                </>
            )}

            <NotificationsMenu />

            <Divider margin="none" />
            <Container layout="flex-column" gap="xs" padding="none" width="100%">
                <Typography as="p" size="xxs" color="muted">Theme</Typography>
                <ButtonGroup size="xs" wrap>
                    {availableThemes.map(themeName => (
                        <Button
                            key={themeName}
                            size="xs"
                            selected={currentTheme === themeName}
                            onClick={() => handleThemeChange(themeName)}
                        >
                            {themes[themeName]?.name || themeName.charAt(0).toUpperCase() + themeName.slice(1)}
                        </Button>
                    ))}
                </ButtonGroup>
            </Container>

            {user && (
                <>
                    <Divider margin="none" />
                    <Button
                        variant="ghost"
                        size="xs"
                        align="start"
                        width="100%"
                        onClick={handleLogout}
                    >
                        <Icon name="FiLogOut" />
                        Sign out
                    </Button>
                </>
            )}
        </Container>
    );

    return (
        <FloatingActionButton
            className={`navigation-fab ${className}`}
            variant={variant}
            size={size}
            position={position}
            draggable={draggable}
            icon="FiMap"
            badge={busyCount + finished.length > 0 ? String(runningCount) : null}
            badgeColor={runningColor}
            theme={theme}
            genie={{
                trigger: 'click',
                content: genieContent,
                variant: 'menu',
                width: '300px',
                maxHeight: '80vh'
            }}
            title="Navigation Menu"
            aria-label="Open navigation menu"
            {...props}
        />
    );
};

// Simple route access control - just basic checks
export const RouteAccessControl = ({children, path}) => {
    const {user, isLoading} = useAuth();
    const navigate = useNavigate();

    // Show loading during auth check
    if (isLoading) {
        return <PageLoading message="Loading..."/>;
    }

    // Simple auth pages list
    const authPages = ['/login', '/signup', '/forgot-password'];
    const isAuthPage = authPages.includes(path);

    // Redirect logic
    const isPublicPage = PUBLIC_PAGES.includes(path);
    if (!isAuthPage && !isPublicPage && !user) {
        return <Navigate to="/login" replace />;
    }

    if (isAuthPage && user) {
        return <Navigate to="/" replace />;
    }

    // Simple role check for admin pages
    if (path === '/admin' && user && !user.roles?.includes('ADMIN') && !user.roles?.includes('OWNER')) {
        return (
            <Page layout="flex-column" align="center" justify="center" gap="md" padding="xl">
                <Icon name="FiLock" size="xl" color="error"/>
                <Typography as="h1" size="lg" weight="semibold" font="secondary" align="center">Access denied</Typography>
                <Typography size="xs" color="muted" align="center">
                    This page needs an admin account.
                </Typography>
                <Button size="sm" onClick={() => navigate('/')}>Go to Home</Button>
            </Page>
        );
    }

    return children;
};

export default Navigation;
