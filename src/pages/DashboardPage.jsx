import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { Page, Container, Card, Typography, Button, Badge, Icon, ProgressBar } from '@components/Components';
import { NotificationsCard } from '@components/AppNotifications';
import { chatService, deviceService, modelService, useActivity, onReturn } from '../client/ai.client';

const gb = (megabytes) => {
    if (megabytes === null || megabytes === undefined) return 'Unknown';
    const value = megabytes / 1024;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} GB`;
};

const ago = (date) => {
    const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
    return `${Math.round(minutes / 1440)} d ago`;
};

const greeting = () => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

const Glance = ({ title, status = null, figure, notes = [], link, onOpen }) => (
    <Card layout="flex-column" gap="md" padding="lg" width="100%" minWidth="0" hover={false}>
        <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%" wrap={false}>
            <Typography as="h2" size="sm" weight="semibold">{title}</Typography>
            {status}
        </Container>
        <Container layout="flex-column" gap="xs" padding="none" width="100%" minWidth="0" flexFill>
            <Typography size="md" weight="semibold" font="secondary" truncate title={String(figure)}>{figure}</Typography>
            {notes.filter(Boolean).map((note) => <Typography key={note} size="xxs" color="muted">{note}</Typography>)}
        </Container>
        <Container layout="flex" padding="none" width="100%">
            <Button size="xs" variant="ghost" onClick={onOpen}>{link}<Icon name="FiArrowRight" /></Button>
        </Container>
    </Card>
);

const Heading = ({ title, children }) => (
    <Container layout="flex" justify="between" align="center" gap="sm" padding="none" width="100%" wrap={false}>
        <Typography as="h2" size="md" weight="semibold" font="secondary">{title}</Typography>
        {children}
    </Container>
);

const Line = ({ icon, title, note, onClick, children }) => (
    <Container
        layout="flex"
        align="center"
        gap="sm"
        padding="xs"
        width="100%"
        wrap={false}
        hoverable={Boolean(onClick)}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (event) => event.key === 'Enter' && onClick() : undefined}
    >
        <Icon name={icon} size="sm" color="primary" />
        <Container layout="flex-column" gap="none" padding="none" flexFill minWidth="0">
            <Typography size="sm" weight="semibold" truncate>{title}</Typography>
            {note && <Typography size="xxs" color="muted" truncate>{note}</Typography>}
        </Container>
        {children}
    </Container>
);

const DashboardPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const activity = useActivity();
    const [status, setStatus] = useState(null);
    const [running, setRunning] = useState(null);
    const [installed, setInstalled] = useState(null);
    const [chats, setChats] = useState(null);

    const load = useCallback(() => {
        deviceService.getSetupStatus().then(setStatus).catch(() => setStatus({ ollama: { available: false }, steps: {} }));
        modelService.listRunning().then((result) => setRunning(result.models || [])).catch(() => setRunning([]));
        modelService.listInstalled().then(setInstalled).catch(() => setInstalled({ models: [], disk: null }));
        chatService.list().then((result) => setChats(result.chats || [])).catch(() => setChats([]));
    }, []);

    useEffect(() => {
        load();
        const stop = onReturn(load);
        window.addEventListener('ollama-availability-changed', load);
        window.addEventListener('mollama-chat-changed', load);
        return () => {
            stop();
            window.removeEventListener('ollama-availability-changed', load);
            window.removeEventListener('mollama-chat-changed', load);
        };
    }, [load]);

    const ollamaUp = status?.ollama?.available;
    const loaded = running || [];
    const busy = activity.replies.length + activity.downloads.length;
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <Page
            title={`${greeting()}, ${user?.firstName || user?.username || 'there'}`}
            lead={today}
            gap="xl"
            background="dots"
            backgroundFade="bottom"
            actions={(
                <Container layout="flex" align="center" gap="sm" padding="none" wrap={false}>
                    <Button size="sm" onClick={() => navigate('/models')}><Icon name="FiBox" />Models</Button>
                    <Button size="sm" color="secondary" variant="solid" onClick={() => navigate('/chat')}><Icon name="FiPlus" />New chat</Button>
                </Container>
            )}
        >
            <Container layout="grid" columns="auto-lg" gap="lg" align="stretch" padding="none" width="100%">
                <Glance
                    title="Ollama"
                    status={<Badge size="xs" color={status === null ? 'default' : ollamaUp ? 'success' : 'error'}>{status === null ? 'Checking' : ollamaUp ? 'Running' : 'Not running'}</Badge>}
                    figure={status === null ? '…' : ollamaUp ? `Version ${status.ollama.version}` : 'Start Ollama to use models'}
                    notes={[installed?.disk ? `${gb(installed.disk.freeMb)} free disk` : null]}
                    link="Open Devices"
                    onOpen={() => navigate('/devices')}
                />
                <Glance
                    title="Models"
                    status={loaded.length > 0 ? <Badge size="xs" color={loaded.every((model) => model.healthy) ? 'success' : 'warning'}>{loaded.every((model) => model.healthy) ? 'Fully on the graphics card' : 'Partly on the processor, so slower'}</Badge> : null}
                    figure={installed ? `${installed.models.length} models installed` : '…'}
                    notes={[
                        installed?.disk ? `${gb(installed.disk.usedByModelsMb)} on disk` : null,
                        running === null ? null : loaded.length === 0 ? 'Nothing in memory now. A model loads when it is used.' : `In memory now: ${loaded.map((model) => model.displayName).join(', ')}`
                    ]}
                    link="Open Models"
                    onOpen={() => navigate('/models')}
                />
            </Container>

            <Container as="section" layout="flex-column" gap="sm" padding="none" width="100%">
                <Heading title="Running now">
                    {busy > 0 && <Badge size="xs" color="primary">{busy}</Badge>}
                </Heading>
                {busy === 0 && <Line icon="FiMoon" title="Nothing is running" note="Replies being written and downloads show here, each with a way to stop it." />}
                {activity.replies.map((reply) => (
                    <Line key={reply.chatId} icon="FiEdit3" title={reply.title} note={`${reply.model} is replying${reply.waiting ? `, ${reply.waiting} more waiting` : ''}`} onClick={() => navigate(`/chat/${reply.chatId}`)}>
                        <Button size="xs" variant="ghost" title="Open this chat" aria-label={`Open ${reply.title}`} onClick={(event) => { event.stopPropagation(); navigate(`/chat/${reply.chatId}`); }}>
                            <Icon name="FiArrowRight" />Open
                        </Button>
                        <Button size="xs" color="error" onClick={(event) => { event.stopPropagation(); activity.stopReply(reply.chatId); }}>Stop</Button>
                    </Line>
                ))}
                {activity.downloads.map((job) => (
                    <Container key={job.id} layout="flex-column" gap="none" padding="none" width="100%">
                        <Line icon="FiDownload" title={job.model} note={job.status === 'queued' ? 'Waiting to download' : `Downloading, ${job.percent}%`} onClick={() => navigate('/models')}>
                            <Button size="xs" variant="ghost" title="Open the Models page" aria-label={`Open ${job.model} on the Models page`} onClick={(event) => { event.stopPropagation(); navigate('/models'); }}>
                                <Icon name="FiArrowRight" />Open
                            </Button>
                            {activity.canManage && <Button size="xs" variant="ghost" onClick={(event) => { event.stopPropagation(); activity.cancelDownload(job.id); }}>Cancel</Button>}
                        </Line>
                        <ProgressBar value={job.percent} size="sm" width="100%" animated={job.status === 'downloading'} />
                    </Container>
                ))}
            </Container>

            <Container layout="grid" columns="auto-lg" gap="xl" align="start" padding="none" width="100%">
                <Container as="section" layout="flex-column" gap="sm" padding="none" width="100%" minWidth="0">
                    <Heading title="Recent chats">
                        <Button size="xs" variant="ghost" onClick={() => navigate('/chat')}>Open Chat<Icon name="FiArrowRight" /></Button>
                    </Heading>
                    {chats === null && <Typography size="xs" color="muted">Loading your chats…</Typography>}
                    {chats?.length === 0 && (
                        <Line icon="FiMessageSquare" title="No chats yet" note="Start one and it will be listed here.">
                            <Button size="xs" onClick={() => navigate('/chat')}>Start a chat</Button>
                        </Line>
                    )}
                    {chats?.slice(0, 7).map((chat) => (
                        <Line key={chat.id} icon="FiMessageSquare" title={chat.title} note={[chat.model, ago(chat.updatedAt)].filter(Boolean).join(' · ')} onClick={() => navigate(`/chat/${chat.id}`)}>
                            {activity.replies.some((reply) => reply.chatId === chat.id) && <Badge size="xs" color="primary">Replying</Badge>}
                        </Line>
                    ))}
                </Container>

                <Container layout="flex-column" gap="xl" padding="none" width="100%" minWidth="0">
                    <NotificationsCard />
                    <Container as="section" layout="flex-column" gap="sm" padding="none" width="100%">
                        <Heading title="Next things to try" />
                        {installed?.models.length === 0 && <Line icon="FiDownload" title="Download your first model" note="Pick one that fits this device." onClick={() => navigate('/models')} />}
                        <Line icon="FiPaperclip" title="Ask about a document" note="Attach a PDF, Word file or spreadsheet in Chat." onClick={() => navigate('/chat')} />
                        <Line icon="FiUser" title="Make a model your own" note="Give an installed model its own name and instructions." onClick={() => navigate('/models')} />
                        <Line icon="FiMonitor" title="Check this device" note="See what Mollama reads from this computer." onClick={() => navigate('/devices')} />
                        <Line icon="FiSliders" title="Settings" note="Account, security, themes and Ollama." onClick={() => navigate('/settings')} />
                    </Container>
                </Container>
            </Container>
        </Page>
    );
};

export default DashboardPage;
