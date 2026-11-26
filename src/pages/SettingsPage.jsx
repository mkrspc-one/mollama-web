import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Page, Container, Card, Typography, Button, ButtonGroup, Badge, Icon, Input, Select, Switch, Divider, Image, CircularProgress, BACKGROUND_PATTERNS, BACKGROUND_DYNAMIC
} from '@components/Components';
import { useAuth } from '@contexts/AuthContext';
import { useTheme } from '@contexts/ThemeContext';
import { useNotification } from '@contexts/NotificationContext';
import { authService } from '../client/auth.client';
import { userService } from '../client/user.client';
import { themeService } from '../client/theme.client';
import { deviceService, describeError } from '../client/ai.client';
import { listFontKeys, ensureFontsLoaded } from '@styles/font.registry';
import { GALLERY_THEMES } from '@styles/theme.gallery';

const failText = (error, fallback) => error?.response?.data?.message || fallback;

const Section = ({ title, note, action, children }) => (
    <Container as="section" layout="flex-column" gap="md" padding="none" width="100%">
        <Container layout="flex" justify="between" align="end" gap="sm" padding="none" width="100%">
            <Container layout="flex-column" gap="xs" padding="none" minWidth="min(100%, 240px)" flexFill>
                <Typography as="h2" size="md" weight="semibold" font="secondary">{title}</Typography>
                {note && <Typography as="p" size="xs" color="muted">{note}</Typography>}
            </Container>
            {action}
        </Container>
        {children}
    </Container>
);

const Rows = ({ children }) => (
    <Container layout="flex-column" gap="none" padding="none" width="100%">
        {React.Children.toArray(children).map((row, index) => (
            <React.Fragment key={index}>
                {index > 0 && <Divider margin="sm" />}
                {row}
            </React.Fragment>
        ))}
    </Container>
);

// A setting: its name and what it does on the left, its control on the right (under it on a phone).
const Row = ({ name, note, field = false, align = 'center', children }) => (
    <Container layout="flex" justify="between" align={align} gap="md" padding="none" width="100%">
        <Container layout="flex-column" gap="none" padding="none" minWidth="min(100%, 220px)" flexFill>
            <Typography as="p" size="xs" weight="medium">{name}</Typography>
            {note && <Typography as="p" size="xxs" color="muted">{note}</Typography>}
        </Container>
        <Container layout="flex" align="center" justify="end" gap="xs" padding="none" width={field ? 'min(100%, 320px)' : undefined}>{children}</Container>
    </Container>
);

const Actions = ({ children }) => (
    <Container layout="flex" justify="end" align="center" gap="xs" padding="none" width="100%">{children}</Container>
);

// The one shape for a list or setting that is loading, empty or failed: what is the case, then the one thing to do about it.
const ListState = ({ loading = false, failed = false, action = null, children }) => (
    <Container layout="flex" align="center" gap="sm" padding="none" width="100%">
        {loading && <CircularProgress size="xs" />}
        {failed && <Icon name="FiAlertCircle" size="sm" color="error" />}
        <Typography as="p" size="xs" weight={failed ? 'medium' : 'normal'} color={loading ? 'muted' : 'default'}>{children}</Typography>
        {action}
    </Container>
);

// Filled only while the section has changes to save.
const saveLook = (changed) => ({ color: changed ? 'secondary' : 'primary', variant: changed ? 'solid' : null });

const AiTab = () => {
    const { success, error: notifyError } = useNotification();
    const [settings, setSettings] = useState(null);
    const [canManage, setCanManage] = useState(false);
    const [failed, setFailed] = useState(false);
    const [address, setAddress] = useState('');
    const [concurrent, setConcurrent] = useState('1');
    const [keepAlive, setKeepAlive] = useState('5');
    const [testResult, setTestResult] = useState(null);
    const [busy, setBusy] = useState(false);

    const apply = (next) => {
        setSettings(next);
        setAddress(next.ollamaBaseUrl || '');
        setConcurrent(String(next.maxConcurrentGenerations));
        setKeepAlive(String(next.keepAliveMinutes));
    };

    const load = useCallback(async () => {
        try {
            const result = await deviceService.getSettings();
            apply(result.settings);
            setCanManage(Boolean(result.permissions?.manage));
            setFailed(false);
        } catch (error) {
            setFailed(true);
            notifyError(describeError(error, 'Settings could not be loaded.'));
        }
    }, [notifyError]);

    useEffect(() => {
        load();
    }, [load]);

    const testConnection = async () => {
        setBusy(true);
        setTestResult(null);
        try {
            const result = await deviceService.testConnection(address.trim());
            setTestResult({ ok: true, text: `Connected. Ollama ${result.ollama.version} answered at this address.` });
        } catch (error) {
            const text = error?.response?.data?.code === 'OLLAMA_DOWN'
                ? 'Nothing answered at this address. Check the address, and that Ollama is running there.'
                : describeError(error, 'This address could not be tested.');
            setTestResult({ ok: false, text });
        } finally {
            setBusy(false);
        }
    };

    const save = async (changes, doneMessage) => {
        setBusy(true);
        try {
            const result = await deviceService.updateSettings(changes);
            apply(result.settings);
            success(doneMessage);
            window.dispatchEvent(new CustomEvent('ollama-status-changed'));
        } catch (error) {
            notifyError(describeError(error));
        } finally {
            setBusy(false);
        }
    };

    const saveRunning = () => {
        const concurrentNumber = Number(concurrent);
        const keepAliveNumber = Number(keepAlive);
        if (!Number.isInteger(concurrentNumber) || concurrentNumber < 1 || concurrentNumber > 8) {
            notifyError('Replies at once must be a whole number from 1 to 8.');
            return;
        }
        if (!Number.isInteger(keepAliveNumber) || keepAliveNumber < 0 || keepAliveNumber > 1440) {
            notifyError('Minutes must be a whole number from 0 to 1440.');
            return;
        }
        save({ maxConcurrentGenerations: concurrentNumber, keepAliveMinutes: keepAliveNumber }, 'Saved. No restart needed.');
    };

    if (failed) return <ListState failed action={<Button size="sm" onClick={load}>Try again</Button>}>Settings could not be loaded. Check that the server is running, then try again.</ListState>;
    if (!settings) return <ListState loading>Loading settings…</ListState>;

    const addressChanged = address.trim() !== (settings.ollamaBaseUrl || '');
    const runningChanged = concurrent !== String(settings.maxConcurrentGenerations) || keepAlive !== String(settings.keepAliveMinutes);

    return (
        <Container layout="flex-column" gap="3xl" padding="none" width="100%" maxWidth="720px">
            {!canManage && <ListState>Only an admin or owner can change these settings.</ListState>}
            <Section
                title="Where Ollama is"
                note="Ollama is the program that runs the models. Change this only if it is on a different address than usual."
                action={settings.ollamaBaseUrlIsDefault ? <Badge size="xs" color="tertiary">Standard address</Badge> : null}
            >
                <Rows>
                    <Row name="Ollama address" field>
                        <Input
                            size="sm"
                            aria-label="Ollama address"
                            value={address}
                            onChange={(event) => { setAddress(event.target.value); setTestResult(null); }}
                            disabled={!canManage}
                            width="100%"
                        />
                    </Row>
                </Rows>
                {testResult && <Typography as="p" size="xs" color={testResult.ok ? 'success' : 'error'} weight="semibold">{testResult.text}</Typography>}
                {canManage && (
                    <Actions>
                        {!settings.ollamaBaseUrlIsDefault && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setTestResult(null); save({ ollamaBaseUrl: '' }, 'Back to the standard Ollama address.'); }}>
                                Use the standard address
                            </Button>
                        )}
                        <Button size="sm" onClick={testConnection} disabled={busy || !address.trim()}>
                            <Icon name="FiActivity" />Test connection
                        </Button>
                        <Button size="sm" {...saveLook(addressChanged)} onClick={() => save({ ollamaBaseUrl: address.trim() }, 'Ollama address saved. It is in use now.')} disabled={busy || !address.trim()}>
                            <Icon name="FiSave" />{addressChanged ? 'Save changes' : 'Save'}
                        </Button>
                    </Actions>
                )}
            </Section>

            <Section title="Running models" note="How many replies are written at once, and how long a model stays in memory.">
                <Rows>
                    <Row name="Replies at the same time (1 to 8)" note="Keep this at 1 unless the graphics card has memory to spare." field>
                        <Input size="sm" aria-label="Replies at the same time (1 to 8)" value={concurrent} onChange={(event) => setConcurrent(event.target.value)} disabled={!canManage} width="100%" />
                    </Row>
                    <Row name="Minutes a model stays loaded" note="Longer means faster follow-ups; shorter frees memory sooner." field>
                        <Input size="sm" aria-label="Minutes a model stays loaded" value={keepAlive} onChange={(event) => setKeepAlive(event.target.value)} disabled={!canManage} width="100%" />
                    </Row>
                </Rows>
                {canManage && (
                    <Actions>
                        <Button size="sm" {...saveLook(runningChanged)} onClick={saveRunning} disabled={busy}><Icon name="FiSave" />{runningChanged ? 'Save changes' : 'Save'}</Button>
                    </Actions>
                )}
            </Section>
        </Container>
    );
};

const AccountTab = ({ user }) => {
    const { success, error: notifyError } = useNotification();
    const [profile, setProfile] = useState({
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        username: user?.username || '',
        email: user?.email || '',
        bio: user?.bio || ''
    });
    const [saved, setSaved] = useState(profile);
    const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
    const [busy, setBusy] = useState(null);
    const field = (key) => (event) => setProfile((now) => ({ ...now, [key]: event.target.value }));
    const secret = (key) => (event) => setPassword((now) => ({ ...now, [key]: event.target.value }));

    const run = async (name, work, done, fallback) => {
        setBusy(name);
        try {
            await work();
            success(done);
            return true;
        } catch (error) {
            notifyError(failText(error, fallback));
            return false;
        } finally {
            setBusy(null);
        }
    };

    const profileChanged = Object.keys(profile).some((key) => profile[key] !== saved[key]);
    const saveProfile = async () => {
        if (await run('profile', () => userService.updateProfile(profile), 'Profile updated.', 'The profile could not be updated.')) setSaved(profile);
    };

    const savePassword = async () => {
        if (password.next !== password.confirm) {
            notifyError('The two new passwords do not match.');
            return;
        }
        if (password.next.length < 8) {
            notifyError('A password needs at least 8 characters.');
            return;
        }
        const changed = await run('password', () => userService.changePassword(user._id || user.id, password.current, password.next), 'Password changed.', 'The password could not be changed.');
        if (changed) setPassword({ current: '', next: '', confirm: '' });
    };

    return (
        <Container layout="flex-column" gap="3xl" padding="none" width="100%" maxWidth="720px">
            <Section title="Profile" note="The same account is used in FilesystemOne and Makerspace One.">
                <Rows>
                    <Row name="First name" field>
                        <Input size="sm" aria-label="First name" value={profile.firstName} onChange={field('firstName')} width="100%" />
                    </Row>
                    <Row name="Last name" field>
                        <Input size="sm" aria-label="Last name" value={profile.lastName} onChange={field('lastName')} width="100%" />
                    </Row>
                    <Row name="Username" field>
                        <Input size="sm" aria-label="Username" value={profile.username} onChange={field('username')} width="100%" />
                    </Row>
                    <Row name="Email" field>
                        <Input size="sm" aria-label="Email" type="email" value={profile.email} onChange={field('email')} width="100%" />
                    </Row>
                    <Row name="Email check" note={user?.emailVerified ? 'This address is confirmed.' : 'Confirm this address to get account emails.'}>
                        <Badge size="xs" color={user?.emailVerified ? 'success' : 'warning'}>{user?.emailVerified ? 'Email verified' : 'Email not verified'}</Badge>
                        {!user?.emailVerified && (
                            <Button
                                size="xs"
                                variant="ghost"
                                disabled={busy === 'verify'}
                                onClick={() => run('verify', () => authService.sendVerificationEmail(), 'Verification email sent. Check your inbox.', 'The verification email could not be sent.')}
                            >
                                <Icon name="FiMail" />{busy === 'verify' ? 'Sending…' : 'Send verification email'}
                            </Button>
                        )}
                    </Row>
                    <Row name="Bio" note="Shown to other people." field align="start">
                        <Input size="sm" aria-label="Bio" multiline rows={3} placeholder="Tell others about yourself" value={profile.bio} onChange={field('bio')} width="100%" />
                    </Row>
                </Rows>
                <Actions>
                    <Button size="sm" {...saveLook(profileChanged)} disabled={busy === 'profile'} onClick={saveProfile}>
                        <Icon name="FiSave" />{busy === 'profile' ? 'Saving…' : 'Save changes'}
                    </Button>
                </Actions>
            </Section>

            <Section title="Change password">
                <Rows>
                    <Row name="Current password" field>
                        <Input size="sm" aria-label="Current password" type="password" value={password.current} onChange={secret('current')} width="100%" />
                    </Row>
                    <Row name="New password" note="At least 8 characters." field>
                        <Input size="sm" aria-label="New password" type="password" value={password.next} onChange={secret('next')} width="100%" />
                    </Row>
                    <Row name="Confirm new password" field>
                        <Input size="sm" aria-label="Confirm new password" type="password" value={password.confirm} onChange={secret('confirm')} width="100%" />
                    </Row>
                </Rows>
                <Actions>
                    <Button size="sm" {...saveLook(Boolean(password.current && password.next))} disabled={busy === 'password' || !password.current || !password.next} onClick={savePassword}>
                        <Icon name="FiLock" />{busy === 'password' ? 'Saving…' : 'Update password'}
                    </Button>
                </Actions>
            </Section>
        </Container>
    );
};

const SecurityTab = () => {
    const { success, error: notifyError } = useNotification();
    const [status, setStatus] = useState(null);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [setup, setSetup] = useState(null);
    const [code, setCode] = useState('');
    const [confirm, setConfirm] = useState({ password: '', token: '' });
    const [backupCodes, setBackupCodes] = useState(null);
    const [devices, setDevices] = useState(null);
    const settingUp = useRef(false);
    // A status that could not be read is shown as unknown, never as off: someone who has it on must not be told it is off.
    const [statusFailed, setStatusFailed] = useState(false);

    const loadStatus = useCallback(async () => {
        setLoadingStatus(true);
        try {
            setStatus(await authService.get2FAStatus());
            setStatusFailed(false);
        } catch {
            setStatus(null);
            setStatusFailed(true);
        } finally {
            setLoadingStatus(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
        authService.getDevices().then((result) => setDevices(result?.devices || [])).catch(() => setDevices([]));
    }, [loadStatus]);

    const startSetup = async () => {
        if (settingUp.current || setup) return;
        settingUp.current = true;
        try {
            setSetup(await authService.setup2FA());
        } catch (error) {
            notifyError(failText(error, 'Two-step sign-in could not be set up.'));
        } finally {
            settingUp.current = false;
        }
    };

    const finishSetup = async () => {
        try {
            const result = await authService.verifySetup2FA(code);
            success('Two-step sign-in is on. Save your backup codes.');
            setBackupCodes(result?.backupCodes || null);
            setSetup(null);
            setCode('');
            loadStatus();
        } catch (error) {
            notifyError(failText(error, 'That code was not accepted. Try again.'));
        }
    };

    const turnOff = async () => {
        try {
            await authService.disable2FA(confirm.password, confirm.token);
            success('Two-step sign-in is off.');
            setConfirm({ password: '', token: '' });
            setBackupCodes(null);
            loadStatus();
        } catch {
            notifyError('It could not be turned off. Check your password and code.');
        }
    };

    const fetchBackupCodes = async () => {
        try {
            setBackupCodes((await authService.getBackupCodes(confirm.password, confirm.token))?.backupCodes || []);
        } catch {
            notifyError('The backup codes could not be fetched. Check your password and code.');
        }
    };

    const enabled = Boolean(status?.enabled);
    const confirmFields = (
        <>
            <Input size="sm" label="Password" type="password" value={confirm.password} onChange={(event) => setConfirm((now) => ({ ...now, password: event.target.value }))} width="100%" />
            <Input size="sm" label="Code from your app" placeholder="000000" maxLength={6} value={confirm.token} onChange={(event) => setConfirm((now) => ({ ...now, token: event.target.value }))} width="100%" />
        </>
    );

    const setupGenie = (
        <Container layout="flex-column" gap="sm" padding="md" width="300px">
            {!setup ? (
                <Container layout="flex" align="center" gap="sm" padding="none">
                    <CircularProgress size="xs" />
                    <Typography as="p" size="xs" color="muted">Preparing…</Typography>
                </Container>
            ) : (
                <>
                    <Typography size="xs" weight="medium">1. Scan this code with your authenticator app</Typography>
                    {setup.qrCode && (
                        <Container layout="flex" justify="center" padding="none" width="100%">
                            <Image src={setup.qrCode} alt="Code to scan for two-step sign-in" width="160px" height="160px" />
                        </Container>
                    )}
                    {setup.manualEntryKey && (
                        <>
                            <Typography as="p" size="xxs" color="muted">Or type this key into the app:</Typography>
                            <Input size="xs" value={setup.manualEntryKey} readOnly width="100%" aria-label="Key to type into your authenticator app" />
                        </>
                    )}
                    <Typography size="xs" weight="medium">2. Enter the 6-digit code it shows</Typography>
                    <Input size="sm" placeholder="000000" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} width="100%" />
                    <Button size="sm" width="100%" disabled={code.length !== 6} onClick={finishSetup}>Check and turn on</Button>
                </>
            )}
        </Container>
    );

    const offGenie = (
        <Container layout="flex-column" gap="sm" padding="md" width="280px">
            <Typography size="xs" weight="medium">Confirm with your password and a current code</Typography>
            {confirmFields}
            <Button size="sm" color="error" width="100%" disabled={!confirm.password || !confirm.token} onClick={turnOff}>Turn off</Button>
        </Container>
    );

    const codesGenie = (
        <Container layout="flex-column" gap="sm" padding="md" width="280px">
            {backupCodes ? (
                <>
                    <Typography size="xs" weight="semibold">Backup codes</Typography>
                    <Typography as="p" size="xxs" color="muted">Each one works once. Keep them somewhere safe.</Typography>
                    <Container layout="grid" columns={2} gap="xs" padding="sm" width="100%" backgroundColor="surface">
                        {backupCodes.map((item) => <Typography key={item} size="xs" font="monospace">{item}</Typography>)}
                    </Container>
                    <Button size="sm" color="secondary" width="100%" onClick={() => setBackupCodes(null)}>Done</Button>
                </>
            ) : (
                <>
                    <Typography size="xs" weight="medium">Confirm with your password and a current code</Typography>
                    {confirmFields}
                    <Button size="sm" width="100%" disabled={!confirm.password || !confirm.token} onClick={fetchBackupCodes}>Show codes</Button>
                </>
            )}
        </Container>
    );

    return (
        <Container layout="flex-column" gap="3xl" padding="none" width="100%" maxWidth="720px">
            <Section title="Two-step sign-in" note="Adds a code from an authenticator app when you sign in.">
                <Rows>
                    <Row
                        name="Code from an authenticator app"
                        note={statusFailed
                            ? 'Two-step sign-in status could not be loaded.'
                            : enabled
                                ? 'On. You need your authenticator app each time you sign in.'
                                : 'Off. Turn it on to protect your account with a second step.'}
                    >
                        {loadingStatus ? <CircularProgress size="xs" /> : statusFailed ? (
                            <Button size="sm" onClick={loadStatus}><Icon name="FiRefreshCw" />Try again</Button>
                        ) : (
                            <>
                                <Badge size="xs" color={enabled ? 'success' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge>
                                {!enabled && (
                                    <Button size="sm" genie={setupGenie} genieTrigger="click" onGenieShow={startSetup}>
                                        <Icon name="FiShield" />Turn on
                                    </Button>
                                )}
                                {enabled && (
                                    <>
                                        <Button size="sm" variant="ghost" genie={codesGenie} genieTrigger="click"><Icon name="FiKey" />Backup codes</Button>
                                        <Button size="sm" variant="ghost" color="error" genie={offGenie} genieTrigger="click"><Icon name="FiShieldOff" />Turn off</Button>
                                    </>
                                )}
                            </>
                        )}
                    </Row>
                </Rows>
                {backupCodes && enabled && (
                    <Card layout="flex-column" gap="sm" width="100%" borderColor="primary">
                        <Typography as="h3" size="sm" weight="semibold">Save these backup codes now</Typography>
                        <Container layout="grid" columns="auto-sm" gap="xs" padding="none" width="100%">
                            {backupCodes.map((item) => <Typography key={item} size="xs" font="monospace">{item}</Typography>)}
                        </Container>
                        <Container layout="flex" padding="none"><Button size="xs" onClick={() => setBackupCodes(null)}>I have saved them</Button></Container>
                    </Card>
                )}
            </Section>

            <Section title="Signed-in devices" note="Browsers and computers that have signed in to your account.">
                {devices === null && <ListState loading>Loading your devices…</ListState>}
                {devices?.length === 0 && <ListState>No sign-in history yet. Devices appear here after they sign in.</ListState>}
                {devices?.length > 0 && (
                    <Container layout="grid" columns="auto" gap="md" padding="none" width="100%">
                        {devices.map((device, index) => (
                            <Card key={index} layout="flex-column" gap="xs" minWidth="0">
                                <Typography as="h3" size="sm" weight="semibold" truncate>{[device.browser, device.os].filter(Boolean).join(' on ') || 'Unknown device'}</Typography>
                                <Typography as="p" size="xxs" color="muted">Address: {device.ipAddress || '—'}</Typography>
                                <Typography as="p" size="xxs" color="muted">Place: {[device.location?.city, device.location?.country].filter(Boolean).join(', ') || '—'}</Typography>
                                <Typography as="p" size="xxs" color="muted">Last seen: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : '—'}</Typography>
                            </Card>
                        ))}
                    </Container>
                )}
            </Section>
        </Container>
    );
};

const ROLE_INFO = {
    CREATOR: { label: 'Creator', text: 'Create and share public content, including custom themes.' },
    ADMIN: { label: 'Admin', text: 'Download and remove models, change machine settings and manage users.' },
    OWNER: { label: 'Owner', text: 'Full access to this install.' }
};
const ROLE_COLORS = { OWNER: 'primary', ADMIN: 'warning', CREATOR: 'tertiary' };

const RolesTab = ({ user }) => {
    const { success, error: notifyError } = useNotification();
    const [role, setRole] = useState('CREATOR');
    const [reason, setReason] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(null);

    const pending = sent || (user?.roleApprovalStatus === 'PENDING' ? { roles: user.pendingRoles || [], reason: user.roleApprovalRequest?.reason } : null);
    const rejected = !sent && user?.roleApprovalStatus === 'REJECTED';

    const request = async () => {
        setSending(true);
        try {
            await authService.requestRoleElevation([role], reason.trim());
            success('Your request was sent to an administrator.');
            setSent({ roles: [role], reason: reason.trim() });
            setReason('');
        } catch (error) {
            notifyError(failText(error, 'The request could not be sent.'));
        } finally {
            setSending(false);
        }
    };

    return (
        <Container layout="flex-column" gap="3xl" padding="none" width="100%" maxWidth="720px">
            <Section
                title="Your roles"
                note="Roles decide what you can do here and in the sibling apps."
                action={(
                    <Container layout="flex" gap="xs" padding="none">
                        {(user?.roles || []).map((name) => <Badge key={name} size="sm" color={ROLE_COLORS[name] || 'secondary'}>{name}</Badge>)}
                    </Container>
                )}
            />

            {pending && (
                <Card layout="flex" align="center" gap="sm" width="100%" borderColor="secondary" wrap={false}>
                    <Icon name="FiClock" size="sm" color="warning" />
                    <Container layout="flex-column" gap="none" padding="none">
                        <Typography as="h3" size="sm" weight="semibold">A request is waiting for approval</Typography>
                        <Typography as="p" size="xs" color="muted">Asked for: {pending.roles.join(', ')}{pending.reason ? `. Reason: ${pending.reason}` : ''}</Typography>
                    </Container>
                </Card>
            )}

            {rejected && (
                <Card layout="flex" align="center" gap="sm" width="100%" wrap={false}>
                    <Icon name="FiXCircle" size="sm" color="error" />
                    <Container layout="flex-column" gap="none" padding="none">
                        <Typography as="h3" size="sm" weight="semibold">Your last request was turned down</Typography>
                        {user.roleApprovalRequest?.reason && <Typography as="p" size="xs" color="muted">Reason: {user.roleApprovalRequest.reason}</Typography>}
                    </Container>
                </Card>
            )}

            {!pending && (
                <Section title="Ask for a higher role" note="An administrator reviews each request.">
                    <Rows>
                        {Object.entries(ROLE_INFO).map(([name, info]) => (
                            <Row key={name} name={info.label} note={info.text}>
                                <Button size="xs" selected={role === name} onClick={() => setRole(name)}>
                                    {role === name && <Icon name="FiCheck" />}{role === name ? 'Chosen' : 'Choose'}
                                </Button>
                            </Row>
                        ))}
                        <Row name="Reason" note="Why do you need this role?" field align="start">
                            <Input size="sm" aria-label="Reason" multiline rows={3} placeholder="Why do you need this role?" value={reason} onChange={(event) => setReason(event.target.value)} width="100%" />
                        </Row>
                    </Rows>
                    <Actions>
                        <Button size="sm" {...saveLook(Boolean(reason.trim()))} disabled={sending || !reason.trim()} onClick={request}>
                            <Icon name="FiArrowUp" />{sending ? 'Sending…' : 'Send request'}
                        </Button>
                    </Actions>
                </Section>
            )}
        </Container>
    );
};

const BUILT_IN = ['modern', 'minimal', 'vibrant', 'admin', 'pink', 'terminal', 'brutalist', 'chalkboard', 'blueprint', 'darkroom'];
const COLOR_FIELDS = [
    ['primary', 'Primary'], ['primaryAccent', 'Primary accent'],
    ['secondary', 'Secondary'], ['secondaryAccent', 'Secondary accent'],
    ['tertiary', 'Tertiary'], ['tertiaryAccent', 'Tertiary accent'],
    ['success', 'Success'], ['warning', 'Warning'], ['error', 'Error'],
    ['background', 'Background'], ['surface', 'Surface'], ['surfaceAccent', 'Surface accent'],
    ['border', 'Border'], ['text', 'Text'], ['textContrast', 'Contrast text']
];
const RADII_FIELDS = [
    ['base', 'Base'], ['card', 'Cards'], ['input', 'Inputs'], ['button', 'Buttons'],
    ['checkbox', 'Checkboxes'], ['fab', 'Round buttons'], ['progress', 'Progress bars'], ['notification', 'Notifications']
];
const NEW_THEME = {
    name: '', slug: '', description: '', visibility: 'private', darkMode: false, pageBackground: '',
    colors: {
        primary: '#12355B', primaryAccent: '#1A4A7A', secondary: '#FF570A', secondaryAccent: '#CC4000',
        tertiary: '#A5D8FF', tertiaryAccent: '#70BFFF', success: '#1E7A3A', warning: '#E88500', error: '#CC2200',
        background: '#FFFFFF', surface: '#EAF5FF', surfaceAccent: '#C8EAFF', border: '#A5D8FF', text: '#12355B', textContrast: '#FFFFFF'
    },
    fonts: { primary: 'urbanist', secondary: 'montserrat-alternates', monospace: 'jetbrains-mono' },
    radii: { base: '0.375rem', card: '0.5rem', input: '0.375rem', button: '0.375rem', checkbox: '0.25rem', fab: '50%', progress: '9999px', notification: '0.5rem' }
};
const titleOf = (name) => name.charAt(0).toUpperCase() + name.slice(1);
// A theme may set one background for every page, clear them all, or leave each page its own.
const BACKGROUND_OPTIONS = [
    { value: '', label: 'Each page keeps its own' },
    { value: 'none', label: 'None: plain pages' },
    ...BACKGROUND_PATTERNS.map((name) => ({ value: name, label: titleOf(name) })),
    ...BACKGROUND_DYNAMIC.map((name) => ({ value: name, label: `${titleOf(name)} (moving)` }))
];
const slugify = (value = '') => value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50);
const idOf = (doc) => doc.id || doc._id;
const fontOptions = (kind) => listFontKeys(kind).map((key) => ({ value: key, label: key }));

const Swatches = ({ colors }) => (
    <Container layout="flex" gap="none" padding="none" wrap={false}>
        {colors.filter(Boolean).map((color, index) => (
            <Input key={index} type="color" size="xxs" width="26px" value={color} disabled aria-label={`Colour ${color}`} />
        ))}
    </Container>
);
const swatchesOf = (doc) => {
    const colors = doc?.tokens?.colors || {};
    return [colors.primary, colors.secondary, colors.tertiary, colors.background, colors.surface];
};

const ThemePreview = ({ theme }) => (
    <Container theme={theme} layout="flex" align="center" gap="xs" padding="sm" width="100%" backgroundColor="background" wrap={false}>
        <Button size="xxs" color="primary">Aa</Button>
        <Button size="xxs" color="secondary">Aa</Button>
        <Badge size="xs" color="tertiary">Tag</Badge>
        <Typography size="xxs" color="muted">Sample text</Typography>
    </Container>
);

const ThemeEditor = ({ initial, editingId, onSaved, onCancel }) => {
    const { success, error: notifyError } = useNotification();
    const [form, setForm] = useState(initial || NEW_THEME);
    const [slugTouched, setSlugTouched] = useState(Boolean(editingId));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        ensureFontsLoaded(listFontKeys());
    }, []);

    const part = (group, key, value) => setForm((now) => ({ ...now, [group]: { ...now[group], [key]: value } }));

    const save = async () => {
        if (!form.name.trim() || !form.slug.trim()) {
            notifyError('A theme needs a name and a short name.');
            return;
        }
        setSaving(true);
        const payload = {
            name: form.name.trim(),
            slug: form.slug,
            description: form.description.trim(),
            visibility: form.visibility,
            tokens: { darkMode: form.darkMode, colors: form.colors, fonts: form.fonts, ...(form.radii ? { radii: form.radii } : {}), pageBackground: form.pageBackground || '' },
            ...(form.forkedFrom ? { forkedFrom: form.forkedFrom } : {})
        };
        try {
            const result = editingId ? await themeService.updateTheme(editingId, payload) : await themeService.createTheme(payload);
            success(editingId ? 'Theme updated.' : 'Theme created.');
            onSaved(result.theme);
        } catch (error) {
            notifyError(failText(error, 'The theme could not be saved.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card layout="flex-column" gap="md" borderColor="primary" width="100%">
            <Container layout="flex" align="center" justify="between" gap="sm" padding="none" width="100%">
                <Typography as="h3" size="sm" weight="semibold">
                    {editingId ? 'Edit theme' : form.forkedFrom ? `Copy of ${form.forkedFromName || 'theme'}` : 'New theme'}
                </Typography>
                <Swatches colors={[form.colors.primary, form.colors.secondary, form.colors.tertiary, form.colors.background, form.colors.surface]} />
            </Container>
            <Container layout="grid" columns={2} gap="sm" padding="none" width="100%">
                <Input
                    size="sm"
                    label="Name"
                    value={form.name}
                    width="100%"
                    onChange={(event) => {
                        const name = event.target.value;
                        setForm((now) => ({ ...now, name, slug: slugTouched ? now.slug : slugify(name) }));
                    }}
                />
                <Input
                    size="sm"
                    label="Short name (used in links)"
                    value={form.slug}
                    width="100%"
                    onChange={(event) => { setSlugTouched(true); setForm((now) => ({ ...now, slug: slugify(event.target.value) })); }}
                />
            </Container>
            <Input size="sm" label="Description (optional)" value={form.description} width="100%" onChange={(event) => setForm((now) => ({ ...now, description: event.target.value }))} />
            <Container layout="flex" gap="md" align="end" padding="none">
                <Select
                    size="sm"
                    label="Who can see it"
                    width="260px"
                    options={[
                        { value: 'private', label: 'Private: only you' },
                        { value: 'unlisted', label: 'Unlisted: anyone with the link' },
                        { value: 'public', label: 'Public: listed for everyone' }
                    ]}
                    value={form.visibility}
                    onChange={(value) => setForm((now) => ({ ...now, visibility: value }))}
                />
                <Switch label="Dark theme" checked={form.darkMode} onChange={(event) => setForm((now) => ({ ...now, darkMode: event.target.checked }))} />
            </Container>

            <Divider margin="xs" />
            <Typography as="h4" size="sm" weight="semibold">Colours</Typography>
            <Container layout="grid" columns="auto-sm" gap="sm" padding="none" width="100%">
                {COLOR_FIELDS.map(([key, label]) => (
                    <Container key={key} layout="flex" align="center" gap="sm" padding="none" wrap={false}>
                        <Input type="color" size="sm" width="48px" value={form.colors[key] || '#000000'} onChange={(event) => part('colors', key, event.target.value)} aria-label={label} />
                        <Container layout="flex-column" gap="none" padding="none" minWidth="0">
                            <Typography as="p" size="xs" weight="medium">{label}</Typography>
                            <Typography as="p" size="xxs" color="muted" font="monospace">{form.colors[key]}</Typography>
                        </Container>
                    </Container>
                ))}
            </Container>

            <Divider margin="xs" />
            <Typography as="h4" size="sm" weight="semibold">Fonts</Typography>
            <Container layout="grid" columns={3} gap="sm" padding="none" width="100%">
                <Select size="sm" label="Main text" options={fontOptions('sans')} value={form.fonts.primary} onChange={(value) => part('fonts', 'primary', value)} width="100%" />
                <Select size="sm" label="Headings" options={fontOptions()} value={form.fonts.secondary} onChange={(value) => part('fonts', 'secondary', value)} width="100%" />
                <Select size="sm" label="Code" options={fontOptions('mono')} value={form.fonts.monospace} onChange={(value) => part('fonts', 'monospace', value)} width="100%" />
            </Container>

            <Divider margin="xs" />
            <Typography as="h4" size="sm" weight="semibold">Background</Typography>
            <Select
                size="sm"
                label="Page background"
                width="260px"
                options={BACKGROUND_OPTIONS}
                value={form.pageBackground || ''}
                onChange={(value) => setForm((now) => ({ ...now, pageBackground: value }))}
            />

            <Divider margin="xs" />
            <Typography as="h4" size="sm" weight="semibold">Corners</Typography>
            <Typography as="p" size="xxs" color="muted">Any CSS length works: 0 for sharp, 9999px for pills, 50% for circles.</Typography>
            <Container layout="grid" columns="auto-sm" gap="sm" padding="none" width="100%">
                {RADII_FIELDS.map(([key, label]) => (
                    <Input key={key} size="sm" label={label} value={form.radii?.[key] ?? ''} placeholder={NEW_THEME.radii[key]} onChange={(event) => part('radii', key, event.target.value)} width="100%" />
                ))}
            </Container>

            <Container layout="flex" justify="end" gap="xs" padding="none" width="100%">
                <Button size="sm" disabled={saving} onClick={onCancel}>Cancel</Button>
                <Button size="sm" color="secondary" variant="solid" disabled={saving} onClick={save}><Icon name="FiSave" />{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create theme'}</Button>
            </Container>
        </Card>
    );
};

// The newer themes live only in the web app, so a copy starts from them here; the accents a saved theme needs
// are taken from the colours they follow.
const galleryCopy = (slug) => {
    const doc = GALLERY_THEMES.find((entry) => entry.slug === slug);
    if (!doc) return null;
    const { colors } = doc.tokens;
    return { ...doc, tokens: { ...doc.tokens, colors: { ...colors, primaryAccent: colors.primary, secondaryAccent: colors.secondary, tertiaryAccent: colors.tertiary } } };
};

// One theme on the account is the favourite: every app opens in it on a fresh visit.
const FavoriteButton = ({ name, favorite, onFavorite }) => (
    <Button
        size="xs"
        variant="ghost"
        color={favorite ? 'error' : 'default'}
        aria-pressed={favorite}
        aria-label={favorite ? `${name} is your favourite theme. Press to remove it.` : `Make ${name} your favourite theme`}
        title={favorite ? 'Your favourite: every app opens in it. Press to remove.' : 'Make this your favourite: every app opens in it'}
        onClick={onFavorite}
    >
        <Icon name={favorite ? 'FaHeart' : 'FiHeart'} />
    </Button>
);

const ThemeCard = ({ doc, applied, favorite, onFavorite, onApply, onFork, onEdit, onDelete }) => (
    <Card layout="flex-column" gap="sm" minWidth="0" borderColor={applied ? 'primary' : null}>
        <Container layout="flex" align="center" gap="xs" padding="none" width="100%" wrap={false}>
            <Typography as="h3" size="sm" weight="semibold" truncate>{doc.name}</Typography>
            {applied && <Badge size="xs" color="success">In use</Badge>}
            {!doc.isPreset && doc.visibility && doc.visibility !== 'private' && <Badge size="xs" color="tertiary">{doc.visibility}</Badge>}
            <Container layout="flex" justify="end" padding="none" width="100%"><FavoriteButton name={doc.name} favorite={favorite} onFavorite={onFavorite} /></Container>
        </Container>
        {doc.description && <Typography as="p" size="xxs" color="muted" truncate>{doc.description}</Typography>}
        <Swatches colors={swatchesOf(doc)} />
        <Container layout="flex" gap="xs" padding="none">
            <Button size="xs" variant="ghost" disabled={applied} onClick={onApply}><Icon name="FiCheck" />{applied ? 'In use' : 'Use'}</Button>
            {onFork && <Button size="xs" variant="ghost" onClick={onFork}><Icon name="FiCopy" />Copy</Button>}
            {onEdit && <Button size="xs" variant="ghost" onClick={onEdit}><Icon name="FiEdit2" />Edit</Button>}
            {onDelete && <Button size="xs" variant="ghost" color="error" onClick={onDelete}><Icon name="FiTrash2" />Delete</Button>}
        </Container>
    </Card>
);

const AppearanceTab = ({ user }) => {
    const { currentTheme, mode, setMode, modeOf, switchTheme, applyCustomTheme, clearCustomTheme, customTheme, themes } = useTheme();
    const { saveFavoriteTheme } = useAuth();
    const favoriteName = user?.favoriteTheme?.split(':')[0] || null;
    const toggleFavorite = (themeName) => saveFavoriteTheme(favoriteName === themeName ? null : `${themeName}:${modeOf(themeName)}`);
    const { success, error: notifyError } = useNotification();
    const [presets, setPresets] = useState([]);
    const [mine, setMine] = useState([]);
    const [shared, setShared] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editor, setEditor] = useState(null);
    const canCreate = ['CREATOR', 'SUPER_CREATOR', 'ADMIN', 'OWNER'].some((name) => (user?.roles || []).includes(name));

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [presetResult, mineResult, publicResult] = await Promise.all([
                themeService.getPresets().catch(() => ({ themes: [] })),
                themeService.getMyThemes().catch(() => ({ themes: [] })),
                themeService.getPublicThemes({ limit: 12 }).catch(() => ({ themes: [] }))
            ]);
            setPresets(presetResult.themes || []);
            setMine(mineResult.themes || []);
            const own = new Set((mineResult.themes || []).map((doc) => String(idOf(doc))));
            setShared((publicResult.themes || []).filter((doc) => !own.has(String(idOf(doc)))));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const draftFrom = (doc, fork) => {
        const tokens = doc.tokens || {};
        return {
            name: fork ? `${doc.name} (copy)` : doc.name,
            slug: fork ? slugify(`${doc.slug}-copy`) : doc.slug,
            description: doc.description || '',
            visibility: fork ? 'private' : doc.visibility || 'private',
            darkMode: Boolean(tokens.darkMode),
            pageBackground: tokens.pageBackground || tokens.effects?.['page-background'] || '',
            colors: { ...NEW_THEME.colors, ...(tokens.colors || {}) },
            fonts: { ...NEW_THEME.fonts, ...(tokens.fonts || {}) },
            radii: { ...NEW_THEME.radii, ...(tokens.radii || {}) },
            ...(fork ? { forkedFrom: idOf(doc), forkedFromName: doc.name } : {})
        };
    };
    const openFork = (doc) => setEditor({ initial: draftFrom(doc, true), editingId: null });
    const openEdit = (doc) => setEditor({ initial: draftFrom(doc, false), editingId: idOf(doc) });

    const remove = async (doc) => {
        try {
            await themeService.deleteTheme(idOf(doc));
            success(`Theme "${doc.name}" deleted.`);
            if (customTheme?.slug === doc.slug) clearCustomTheme();
            load();
        } catch (error) {
            notifyError(failText(error, 'The theme could not be deleted.'));
        }
    };

    const saved = (theme) => {
        setEditor(null);
        load();
        if (theme && customTheme && theme.slug === customTheme.slug) applyCustomTheme(theme);
    };

    const usingCustom = (doc) => customTheme?.slug === doc.slug && currentTheme === `custom-${doc.slug}`;
    const applyDoc = (doc) => {
        applyCustomTheme(doc);
        success(`Theme "${doc.name}" is in use.`);
    };

    return (
        <Container layout="flex-column" gap="3xl" padding="none" width="100%">
            <Section title="Built-in themes" note="Use one as it is, or copy it as the start of your own. Every theme has a light and a dark variant.">
                <Switch size="sm" label={`Use the dark variant of ${themes?.[currentTheme]?.name || 'this theme'}`} checked={mode === 'dark'} onChange={() => setMode(mode === 'dark' ? 'light' : 'dark')} />
                <Container layout="grid" columns="auto" gap="md" padding="none" width="100%">
                    {BUILT_IN.map((slug) => {
                        const preset = presets.find((doc) => doc.slug === slug) || galleryCopy(slug);
                        const applied = currentTheme === slug;
                        return (
                            <Card key={slug} layout="flex-column" gap="sm" minWidth="0" borderColor={applied ? 'primary' : null}>
                                <Container layout="flex" align="center" justify="between" padding="none" width="100%" wrap={false}>
                                    <Typography as="h3" size="sm" weight="semibold">{themes?.[slug]?.name || slug}</Typography>
                                    <Container layout="flex" align="center" justify="end" gap="xs" padding="none" wrap={false}>
                                        {applied && <Badge size="xs" color="success">In use</Badge>}
                                        <FavoriteButton name={themes?.[slug]?.name || slug} favorite={favoriteName === slug} onFavorite={() => toggleFavorite(slug)} />
                                    </Container>
                                </Container>
                                <ThemePreview theme={slug} />
                                <Container layout="flex" gap="xs" padding="none" wrap={false}>
                                    <Button size="xs" variant="ghost" disabled={applied} onClick={() => switchTheme(slug)}><Icon name="FiCheck" />{applied ? 'In use' : 'Use'}</Button>
                                    {canCreate && preset && <Button size="xs" variant="ghost" onClick={() => openFork(preset)}><Icon name="FiCopy" />Copy</Button>}
                                </Container>
                            </Card>
                        );
                    })}
                </Container>
            </Section>

            <Section
                title="My themes"
                note={canCreate ? null : 'Making your own themes needs a Creator role or above. Ask for one under Roles.'}
                action={canCreate && !editor ? (
                    <Button size="sm" onClick={() => setEditor({ initial: null, editingId: null })}><Icon name="FiPlus" />New theme</Button>
                ) : null}
            >
                {editor && <ThemeEditor initial={editor.initial} editingId={editor.editingId} onSaved={saved} onCancel={() => setEditor(null)} />}
                {loading && <ListState loading>Loading your themes…</ListState>}
                {!loading && mine.length === 0 && !editor && <ListState>{canCreate ? 'No themes of your own yet. Choose New theme to make one.' : 'No themes of your own yet.'}</ListState>}
                {!loading && mine.length > 0 && (
                    <Container layout="grid" columns="auto" gap="md" padding="none" width="100%">
                        {mine.map((doc) => (
                            <ThemeCard
                                key={idOf(doc)}
                                doc={doc}
                                applied={usingCustom(doc)}
                                favorite={favoriteName === `custom-${doc.slug}`}
                                onFavorite={() => toggleFavorite(`custom-${doc.slug}`)}
                                onApply={() => applyDoc(doc)}
                                onFork={canCreate ? () => openFork(doc) : null}
                                onEdit={canCreate ? () => openEdit(doc) : null}
                                onDelete={canCreate ? () => remove(doc) : null}
                            />
                        ))}
                    </Container>
                )}
            </Section>

            {shared.length > 0 && (
                <Section title="Shared themes" note="Public themes made by other people.">
                    <Container layout="grid" columns="auto" gap="md" padding="none" width="100%">
                        {shared.map((doc) => (
                            <ThemeCard key={idOf(doc)} doc={doc} applied={usingCustom(doc)} favorite={favoriteName === `custom-${doc.slug}`} onFavorite={() => toggleFavorite(`custom-${doc.slug}`)} onApply={() => applyDoc(doc)} onFork={canCreate ? () => openFork(doc) : null} />
                        ))}
                    </Container>
                </Section>
            )}
        </Container>
    );
};

const TABS = [
    { id: 'ai', label: 'AI and Ollama', icon: 'FiCpu', note: 'Connection and running models' },
    { id: 'appearance', label: 'Appearance', icon: 'FiDroplet', note: 'Themes' },
    { id: 'account', label: 'Account', icon: 'FiUser', note: 'Profile and password' },
    { id: 'security', label: 'Security', icon: 'FiShield', note: 'Two-step sign-in and devices' },
    { id: 'roles', label: 'Roles', icon: 'FiBriefcase', note: 'What you are allowed to do' }
];

const SettingsPage = () => {
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const tab = TABS.some((item) => item.id === params.get('tab')) ? params.get('tab') : 'ai';
    const open = (id) => setParams({ tab: id }, { replace: true });

    return (
        <Page
            title="Settings"
            lead={user?.username ? `Signed in as ${user.username}.` : 'Your account and this install.'}
            layout="flex-column"
            gap="xl"
        >
            <ButtonGroup size="sm" selectable={false} wrap>
                {TABS.map((item) => (
                    <Button key={item.id} size="sm" selected={tab === item.id} title={item.note} onClick={() => open(item.id)}>
                        <Icon name={item.icon} />{item.label}
                    </Button>
                ))}
            </ButtonGroup>

            {tab === 'ai' && <AiTab />}
            {tab === 'appearance' && <AppearanceTab user={user} />}
            {tab === 'account' && <AccountTab user={user} />}
            {tab === 'security' && <SecurityTab />}
            {tab === 'roles' && <RolesTab user={user} />}
        </Page>
    );
};

export default SettingsPage;
