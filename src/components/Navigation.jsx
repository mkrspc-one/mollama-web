import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useTheme } from '@contexts/ThemeContext';
import { NotificationsMenu } from './AppNotifications';
import { Badge, Button, CircularProgress, Container, FloatingActionButton, Icon, Page, ProgressBar, Typography } from './Components';
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

export const LoadingText = ({ children, messages = LOADING_MESSAGES, interval = 1400, size = '2xl', ...props }) => {
    const [index, setIndex] = useState(() => Math.floor(Math.random() * messages.length));

    useEffect(() => {
        if (children || messages.length < 2) return undefined;
        const timer = setInterval(() => setIndex(i => (i + 1) % messages.length), interval);
        return () => clearInterval(timer);
    }, [children, messages, interval]);

    return (
        <Typography as="div" size={size} weight="bold" font="monospace" color="primary" animation="glitch" animationDuration={900} {...props}>
            {children || `${messages[index % messages.length]}...`}
        </Typography>
    );
};

// Standardized loading component for consistent UI across all pages
export const PageLoading = () => {
    return (
        <Page layout="flex" align="center" justify="center">
            <Container layout="flex-column" align="center" justify="center" gap="md">
                <LoadingText/>
            </Container>
        </Page>
    );
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
                    label: 'Admin Panel',
                    icon: 'FiSettings',
                    path: '/admin',
                    roles: ['ADMIN', 'OWNER'],
                    requireAuth: true,
                    badge: 'Admin'
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
                label: 'Sign In',
                icon: 'FiLogIn',
                path: '/login',
                publicOnly: true
            });

            items.push({
                id: 'signup',
                label: 'Sign Up',
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
    // Admin panel goes last, or Settings when there is no admin panel, or Home when signed out; an odd last button spans both columns
    const lastMenuId = ['admin', 'settings', 'home-guest'].find((id) => navigationItems.some((item) => item.id === id));
    const menuItems = [...navigationItems.filter((item) => item.id !== lastMenuId), ...navigationItems.filter((item) => item.id === lastMenuId)];
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

    // Genie content with navigation menu
    const genieContent = (
        <Container layout="flex-column" gap="sm" padding="sm">
            {/* Header */}
            <Container layout="flex" justify="between" align="center" gap="md" width="100%">
                <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
                    {user && (
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
                            <Icon name="MdSupportAgent" size="xs" />
                        </Button>
                    )}
                    <Typography as="h4" size="sm" weight="semibold">
                        Navigation
                    </Typography>
                </Container>
                {user && (
                    <Badge color="primary" size="sm">
                        {user.username || user.email}
                    </Badge>
                )}
            </Container>

            {/* User info for authenticated users */}
            {user && (
                <Container
                    layout="flex"
                    gap="sm"
                    justify="around"
                    align="center"
                    padding="sm"
                    backgroundColor="background"
                    width="100%"
                >
                    <Icon name="FiUser" size="md"/>
                    <Container layout="flex-column" gap="xs">
                        <Typography as="p" size="sm" weight="medium">
                            {user.firstName} {user.lastName}
                        </Typography>
                        <Container layout="flex" gap="xs">
                            {user.roles?.map(role => (
                                <Badge
                                    key={role}
                                    color={role === 'OWNER' ? 'primary' : 'secondary'}
                                    size="sm"
                                >
                                    {role}
                                </Badge>
                            )) || <Badge color="secondary" size="sm">USER</Badge>}
                        </Container>
                    </Container>
                </Container>
            )}

            {/* Navigation Items */}
            <Container layout="flex-column" gap="xs" width="100%">
                <Typography as="p" size="xs" weight="medium">
                    MENU
                </Typography>
                <Container layout="grid" columns={2} gap="xs" padding="none" width="100%">
                    {menuItems.map((item, index) => {
                        const hint = guide.tip(`nav.${item.id}`, { label: `Open ${item.label}`, run: () => handleNavigation(item.path) });
                        return (
                            <Container key={item.id} padding="none" width="100%" span={index === menuItems.length - 1 && menuItems.length % 2 === 1 ? 'full' : null}>
                                <Button
                                    size="sm"
                                    align="left"
                                    width="100%"
                                    onClick={hint.genie ? undefined : () => handleNavigation(item.path)}
                                    {...hint}
                                >
                                    <Icon name={item.icon} size="xs"/>
                                    {item.label}
                                    {item.badge && (
                                        <Badge color="tertiary" size="xs">
                                            {item.badge}
                                        </Badge>
                                    )}
                                </Button>
                            </Container>
                        );
                    })}
                </Container>
            </Container>
            {busyCount + finished.length > 0 && (
                <Container layout="flex-column" gap="xs" width="100%">
                    <Container layout="flex" align="center" justify="between" gap="xs" padding="none" width="100%" wrap={false}>
                        <Typography as="p" size="xs" weight="medium">RUNNING NOW</Typography>
                        <Badge size="xs" color={runningColor}>{runningCount}</Badge>
                    </Container>
                    {activity.replies.map((reply) => {
                        const state = REPLY_STATES[reply.phase] || REPLY_STATES.starting;
                        return (
                            <Container key={reply.chatId} layout="flex-column" gap="none" padding="none" width="100%">
                                <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%" wrap={false}>
                                    <Container padding="none" flexFill minWidth="0">
                                        <Typography size="xs" weight="medium" truncate>{reply.title}</Typography>
                                    </Container>
                                    <Button size="xs" color="secondary" title="Open this chat" aria-label={`Open ${reply.title}`} onClick={() => handleNavigation(`/chat/${reply.chatId}`)}>
                                        <Icon name="FiArrowRight" size="xs" />Open
                                    </Button>
                                    <Button size="xs" color="error" onClick={() => activity.stopReply(reply.chatId)}>Stop</Button>
                                </Container>
                                <Typography size="xxs" color={state.color} truncate>
                                    {[reply.model, state.text(reply), reply.waiting ? `${reply.waiting} more waiting` : null].filter(Boolean).join(' · ')}
                                </Typography>
                            </Container>
                        );
                    })}
                    {[...activity.downloads, ...finished].map((job) => {
                        const state = DOWNLOAD_STATES[job.status] || DOWNLOAD_STATES.downloading;
                        const active = job.status === 'queued' || job.status === 'downloading';
                        return (
                            <Container key={job.id} layout="flex-column" gap="none" padding="none" width="100%">
                                <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%" wrap={false}>
                                    <Container padding="none" flexFill minWidth="0">
                                        <Typography size="xs" weight="medium" truncate>{job.model}</Typography>
                                    </Container>
                                    <Button size="xs" color="secondary" title="Open the Models page" aria-label={`Open ${job.model} on the Models page`} onClick={() => handleNavigation('/models')}>
                                        <Icon name="FiArrowRight" size="xs" />Open
                                    </Button>
                                    {active && activity.canManage && <Button size="xs" color="secondary" onClick={() => activity.cancelDownload(job.id)}>Cancel</Button>}
                                </Container>
                                <Typography size="xxs" color={state.color} truncate>{state.text(job)}</Typography>
                                {active && <ProgressBar value={job.percent || 0} size="sm" width="100%" color={state.color} animated={job.status === 'downloading'} />}
                            </Container>
                        );
                    })}
                </Container>
            )}

            <NotificationsMenu />

            {/* Theme Switcher */}
            <Container layout="flex-column" gap="xs" width="100%">
                <Typography as="p" size="xs" weight="medium">
                    THEME
                </Typography>
                <Container layout="flex" gap="xs" wrap justify="center" width="100%">
                    {availableThemes.map(themeName => (
                        <Button
                            key={themeName}
                            variant='ghost'
                            size="sm"
                            selected={currentTheme === themeName}
                            onClick={() => handleThemeChange(themeName)}
                        >
                            {themes[themeName]?.name || themeName.charAt(0).toUpperCase() + themeName.slice(1)}
                        </Button>
                    ))}
                </Container>
            </Container>

            {/* Actions */}
            {user && (
                <Container layout="flex-column" gap="xs" width="100%">
                    <Typography as="p" size="xs" weight="medium">
                        ACCOUNT
                    </Typography>
                    <Button
                        variant="ghost"
                        size="sm"
                        align="left"
                        width="100%"
                        onClick={handleLogout}
                        color="error"
                    >
                        <Icon name="FiLogOut" size="xs"/>
                        Sign Out
                    </Button>
                </Container>
            )}
        </Container>
    );

    return (
        <FloatingActionButton
            className={`navigation-fab ${className}`}
            color={variant}
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
                maxHeight: '48vh'
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
            <Page layout="flex-column" align="center" justify="center" gap="lg" padding="xl">
                <Icon name="FiLock" size="xl" variant="error"/>
                <Typography size="xl" weight="bold">Access Denied</Typography>
                <Typography size="md" align="center">
                    Admin access required.
                </Typography>
            </Page>
        );
    }

    return children;
};

export default Navigation;
