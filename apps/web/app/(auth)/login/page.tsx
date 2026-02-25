'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ArrowRight, Sparkles } from 'lucide-react';
import { useSendMagicLink, useDevLogin } from '@/lib/queries/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);
  const sendMagicLink = useSendMagicLink();
  const devLogin = useDevLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await sendMagicLink.mutateAsync(data.email);
      setEmailSent(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send magic link',
        variant: 'destructive',
      });
    }
  };

  const handleDevLogin = async () => {
    try {
      await devLogin.mutateAsync('test@ledgly.dev');
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Dev login failed',
        variant: 'destructive',
      });
    }
  };

  if (emailSent) {
    return (
      <div className="text-center animate-in-up">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-lg glow-md animate-in-scale">
          <Mail className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-muted-foreground mb-6">
          We sent a sign-in link to{' '}
          <span className="text-foreground font-medium">{getValues('email')}</span>
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Click the link in the email to sign in. The link will expire in 15 minutes.
        </p>
        <Button
          variant="outline"
          onClick={() => setEmailSent(false)}
          className="w-full"
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-in-up">
      {/* Logo */}
      <div className="w-16 h-16 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-lg glow-md animate-in-scale">
        <span className="text-primary-foreground font-bold text-2xl">L</span>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Welcome to Ledgly</h1>
        <p className="text-muted-foreground">
          Sign in to manage your organization finances
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email address
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            className="h-12 bg-secondary/50 border-border/50 focus:border-primary"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-12 bg-gradient-to-r from-primary to-blue-400 hover:opacity-90 transition-opacity font-medium"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            'Sending...'
          ) : (
            <>
              Continue with Email
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-border/50">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>No password needed. We'll send you a magic link.</span>
        </div>
      </div>

      {/* Dev Login - only in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6 pt-6 border-t border-border/50">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleDevLogin}
            disabled={devLogin.isPending}
          >
            {devLogin.isPending ? 'Logging in...' : 'Dev Login (Skip Auth)'}
          </Button>
        </div>
      )}
    </div>
  );
}
