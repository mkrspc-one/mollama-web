import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useNotification } from '@contexts/NotificationContext';
import { 
  Page, 
  Container, 
  Card, 
  Input, 
  Button, 
  Typography, 
  Icon 
} from '@components/Components';

// The one frame of the sign-in, sign-up and password pages: the name, what this step is, the form, then the way out.
export const AuthCard = ({ title, lead = null, maxWidth = '440px', footer = null, children, ...form }) => (
  <Page layout="flex" align="center" justify="center" background="rings" backgroundFade="radial">
    <Card layout="flex-column" padding="xl" gap="lg" width="100%" maxWidth={maxWidth} wrap={false}>
      <Container layout="flex-column" gap="sm" padding="none" width="100%" wrap={false}>
        <Container layout="flex" align="center" gap="xs" padding="none" wrap={false}>
          <Icon name="FiCpu" size="md" color="primary" />
          <Typography size="md" weight="bold" font="secondary">Mollama</Typography>
        </Container>
        <Typography as="h1" size="lg" weight="semibold" font="secondary">{title}</Typography>
        {lead && <Typography as="p" size="xs" color="muted" margin="none">{lead}</Typography>}
      </Container>
      <Container as="form" layout="flex-column" gap="md" padding="none" width="100%" wrap={false} {...form}>
        {children}
      </Container>
      {footer}
    </Card>
  </Page>
);

export const LoginPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const { login, resume, continueSession, signOutAway } = useAuth();
  const { error: showError, success: showSuccess } = useNotification();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Simple validation - just check if fields are filled
    if (!formData.identifier || !formData.password) {
      if (!formData.identifier) {
        showError('Enter your email address or username.');
      } else if (!formData.password) {
        showError('Enter your password.');
      }
      return;
    }
    
    setIsLoading(true);

    try {
      const result = await login(twoFactorStep ? { ...formData, twoFactorToken: twoFactorToken.trim() } : formData);

      if (result.requiresTwoFactor) {
        setTwoFactorStep(true);
        return;
      }

      if (result.success) {
        showSuccess('Signed in.');
        navigate('/'); // Navigate to dashboard after successful login
      } else {
        showError(result.error || 'That sign-in did not work. Check your username and password.');
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = twoFactorStep
    ? twoFactorToken.trim().length >= 6
    : formData.identifier && formData.password;

  if (resume) {
    const carryOn = async () => {
      setIsLoading(true);
      try {
        navigate(await continueSession());
      } catch {
      } finally {
        setIsLoading(false);
      }
    };
    return (
      <AuthCard
        title="You were away for a while"
        lead="Continue where you left off. No password is needed."
        onSubmit={(event) => { event.preventDefault(); carryOn(); }}
        footer={(
          <Button size="sm" variant="ghost" disabled={isLoading} onClick={signOutAway}>
            Not you? Sign out
          </Button>
        )}
      >
        <Input type="text" name="identifier" label="Username" value={resume.username} readOnly width="100%" autoComplete="username" />
        <Button type="submit" size="lg" color="secondary" variant="solid" width="100%" disabled={isLoading}>
          {isLoading ? 'Continuing…' : `Continue as ${resume.username}`}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={twoFactorStep ? 'Two-factor sign-in' : 'Sign in'}
      lead={twoFactorStep
        ? 'Enter the 6-digit code from your authenticator app, or a backup code.'
        : 'Use your username or your email address.'}
      onKeyDown={(event) => {
        if (event.key === 'Enter') handleSubmit(event);
      }}
      onSubmit={handleSubmit}
      footer={(
        <Container layout="flex-column" gap="xs" padding="none" width="100%" wrap={false}>
          <Button size="sm" variant="ghost" align="start" onClick={() => navigate('/forgot-password')}>
            Forgot your password?
          </Button>
          <Button size="sm" variant="ghost" align="start" onClick={() => navigate('/signup')}>
            No account yet? Create an account
          </Button>
        </Container>
      )}
    >
      {twoFactorStep && (
        <Input
          type="text"
          name="twoFactorToken"
          label="Authentication code"
          value={twoFactorToken}
          onChange={(event) => setTwoFactorToken(event.target.value)}
          required
          width="100%"
          maxLength={20}
          autoComplete="one-time-code"
        />
      )}

      {!twoFactorStep && (
        <Input
          type="text"
          name="identifier"
          label="Email or username"
          value={formData.identifier}
          onChange={handleInputChange}
          required
          width="100%"
          autoComplete="username"
        />
      )}

      {!twoFactorStep && (
        <Input
          type="password"
          name="password"
          label="Password"
          value={formData.password}
          onChange={handleInputChange}
          required
          width="100%"
          autoComplete="current-password"
        />
      )}

      <Button type="submit" size="lg" color="secondary" variant="solid" width="100%" disabled={!isFormValid || isLoading} onClick={handleSubmit}>
        {isLoading ? 'Signing in…' : 'Sign in'}
      </Button>

      {twoFactorStep && (
        <Button type="button" size="md" width="100%" disabled={isLoading} onClick={() => { setTwoFactorStep(false); setTwoFactorToken(''); }}>
          Back to sign in
        </Button>
      )}
    </AuthCard>
  );
};

export default LoginPage;
