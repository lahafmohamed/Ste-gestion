import { useRef, useState } from "react";
import { authApi } from "../lib/api";
import { setSession } from "../lib/auth";
import LogEnd from "../components/LogEnd";
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
    // Deux temps : le bois (panneau teck, une bille vue en bout avec son
    // numéro peint, comme au parc) et le geste (le formulaire). Téléphone : le
    // panneau devient un bandeau sous lequel la carte de connexion vient se poser.
    <main className="min-h-dvh bg-ground lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="relative h-44 overflow-hidden bg-accent-900 sm:h-52 lg:h-auto lg:min-h-dvh">
        <LogEnd className="pointer-events-none absolute -right-24 -top-28 w-[26rem] max-w-none sm:-right-10 sm:-top-36 sm:w-[30rem] lg:-bottom-56 lg:-left-40 lg:right-auto lg:top-auto lg:w-[50rem] xl:w-[56rem]" />
        <div className="relative hidden max-w-xl p-12 lg:block xl:p-16">
          <p className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-5xl">
            Le bois, du camion au conteneur.
          </p>
          <p className="mt-4 max-w-sm text-pretty text-base leading-relaxed text-accent-200">
            Réception, étalage, débitage, stock et empotage — au parc comme au bureau.
          </p>
        </div>
      </div>

      <div className="relative -mt-14 flex justify-center px-4 pb-10 lg:mt-0 lg:items-center lg:bg-white lg:px-12 lg:pb-0">
        <form
          noValidate
          onSubmit={submit}
          className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-dialog motion-safe:animate-rise-in sm:p-7 lg:rounded-none lg:p-0 lg:shadow-none"
        >
          {/* Logo complet ici seulement : assez de place pour que la tagline soit lisible. */}
          <img
            src="/logo-ste.png"
            alt="STE — Sustainable Teck Exports"
            className="mb-8 w-full max-w-[15rem]"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-brand-900">Connexion</h1>
          <p className="mt-1.5 text-sm text-brand-600">
            Utilisez l'email et le mot de passe fournis par l'administrateur.
          </p>

          <Field
            label="Email"
            className="mt-6"
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
              placeholder="prenom@ste.ci"
              className={fieldErrors.email ? inputErrorCls : ""}
              aria-invalid={emailInvalid || undefined}
              aria-describedby={
                fieldErrors.email ? "login-email-error" : error ? "login-error" : undefined
              }
            />
          </Field>

          <Field
            label="Mot de passe"
            className="mt-4"
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
          <div role="alert" id="login-error" className="mt-4 empty:mt-0">
            {error && (
              <div key={errorKey} className="motion-safe:animate-shake">
                <FormError>{error}</FormError>
              </div>
            )}
          </div>

          <Button type="submit" variant="primary" size="lg" disabled={loading} className="mt-6 w-full">
            {loading && (
              <span
                aria-hidden="true"
                className="size-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin"
              />
            )}
            Se connecter
          </Button>
        </form>
      </div>
    </main>
  );
}
