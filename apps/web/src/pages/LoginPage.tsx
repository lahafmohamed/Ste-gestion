import { useRef, useState } from "react";
import { APP_NAME } from "@ste/shared";
import { authApi } from "../lib/api";
import { setSession } from "../lib/auth";
import Button from "../components/ui/Button";
import { FormError } from "../components/ui/Feedback";
import Input, { Field, inputErrorCls } from "../components/ui/Input";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Validation locale (noValidate) : bulles natives du navigateur remplacées
  // par des erreurs inline stylées, annoncées via aria-describedby.
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Incrément à chaque échec : re-monte le bloc d'erreur pour rejouer la
  // secousse quand la même erreur revient deux fois de suite.
  const [errorKey, setErrorKey] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation au submit ; focus sur le premier champ invalide.
    const trimmed = email.trim();
    const errs: typeof fieldErrors = {};
    if (!trimmed) errs.email = "L'email est requis.";
    else if (!/^\S+@\S+$/.test(trimmed)) errs.email = "Format d'email invalide.";
    if (!password) errs.password = "Le mot de passe est requis.";
    setFieldErrors(errs);
    if (errs.email) {
      emailRef.current?.focus();
      return;
    }
    if (errs.password) {
      passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.login({ email: trimmed, password });
      setSession(res.token, res.user);
      onLogin();
    } catch (err) {
      setError((err as Error).message);
      setErrorKey((k) => k + 1);
      // Reprendre la saisie au premier champ : l'échec vient des identifiants.
      emailRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  const emailInvalid = Boolean(fieldErrors.email || error);
  const passwordInvalid = Boolean(fieldErrors.password || error);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand-50 px-4">
      <form
        noValidate
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-brand-200 bg-white p-6 shadow-sm motion-safe:animate-rise-in"
      >
        <h1 className="text-xl font-semibold text-brand-900">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-brand-500">Connexion à la gestion scierie.</p>

        <Field
          label="Email"
          className="mt-5"
          error={fieldErrors.email}
          errorId="login-email-error"
        >
          <Input
            ref={emailRef}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
            }}
            placeholder="admin@local"
            className={fieldErrors.email ? inputErrorCls : ""}
            aria-invalid={emailInvalid || undefined}
            aria-describedby={
              fieldErrors.email ? "login-email-error" : error ? "login-error" : undefined
            }
          />
        </Field>

        <Field
          label="Mot de passe"
          className="mt-3"
          error={fieldErrors.password}
          errorId="login-password-error"
        >
          <Input
            ref={passwordRef}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
            }}
            className={fieldErrors.password ? inputErrorCls : ""}
            aria-invalid={passwordInvalid || undefined}
            aria-describedby={
              fieldErrors.password ? "login-password-error" : error ? "login-error" : undefined
            }
          />
        </Field>

        {/* Zone d'annonce stable : présente dès le rendu, le lecteur d'écran
            annonce le texte quand il apparaît (role="alert" inséré à la volée
            est ignoré par certains lecteurs). */}
        <div role="alert" id="login-error" className="mt-3 empty:mt-0">
          {error && (
            <div key={errorKey} className="motion-safe:animate-shake">
              <FormError>{error}</FormError>
            </div>
          )}
        </div>

        <Button type="submit" variant="primary" size="lg" disabled={loading} className="mt-5 w-full">
          {loading && (
            <span
              aria-hidden="true"
              className="size-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin"
            />
          )}
          Se connecter
        </Button>
      </form>
    </main>
  );
}
