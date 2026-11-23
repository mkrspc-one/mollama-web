import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useNotification } from '@contexts/NotificationContext';
import { Input, Button } from '@components/Components';
import { AuthCard } from './LoginPage';

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

export default ForgotPasswordPage;
