import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useNotification } from '@contexts/NotificationContext';
import { Container, Input, Button } from '@components/Components';
import { AuthCard } from './LoginPage';

export const SignupPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        roles: ['USER']
    });
    const [isLoading, setIsLoading] = useState(false);
    const { signup } = useAuth();
    const { error: showError, success: showSuccess } = useNotification();

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const validateForm = () => {
        // Check if all required fields are filled
        const requiredFields = ['firstName', 'lastName', 'username', 'email', 'password', 'confirmPassword'];
        
        for (const field of requiredFields) {
            if (!formData[field]) {
                showError('Fill in every field to create an account.');
                return false;
            }
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) return;

        setIsLoading(true);

        try {
            const signupData = { ...formData };
            delete signupData.confirmPassword;

            const result = await signup(signupData);
            
            if (result.success) {
                navigate('/'); // Navigate to dashboard after successful signup
            } else {
                showError(result.error || 'The account could not be created. Try again.');
            }
        } catch {
        } finally {
            setIsLoading(false);
        }
    };

    const isFormValid =
        formData.firstName &&
        formData.lastName &&
        formData.username &&
        formData.email &&
        formData.password &&
        formData.confirmPassword;

    return (
        <AuthCard
            title="Create an account"
            lead="One sign-in for Mollama and your FilesystemOne files."
            maxWidth="520px"
            onKeyDown={(event) => {
                if (event.key === 'Enter') handleSubmit(event);
            }}
            onSubmit={handleSubmit}
            footer={(
                <Button size="sm" variant="ghost" align="start" onClick={() => navigate('/login')}>
                    Already have an account? Sign in
                </Button>
            )}
        >
            <Container layout="grid" columns={2} gap="md" padding="none" width="100%">
                <Input name="firstName" label="First name" value={formData.firstName} onChange={handleInputChange} required width="100%" autoComplete="given-name" />
                <Input type="text" name="lastName" label="Last name" value={formData.lastName} onChange={handleInputChange} required width="100%" autoComplete="family-name" />
            </Container>
            <Input type="text" name="username" label="Username" value={formData.username} onChange={handleInputChange} required width="100%" autoComplete="username" />
            <Input type="email" name="email" label="Email address" value={formData.email} onChange={handleInputChange} required width="100%" autoComplete="email" />
            <Container layout="grid" columns={2} gap="md" padding="none" width="100%">
                <Input type="password" name="password" label="Password" value={formData.password} onChange={handleInputChange} required width="100%" autoComplete="new-password" />
                <Input type="password" name="confirmPassword" label="Confirm password" value={formData.confirmPassword} onChange={handleInputChange} required width="100%" confirmField={formData.password} autoComplete="new-password" />
            </Container>
            <Button type="submit" size="lg" color="secondary" variant="solid" width="100%" disabled={!isFormValid || isLoading} onClick={handleSubmit}>
                {isLoading ? 'Creating your account…' : 'Create an account'}
            </Button>
        </AuthCard>
    );
};

export default SignupPage;
