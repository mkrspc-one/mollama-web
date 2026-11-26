import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useNotification } from '@contexts/NotificationContext';
import { Input, Button, Typography } from '@components/Components';
import { AuthCard } from './LoginPage';
import authService from '../client/auth.client';

export const ForgotPasswordPage = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const { forgotPassword } = useAuth();
    const { error: showError, success: showSuccess } = useNotification();

    const handleEmailChange = (e) => {
        setEmail(e.target.value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Simple validation - just check if email is provided
        if (!email) {
            showError('Enter your email address.');
            return;
        }
        
        setIsLoading(true);

        try {
            const result = await forgotPassword(email);
            
            if (result.success) {
                setIsSubmitted(true);
            } else {
                showError(result.error || 'The reset link could not be sent. Try again.');
            }
        } catch {
        } finally {
            setIsLoading(false);
        }
    };

    if (isSubmitted) {
        return (
            <AuthCard
                title="Check your email"
                lead={`We sent password reset instructions to ${email}. Open the link in that email to choose a new password.`}
                onSubmit={(event) => event.preventDefault()}
            >
                <Button size="lg" width="100%" onClick={() => navigate('/login')}>
                    Back to sign in
                </Button>
            </AuthCard>
        );
    }

    return (
        <AuthCard
            title="Reset your password"
            lead="Enter your email address and we will send you a link to choose a new password."
            onSubmit={handleSubmit}
            footer={(
                <Button size="sm" variant="ghost" align="start" onClick={() => navigate('/login')}>
                    Back to sign in
                </Button>
            )}
        >
            <Input type="email" name="email" label="Email address" value={email} onChange={handleEmailChange} required width="100%" autoComplete="email" />
            <Button type="submit" size="lg" color="secondary" variant="solid" width="100%" disabled={!email || isLoading} onClick={handleSubmit}>
                {isLoading ? 'Sending the link…' : 'Send reset link'}
            </Button>
        </AuthCard>
    );
};

// Opened from the link in a password reset email.
export const ResetPasswordPage = () => {
    const navigate = useNavigate();
    const { token } = useParams();
    const { resetPassword } = useAuth();
    const [password, setPassword] = useState('');
    const [again, setAgain] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const differs = again.length > 0 && again !== password;

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!password || differs) return;
        setIsLoading(true);
        try {
            await resetPassword(token, password);
            navigate('/', { replace: true });
        } catch {
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthCard
            title="Choose a new password"
            lead="Use 8 to 30 characters with an uppercase letter, a lowercase letter, a number and a symbol."
            onSubmit={handleSubmit}
            footer={(
                <Button size="sm" variant="ghost" align="start" onClick={() => navigate('/forgot-password')}>
                    Send a new link
                </Button>
            )}
        >
            <Input type="password" name="password" label="New password" value={password} onChange={(event) => setPassword(event.target.value)} required width="100%" autoComplete="new-password" />
            <Input type="password" name="confirmPassword" label="New password again" value={again} onChange={(event) => setAgain(event.target.value)} required width="100%" autoComplete="new-password" validationState={differs ? 'error' : 'default'} />
            {differs && <Typography size="xs" color="error">The two passwords differ.</Typography>}
            <Button type="submit" size="lg" color="secondary" variant="solid" width="100%" disabled={!password || !again || differs || isLoading} onClick={handleSubmit}>
                {isLoading ? 'Saving…' : 'Save new password'}
            </Button>
        </AuthCard>
    );
};

// Opened from the link in a verification email, signed in or not. A link works once, so it is sent once.
export const VerifyEmailPage = () => {
    const { token } = useParams();
    const { user } = useAuth();
    const [state, setState] = useState({ status: 'checking', message: '' });
    const sent = useRef(null);

    useEffect(() => {
        if (sent.current === token) return;
        sent.current = token;
        authService.verifyEmail(token)
            .then((reply) => setState({ status: 'done', message: reply.message }))
            .catch((error) => setState({ status: 'failed', message: error.response?.data?.message || 'This link could not be checked. Try again.' }));
    }, [token]);

    // A full load, so the account is read again with the email marked as confirmed.
    const go = (path) => window.location.assign(path);

    const titles = { checking: 'Confirming your email…', done: 'Email confirmed', failed: 'This link did not work' };
    const leads = {
        checking: 'One moment.',
        done: 'Your email address is confirmed. Everything that needs it is now open to you.',
        failed: `${state.message.replace(/[.!]?$/, '.')} Links last 24 hours and work once; you can send a new one from Settings, under Account.`
    };
    return (
        <AuthCard title={titles[state.status]} lead={leads[state.status]} onSubmit={(event) => event.preventDefault()}>
            {state.status === 'checking' && <Typography size="xs" color="muted">Checking the link…</Typography>}
            {state.status !== 'checking' && (
                user
                    ? <Button size="lg" width="100%" onClick={() => go('/settings?tab=account')}>Open Settings</Button>
                    : <Button size="lg" width="100%" onClick={() => go('/login')}>Sign in</Button>
            )}
        </AuthCard>
    );
};

export default ForgotPasswordPage;
