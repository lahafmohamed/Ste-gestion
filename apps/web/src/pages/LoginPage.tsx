import { useState } from "react";
import { APP_NAME } from "@ste/shared";
import { authApi } from "../lib/api";
import { setSession } from "../lib/auth";
import Button from "../components/ui/Button";
import { FormError } from "../components/ui/Feedback";
import Input, { Field } from "../components/ui/Input";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.login({ email: email.trim(), password });
      setSession(res.token, res.user);
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-brand-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-brand-900">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-brand-500">Connexion à la gestion scierie.</p>

        <Field label="Email" className="mt-5">
          <Input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@local"
          />
        </Field>

        <Field label="Mot de passe" className="mt-3">
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && (
          <div className="mt-3">
            <FormError>{error}</FormError>
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={loading} className="mt-5 w-full">
          {loading ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </div>
  );
}
