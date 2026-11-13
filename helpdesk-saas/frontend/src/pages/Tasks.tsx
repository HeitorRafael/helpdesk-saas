import { useEffect, useState } from 'react';
import { getTasks, Task, updateTaskStatus } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { SECTOR_LABELS } from '../lib/labels';

const SECTORS = ['SUPORTE', 'FINANCEIRO', 'RH', 'GERENCIA'] as const;

export default function Tasks() {
  const { accessToken } = useAuth();
  const [sector, setSector] = useState<(typeof SECTORS)[number]>('SUPORTE');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setTasks(null);
    getTasks(accessToken, sector)
      .then(setTasks)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar tarefas.'));
  }, [accessToken, sector]);

  async function toggleTask(task: Task) {
    if (!accessToken) return;
    const nextStatus = task.status === 'PENDING' ? 'DONE' : 'PENDING';

    // Update otimista — a tela reage na hora, e desfaz se o PATCH falhar.
    setTasks((prev) => prev?.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)) ?? null);

    try {
      await updateTaskStatus(accessToken, task.id, nextStatus);
    } catch (err) {
      setTasks((prev) => prev?.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)) ?? null);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar tarefa.');
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Tarefas por setor</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Sugestões geradas a partir dos padrões encontrados nos chamados.
      </p>

      <div className="mt-6 flex gap-1 rounded-md border border-border bg-surface p-1 w-fit">
        {SECTORS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSector(s)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              sector === s ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {SECTOR_LABELS[s]}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-col gap-3">
        {tasks?.map((task) => (
          <label
            key={task.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <input
              type="checkbox"
              checked={task.status === 'DONE'}
              onChange={() => toggleTask(task)}
              className="mt-1 h-4 w-4 rounded border-border text-blue-mid focus:ring-blue-mid"
            />
            <div>
              <p className={`font-medium ${task.status === 'DONE' ? 'text-ink-soft line-through' : 'text-ink'}`}>
                {task.title}
              </p>
              <p className="mt-1 text-sm text-ink-soft">{task.description}</p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-blue-mid/70">
                {task.insight}
              </p>
            </div>
          </label>
        ))}

        {tasks?.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-ink-soft">
            Nenhuma tarefa para este setor.
          </p>
        )}
      </div>
    </div>
  );
}
