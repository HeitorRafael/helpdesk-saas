import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface AttributeRow {
  id: string;
  name: string;
  value: string;
}

export default function ClientCreate() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function addAttributeRow() {
    setAttributes((prev) => [...prev, { id: crypto.randomUUID(), name: '', value: '' }]);
  }

  function updateAttributeRow(id: string, field: 'name' | 'value', value: string) {
    setAttributes((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  }

  function removeAttributeRow(id: string) {
    setAttributes((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setLoading(true);
    try {
      const client = await createClient(accessToken, {
        name,
        email,
        phone: phone || undefined,
        cnpj: cnpj || undefined,
        attributes: attributes.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), value: a.value.trim() })),
      });
      navigate(`/clientes/${client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar o cliente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <Link to="/clientes" className="font-mono text-xs uppercase tracking-wide text-blue-mid hover:underline">
        ← Voltar para clientes
      </Link>

      <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Novo cliente</h1>
      <p className="mt-1 text-sm text-ink-soft">Cadastre a empresa e o que ela usa/tem — dá pra completar depois.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
              Nome
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Clínica Vitalis"
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contato@empresa.com.br"
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
              Telefone
            </label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 90000-0000"
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
          </div>

          <div>
            <label htmlFor="cnpj" className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
              CNPJ
            </label>
            <input
              id="cnpj"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0001-00"
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Características</span>
            <button
              type="button"
              onClick={addAttributeRow}
              className="font-mono text-[11px] uppercase text-blue-mid hover:underline"
            >
              + Adicionar característica
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Livre — o que fizer sentido pra esse cliente. Ex: "PDV" → "8", "SITEF", "Mix Fiscal" → "Sim".
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {attributes.map((attr) => (
              <div key={attr.id} className="flex items-center gap-2">
                <input
                  value={attr.name}
                  onChange={(e) => updateAttributeRow(attr.id, 'name', e.target.value)}
                  placeholder="Nome (ex: PDV)"
                  className="w-1/2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                />
                <input
                  value={attr.value}
                  onChange={(e) => updateAttributeRow(attr.id, 'value', e.target.value)}
                  placeholder="Valor (ex: 8)"
                  className="w-1/2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                />
                <button
                  type="button"
                  onClick={() => removeAttributeRow(attr.id)}
                  title="Remover"
                  className="shrink-0 rounded-md p-2 text-ink-soft hover:bg-surface-muted hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}

            {attributes.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-ink-soft">
                Nenhuma característica adicionada ainda.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-deep disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Salvando…' : 'Cadastrar cliente'}
        </button>
      </form>
    </div>
  );
}
