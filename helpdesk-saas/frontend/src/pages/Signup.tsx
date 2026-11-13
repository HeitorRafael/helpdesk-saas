import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { checkout, PlanTier, registerCompany } from '../lib/api';
import { useAuth } from '../lib/auth-context';

const MIN_SEATS: Record<PlanTier, number> = { STARTER: 2, PROFISSIONAL: 1 };
const PLAN_LABELS: Record<PlanTier, string> = { STARTER: 'Starter — R$97/agente', PROFISSIONAL: 'Profissional — R$179/agente' };

export default function Signup() {
  const navigate = useNavigate();
  const { login: loginCtx } = useAuth();
  const [searchParams] = useSearchParams();

  const initialPlan = (searchParams.get('plano') as PlanTier | null) ?? 'STARTER';

  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [planTier, setPlanTier] = useState<PlanTier>(initialPlan);
  const [seatCount, setSeatCount] = useState(MIN_SEATS[initialPlan]);
  const [voiceAddonEnabled, setVoiceAddonEnabled] = useState(searchParams.get('addon') === 'voz');

  const [cpfCnpj, setCpfCnpj] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiryMonth, setCardExpiryMonth] = useState('');
  const [cardExpiryYear, setCardExpiryYear] = useState('');
  const [cardCcv, setCardCcv] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePlanChange(tier: PlanTier) {
    setPlanTier(tier);
    setSeatCount((prev) => Math.max(prev, MIN_SEATS[tier]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const session = await registerCompany({
        companyName: companyName.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
      });
      loginCtx(session.accessToken, session.user, session.tenant);

      try {
        await checkout(session.accessToken, {
          planTier,
          voiceAddonEnabled,
          seatCount,
          cpfCnpj: cpfCnpj.trim(),
          postalCode: postalCode.trim(),
          addressNumber: addressNumber.trim(),
          phone: phone.trim(),
          creditCard: {
            holderName: cardName.trim(),
            number: cardNumber.replace(/\s/g, ''),
            expiryMonth: cardExpiryMonth.trim(),
            expiryYear: cardExpiryYear.trim(),
            ccv: cardCcv.trim(),
          },
        });
        navigate('/conversas');
      } catch (checkoutErr) {
        // A conta já existe e a sessão já começou — não trava o usuário fora
        // do sistema por causa só do cartão; deixa ele entrar e resolver a
        // cobrança depois em Admin → Assinatura.
        navigate('/conversas');
        // eslint-disable-next-line no-console
        console.error('Falha ao concluir a assinatura:', checkoutErr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-muted px-6 py-12">
      <div className="w-full max-w-xl">
        <h1 className="font-display text-2xl font-semibold text-ink">Criar sua conta</h1>
        <p className="mt-1 text-sm text-ink-soft">
          30 dias grátis — o cartão só é cobrado depois do trial, e você pode cancelar quando quiser.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8" noValidate>
          <fieldset className="flex flex-col gap-4">
            <legend className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">Sua empresa</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nome da empresa" value={companyName} onChange={setCompanyName} />
              <Field label="Seu nome" value={name} onChange={setName} />
              <Field label="E-mail" type="email" value={email} onChange={setEmail} />
              <Field label="Senha" type="password" value={password} onChange={setPassword} placeholder="Mínimo 10 caracteres" />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">Seu plano</legend>
            <div className="flex gap-2">
              {(Object.keys(PLAN_LABELS) as PlanTier[]).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => handlePlanChange(tier)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                    planTier === tier ? 'border-blue-mid bg-blue-mid/5 text-blue-deep' : 'border-border text-ink-soft hover:text-ink'
                  }`}
                >
                  {PLAN_LABELS[tier]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Quantos agentes (mín. {MIN_SEATS[planTier]})
                </label>
                <input
                  type="number"
                  min={MIN_SEATS[planTier]}
                  value={seatCount}
                  onChange={(e) => setSeatCount(Math.max(MIN_SEATS[planTier], Number(e.target.value)))}
                  className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={voiceAddonEnabled}
                  onChange={(e) => setVoiceAddonEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-blue-mid focus:ring-blue-mid"
                />
                Adicionar Ligação (+R$69/agente) — em breve
              </label>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              Pagamento — cobrado só depois dos 30 dias grátis
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="CPF ou CNPJ" value={cpfCnpj} onChange={setCpfCnpj} />
              <Field label="Telefone" value={phone} onChange={setPhone} placeholder="11999998888" />
              <Field label="CEP" value={postalCode} onChange={setPostalCode} />
              <Field label="Número do endereço" value={addressNumber} onChange={setAddressNumber} />
              <Field label="Nome impresso no cartão" value={cardName} onChange={setCardName} />
              <Field label="Número do cartão" value={cardNumber} onChange={setCardNumber} placeholder="0000 0000 0000 0000" />
              <Field label="Mês de validade" value={cardExpiryMonth} onChange={setCardExpiryMonth} placeholder="MM" />
              <Field label="Ano de validade" value={cardExpiryYear} onChange={setCardExpiryYear} placeholder="AAAA" />
              <Field label="CVV" value={cardCcv} onChange={setCardCcv} placeholder="123" />
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand py-3 text-sm font-medium text-white transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Criando…' : 'Começar teste grátis de 30 dias'}
          </button>
        </form>

        <Link to="/login" className="mt-6 block text-center text-sm text-blue-mid hover:underline">
          Já tem conta? Entrar
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
      />
    </div>
  );
}
